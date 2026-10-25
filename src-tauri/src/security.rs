use crate::{
    agent_home,
    policy::{self, Decision, Mode, Origin, Risk},
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+F12";
const DEFAULT_APPROVAL_TTL: u64 = 120;
const MIN_APPROVAL_TTL: u64 = 30;
const MAX_APPROVAL_TTL: u64 = 600;
const MAX_PENDING: usize = 3;
const MAX_FILE_BYTES: usize = 1_000_000;
const RATE_LIMIT: usize = 5;

pub struct SecurityState {
    halted: AtomicBool,
    pending: Mutex<VecDeque<PendingAction>>,
    rate: Mutex<HashMap<String, VecDeque<Instant>>>,
    audit_lock: Mutex<()>,
    shortcut_error: Mutex<Option<String>>,
}

impl SecurityState {
    pub fn new(halted: bool) -> Self {
        Self {
            halted: AtomicBool::new(halted),
            pending: Mutex::new(VecDeque::new()),
            rate: Mutex::new(HashMap::new()),
            audit_lock: Mutex::new(()),
            shortcut_error: Mutex::new(None),
        }
    }

    pub fn is_halted(&self) -> bool {
        self.halted.load(Ordering::SeqCst)
    }

    pub fn set_initial_halted(&self, halted: bool) {
        self.halted.store(halted, Ordering::SeqCst);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "tool", deny_unknown_fields)]
pub enum SimulatedAction {
    #[serde(rename = "workspace.read_file")]
    ReadFile { path: String },
    #[serde(rename = "workspace.write_file")]
    WriteFile { path: String, content: String },
    #[serde(rename = "workspace.delete_file")]
    DeleteFile { path: String },
    #[serde(rename = "simulated.send_message")]
    SendMessage { recipient: String, message: String },
    #[serde(rename = "simulated.payment")]
    Payment { amount_cents: u64, currency: String },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionRequest {
    pub action: SimulatedAction,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSettings {
    pub mode: Mode,
    pub shortcut: String,
    pub shortcut_error: Option<String>,
    pub halted: bool,
    pub approval_ttl_seconds: u64,
    pub overrides: Vec<ToolOverride>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOverride {
    pub tool: String,
    pub more_permissive: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub id: String,
    pub status: String,
    pub message: String,
    pub result: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingView {
    pub id: String,
    pub tool: String,
    pub risk: Risk,
    pub origin: String,
    pub summary: String,
    pub preview: String,
    pub full_preview: bool,
    pub expires_at: u64,
    pub display_hash: String,
}

struct PendingAction {
    id: String,
    action: SimulatedAction,
    origin: Origin,
    risk: Risk,
    rule: &'static str,
    summary: String,
    preview: String,
    digest: String,
    expires: Instant,
    expires_at: u64,
    created_at: Instant,
}

#[derive(Clone, Serialize, Deserialize)]
struct AuditPayload {
    timestamp: u64,
    id: String,
    tool: String,
    risk: Risk,
    mode: Mode,
    origin: String,
    decision: String,
    rule_id: String,
    approval: String,
    latency_ms: u64,
    params_summary: String,
    status: String,
    error: Option<String>,
    previous_hash: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct AuditLine {
    #[serde(flatten)]
    payload: AuditPayload,
    hash: String,
}

trait Tool {
    fn name(&self) -> &'static str;
    fn risk(&self, action: &SimulatedAction) -> Risk;
    fn preview(&self, action: &SimulatedAction, workspace: &Path) -> Result<String, String>;
    fn execute(&self, action: &SimulatedAction, workspace: &Path) -> Result<String, String>;
    fn timeout(&self) -> Duration {
        Duration::from_secs(5)
    }
    fn rate_limit_per_minute(&self) -> usize {
        RATE_LIMIT
    }
}

struct WorkspaceRead;
struct WorkspaceWrite;
struct WorkspaceDelete;
struct SimulatedSend;
struct SimulatedPayment;

impl Tool for WorkspaceRead {
    fn name(&self) -> &'static str {
        "workspace.read_file"
    }
    fn risk(&self, _: &SimulatedAction) -> Risk {
        Risk::Leitura
    }
    fn preview(&self, action: &SimulatedAction, workspace: &Path) -> Result<String, String> {
        Ok(format!(
            "Ler arquivo local:\n{}",
            safe_target(workspace, action_path(action)?)?.display()
        ))
    }
    fn execute(&self, action: &SimulatedAction, workspace: &Path) -> Result<String, String> {
        let path = safe_target(workspace, action_path(action)?)?;
        let metadata = fs::metadata(&path)
            .map_err(|_| "Não foi possível localizar o arquivo do workspace.".to_string())?;
        if metadata.len() > 64 * 1024 {
            return Err("A leitura simulada é limitada a 64 KiB.".into());
        }
        let bytes = fs::read(path)
            .map_err(|_| "Não foi possível ler o arquivo do workspace.".to_string())?;
        if bytes.len() > 64 * 1024 {
            return Err("A leitura simulada é limitada a 64 KiB.".into());
        }
        let text = String::from_utf8(bytes)
            .map_err(|_| "O arquivo não contém texto UTF-8.".to_string())?;
        if contains_secret_marker(&text) {
            return Err(
                "A leitura foi bloqueada porque o arquivo parece conter um segredo.".into(),
            );
        }
        Ok(text)
    }
}

impl Tool for WorkspaceWrite {
    fn name(&self) -> &'static str {
        "workspace.write_file"
    }
    fn risk(&self, _: &SimulatedAction) -> Risk {
        Risk::EscritaReversivel
    }
    fn preview(&self, action: &SimulatedAction, workspace: &Path) -> Result<String, String> {
        let SimulatedAction::WriteFile { content, .. } = action else {
            return Err("Parâmetros incompatíveis.".into());
        };
        Ok(format!(
            "Salvar {} bytes em:\n{}\n\nConteúdo:\n{}",
            content.len(),
            safe_target(workspace, action_path(action)?)?.display(),
            clipped(content, 4_000)
        ))
    }
    fn execute(&self, action: &SimulatedAction, workspace: &Path) -> Result<String, String> {
        let SimulatedAction::WriteFile { content, .. } = action else {
            return Err("Parâmetros incompatíveis.".into());
        };
        if content.len() > MAX_FILE_BYTES {
            return Err("O arquivo excede o limite de 1 MB.".into());
        }
        let path = create_safe_target(workspace, action_path(action)?)?;
        if path.exists() && !path.is_file() {
            return Err("A gravação só pode substituir um arquivo comum.".into());
        }
        let history = workspace.join(".history");
        if let Ok(metadata) = fs::symlink_metadata(&history) {
            if metadata.file_type().is_symlink() || !metadata.is_dir() || has_reparse(&history) {
                return Err("A pasta reservada .history foi alterada.".into());
            }
        }
        fs::create_dir_all(&history)
            .map_err(|_| "Não foi possível preparar o histórico reversível.".to_string())?;
        let key = digest(
            path.strip_prefix(workspace)
                .unwrap_or(&path)
                .to_string_lossy()
                .as_bytes(),
        );
        let unique = format!(
            "{}-{}",
            now_millis(),
            ID_COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let backup = history.join(format!("{key}-{unique}.bak"));
        let temporary = history.join(format!("{key}-{unique}.tmp"));
        let had_previous = path.exists();
        if had_previous {
            fs::rename(&path, &backup).map_err(|_| {
                "Não foi possível mover a versão anterior para o histórico reversível.".to_string()
            })?;
        }
        let write_result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| "Não foi possível preparar a gravação temporária.".to_string())?;
            file.write_all(content.as_bytes())
                .and_then(|_| file.sync_data())
                .map_err(|_| "Não foi possível preparar o novo arquivo.".to_string())?;
            fs::rename(&temporary, &path)
                .map_err(|_| "Não foi possível instalar o novo arquivo.".to_string())
        })();
        if let Err(error) = write_result {
            let _ = fs::remove_file(&temporary);
            if had_previous {
                let _ = fs::rename(&backup, &path);
            }
            return Err(error);
        }
        Ok(format!(
            "Arquivo salvo; a versão anterior foi guardada quando existia: {}",
            path.display()
        ))
    }
}

impl Tool for WorkspaceDelete {
    fn name(&self) -> &'static str {
        "workspace.delete_file"
    }
    fn risk(&self, _: &SimulatedAction) -> Risk {
        Risk::DestrutivoFinanceiro
    }
    fn preview(&self, action: &SimulatedAction, workspace: &Path) -> Result<String, String> {
        Ok(format!(
            "Mover para a lixeira local do workspace:\n{}",
            safe_target(workspace, action_path(action)?)?.display()
        ))
    }
    fn execute(&self, action: &SimulatedAction, workspace: &Path) -> Result<String, String> {
        let path = safe_target(workspace, action_path(action)?)?;
        if !path.is_file() {
            return Err("Somente arquivos comuns podem ser movidos para a lixeira.".into());
        }
        let trash = workspace.join(".trash");
        if let Ok(metadata) = fs::symlink_metadata(&trash) {
            if metadata.file_type().is_symlink() || !metadata.is_dir() || has_reparse(&trash) {
                return Err("A pasta reservada .trash foi alterada.".into());
            }
        }
        fs::create_dir_all(&trash)
            .map_err(|_| "Não foi possível preparar a lixeira local.".to_string())?;
        let key = digest(
            path.strip_prefix(workspace)
                .unwrap_or(&path)
                .to_string_lossy()
                .as_bytes(),
        );
        let destination = trash.join(format!("{key}-{}", now_millis()));
        fs::rename(&path, &destination)
            .map_err(|_| "Não foi possível mover o arquivo para a lixeira.".to_string())?;
        Ok(format!(
            "Arquivo movido para a lixeira local: {}",
            destination.display()
        ))
    }
}

impl Tool for SimulatedSend {
    fn name(&self) -> &'static str {
        "simulated.send_message"
    }
    fn risk(&self, _: &SimulatedAction) -> Risk {
        Risk::ComunicacaoExterna
    }
    fn preview(&self, action: &SimulatedAction, _: &Path) -> Result<String, String> {
        let SimulatedAction::SendMessage { recipient, message } = action else {
            return Err("Parâmetros incompatíveis.".into());
        };
        Ok(format!(
            "Destinatário:\n{}\n\nMensagem simulada; nada será enviado:\n{}",
            clipped(recipient, 300),
            clipped(message, 4_000)
        ))
    }
    fn execute(&self, action: &SimulatedAction, _: &Path) -> Result<String, String> {
        let SimulatedAction::SendMessage { recipient, message } = action else {
            return Err("Parâmetros incompatíveis.".into());
        };
        Ok(format!(
            "Simulação concluída: enviaria {} bytes para {}. Nenhuma mensagem foi enviada.",
            message.len(),
            clipped(recipient, 200)
        ))
    }
}

impl Tool for SimulatedPayment {
    fn name(&self) -> &'static str {
        "simulated.payment"
    }
    fn risk(&self, _: &SimulatedAction) -> Risk {
        Risk::DestrutivoFinanceiro
    }
    fn preview(&self, action: &SimulatedAction, _: &Path) -> Result<String, String> {
        let SimulatedAction::Payment {
            amount_cents,
            currency,
        } = action
        else {
            return Err("Parâmetros incompatíveis.".into());
        };
        Ok(format!(
            "Pagamento bloqueado: {} {}.{:02}. Nenhuma transação será criada.",
            currency,
            amount_cents / 100,
            amount_cents % 100
        ))
    }
    fn execute(&self, _: &SimulatedAction, _: &Path) -> Result<String, String> {
        Err("Pagamentos são bloqueados permanentemente.".into())
    }
}

fn tool_for(action: &SimulatedAction) -> &'static dyn Tool {
    match action {
        SimulatedAction::ReadFile { .. } => &WorkspaceRead,
        SimulatedAction::WriteFile { .. } => &WorkspaceWrite,
        SimulatedAction::DeleteFile { .. } => &WorkspaceDelete,
        SimulatedAction::SendMessage { .. } => &SimulatedSend,
        SimulatedAction::Payment { .. } => &SimulatedPayment,
    }
}

fn action_path(action: &SimulatedAction) -> Result<&str, String> {
    match action {
        SimulatedAction::ReadFile { path }
        | SimulatedAction::WriteFile { path, .. }
        | SimulatedAction::DeleteFile { path } => Ok(path),
        _ => Err("Esta ferramenta não usa um caminho.".into()),
    }
}

fn validate_action(action: &SimulatedAction) -> Result<(), String> {
    match action {
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            relative_path(path)?;
        }
        SimulatedAction::WriteFile { path, content } => {
            relative_path(path)?;
            if content.len() > MAX_FILE_BYTES {
                return Err("O arquivo excede o limite de 1 MB.".into());
            }
        }
        SimulatedAction::SendMessage { recipient, message } => {
            if recipient.trim().is_empty()
                || recipient.chars().count() > 300
                || message.len() > MAX_FILE_BYTES
            {
                return Err("Destinatário ou mensagem excede os limites da simulação.".into());
            }
        }
        SimulatedAction::Payment { currency, .. } => {
            if currency.len() > 10 || !currency.bytes().all(|b| b.is_ascii_alphabetic()) {
                return Err("Moeda inválida.".into());
            }
        }
    }
    Ok(())
}

fn protected_path_block(raw: &str) -> Option<&'static str> {
    let parts: Vec<String> = raw
        .split(['/', '\\'])
        .map(str::to_ascii_lowercase)
        .collect();
    if parts.iter().any(|part| part == "odekrai.md") {
        return Some("fixed_block_core_identity");
    }
    if parts.iter().any(|part| part == "logs") {
        return Some("fixed_block_audit_logs");
    }
    if parts.iter().any(|part| {
        matches!(
            part.as_str(),
            "config" | "configs" | "configuration" | "database" | "databases"
        ) || matches!(
            Path::new(part).extension().and_then(|ext| ext.to_str()),
            Some("db" | "sqlite" | "sqlite3")
        ) || matches!(
            part.as_str(),
            "config.json" | "settings.json" | "permissions.json"
        )
    }) {
        return Some("fixed_block_database_or_config");
    }
    if parts.iter().any(|name| {
        name == ".env"
            || name.starts_with(".env.")
            || name.contains("credential")
            || name.contains("secret")
            || name.ends_with(".pem")
            || name.ends_with(".p12")
            || name.ends_with(".pfx")
            || name == "id_rsa"
            || name == "id_ed25519"
            || name == "known_hosts"
    }) {
        return Some("fixed_block_secret_path");
    }
    None
}

fn contains_secret_marker(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "-----begin private key-----",
        "ghp_",
        "github_pat_",
        "sk-",
        "akia",
        "password=",
        "api_key=",
        "access_token=",
        "secret=",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn relative_path(raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty()
        || raw.len() > 512
        || raw.starts_with(['\\', '/'])
        || raw.contains(':')
        || raw.contains('\0')
    {
        return Err("Informe um caminho relativo válido dentro do workspace.".into());
    }
    let path = PathBuf::from(raw);
    if path.is_absolute()
        || path.components().any(|part| match part {
            Component::Normal(name) => {
                let name = name.to_string_lossy();
                reserved_windows_name(&name)
                    || [".history", ".trash"]
                        .iter()
                        .any(|reserved| name.eq_ignore_ascii_case(reserved))
                    || name.ends_with(['.', ' '])
                    || name
                        .chars()
                        .any(|c| c.is_control() || "<>\"|?*".contains(c))
            }
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => true,
        })
    {
        return Err(
            "O caminho contém traversal, componente reservado ou caractere inválido.".into(),
        );
    }
    Ok(path)
}

fn reserved_windows_name(name: &str) -> bool {
    let base = name
        .trim_end_matches(['.', ' '])
        .split('.')
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    ["CON", "PRN", "AUX", "NUL"].contains(&base.as_str())
        || ["COM", "LPT"].iter().any(|prefix| {
            base.strip_prefix(prefix).is_some_and(|suffix| {
                matches!(
                    suffix,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        })
}

fn has_multiple_links(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt};
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_FLAG_OPEN_REPARSE_POINT,
        };
        if !metadata.is_file() {
            return false;
        }
        let Ok(file) = OpenOptions::new()
            .read(true)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
        else {
            return true;
        };
        let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        (unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0)
            || info.nNumberOfLinks > 1
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        metadata.nlink() > 1
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = metadata;
        false
    }
}

fn has_reparse(path: &Path) -> bool {
    let mut current = PathBuf::new();
    for part in path.components() {
        current.push(part.as_os_str());
        if let Ok(metadata) = fs::symlink_metadata(&current) {
            if metadata.file_type().is_symlink() {
                return true;
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return true;
                }
            }
        }
    }
    false
}

fn safe_target(root: &Path, raw: &str) -> Result<PathBuf, String> {
    let relative = relative_path(raw)?;
    let target = root.join(relative);
    if has_reparse(&target) {
        return Err("O caminho contém link ou junction.".into());
    }
    if target.exists() {
        if has_multiple_links(&target) {
            return Err("Arquivos com hard links não podem ser usados pelo workspace.".into());
        }
        let canonical = target
            .canonicalize()
            .map_err(|_| "Não foi possível validar o caminho.".to_string())?;
        if !canonical.starts_with(root) {
            return Err("O caminho sai do workspace.".into());
        }
        Ok(canonical)
    } else {
        let parent = target
            .parent()
            .ok_or("O caminho não tem uma pasta válida.")?;
        let canonical_parent = parent.canonicalize().map_err(|_| {
            "A pasta do arquivo não existe; crie-a pelo workspace antes.".to_string()
        })?;
        if !canonical_parent.starts_with(root) {
            return Err("O caminho sai do workspace.".into());
        }
        Ok(target)
    }
}

fn preview_target(root: &Path, raw: &str) -> Result<PathBuf, String> {
    let target = root.join(relative_path(raw)?);
    let mut ancestor = target.as_path();
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or("O caminho não tem uma pasta válida.")?;
    }
    if has_reparse(ancestor) {
        return Err("A pasta de destino contém link ou junction.".into());
    }
    let canonical = ancestor
        .canonicalize()
        .map_err(|_| "Não foi possível validar o caminho.".to_string())?;
    if !canonical.starts_with(root) {
        return Err("O caminho sai do workspace.".into());
    }
    Ok(target)
}

fn create_safe_target(root: &Path, raw: &str) -> Result<PathBuf, String> {
    let relative = relative_path(raw)?;
    let mut parent = root.to_path_buf();
    for component in relative.parent().into_iter().flat_map(Path::components) {
        parent.push(component.as_os_str());
        if fs::symlink_metadata(&parent).is_err() {
            fs::create_dir(&parent)
                .map_err(|_| "Não foi possível criar a pasta no workspace.".to_string())?;
        }
        if has_reparse(&parent) || !parent.is_dir() {
            return Err("A pasta de destino contém link ou não é uma pasta.".into());
        }
    }
    let target = root.join(relative);
    if has_reparse(&target) {
        return Err("O arquivo de destino contém link ou junction.".into());
    }
    if has_multiple_links(&target) {
        return Err("Arquivos com hard links não podem ser alterados pelo workspace.".into());
    }
    Ok(target)
}

fn clipped(text: &str, max: usize) -> String {
    let mut output: String = text.chars().take(max).collect();
    if text.chars().count() > max {
        output.push_str("\n[conteúdo truncado]");
    }
    output
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn display_hash_matches(action: &SimulatedAction, expected: &str, shown: &str) -> bool {
    if expected != shown {
        return false;
    }
    serde_json::to_string(action)
        .ok()
        .is_some_and(|value| digest(value.as_bytes()) == expected)
}

fn queue_has_capacity(queue: &VecDeque<PendingAction>) -> bool {
    queue.len() < MAX_PENDING
}

fn is_expired(expires: Instant, now: Instant) -> bool {
    now >= expires
}

fn take_pending_approval(
    queue: &mut VecDeque<PendingAction>,
    id: &str,
    display_hash: &str,
) -> Result<PendingAction, &'static str> {
    let Some(item) = queue.front() else {
        return Err("approval_unavailable");
    };
    if item.id != id {
        return Err("approval_stale");
    }
    if !display_hash_matches(&item.action, &item.digest, display_hash) {
        return Err("approval_parameters_changed");
    }
    Ok(queue.pop_front().expect("front exists"))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
fn id() -> String {
    format!(
        "act-{}-{}",
        now_millis(),
        ID_COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}
static ID_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Não foi possível localizar os dados do aplicativo.".to_string())?;
    fs::create_dir_all(&dir)
        .map_err(|_| "Não foi possível preparar os dados do aplicativo.".to_string())?;
    let db = Connection::open(dir.join("permissions.sqlite3"))
        .map_err(|_| "Não foi possível abrir as configurações de segurança.".to_string())?;
    let schema = format!("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS permission_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tool_overrides (tool TEXT PRIMARY KEY, more_permissive INTEGER NOT NULL CHECK(more_permissive IN (0,1))); INSERT OR IGNORE INTO permission_settings(key,value) VALUES ('mode','sempre_perguntar'),('shortcut','Ctrl+Shift+F12'),('halted','false'),('approval_ttl_seconds','{DEFAULT_APPROVAL_TTL}');");
    db.execute_batch(&schema)
        .map_err(|_| "Não foi possível preparar as configurações de segurança.".to_string())?;
    Ok(db)
}

fn db_setting(app: &tauri::AppHandle, key: &str) -> Result<String, String> {
    database(app)?
        .query_row(
            "SELECT value FROM permission_settings WHERE key=?1",
            [key],
            |row| row.get(0),
        )
        .map_err(|_| "Não foi possível ler as configurações de segurança.".into())
}

fn set_db_setting(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
    database(app)?.execute("INSERT INTO permission_settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(|_| "Não foi possível salvar as configurações de segurança.".to_string())?;
    Ok(())
}

pub fn effective_mode(app: &tauri::AppHandle) -> Result<Mode, String> {
    parse_mode(&db_setting(app, "mode")?)
}

fn parse_mode(value: &str) -> Result<Mode, String> {
    match value {
        "sempre_perguntar" => Ok(Mode::SemprePerguntar),
        "aprovar_por_mim" => Ok(Mode::AprovarPorMim),
        "controle_total" => Ok(Mode::ControleTotal),
        _ => Err("Modo de permissão inválido; ações bloqueadas.".into()),
    }
}

impl Mode {
    pub fn label(self) -> &'static str {
        match self {
            Mode::SemprePerguntar => "sempre_perguntar",
            Mode::AprovarPorMim => "aprovar_por_mim",
            Mode::ControleTotal => "controle_total",
        }
    }
}

fn overrides(app: &tauri::AppHandle) -> Result<Vec<ToolOverride>, String> {
    let db = database(app)?;
    let mut stmt = db
        .prepare("SELECT tool,more_permissive FROM tool_overrides ORDER BY tool")
        .map_err(|_| "Não foi possível ler as exceções de ferramenta.".to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ToolOverride {
                tool: row.get(0)?,
                more_permissive: row.get::<_, i64>(1)? != 0,
            })
        })
        .map_err(|_| "Não foi possível ler as exceções de ferramenta.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível ler as exceções de ferramenta.".into())
}

fn override_enabled(app: &tauri::AppHandle, tool: &str) -> Result<bool, String> {
    database(app)?
        .query_row(
            "SELECT more_permissive FROM tool_overrides WHERE tool=?1",
            [tool],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| value.unwrap_or(0) != 0)
        .map_err(|_| "Não foi possível ler a exceção da ferramenta.".into())
}

#[tauri::command]
pub async fn get_permission_settings(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
) -> Result<PermissionSettings, String> {
    super::require_main(&caller)?;
    let shortcut_error = state
        .shortcut_error
        .lock()
        .map_err(|_| "Estado do atalho indisponível.")?
        .clone();
    Ok(PermissionSettings {
        mode: effective_mode(&app)?,
        shortcut: db_setting(&app, "shortcut")?,
        shortcut_error,
        halted: state.is_halted(),
        approval_ttl_seconds: db_setting(&app, "approval_ttl_seconds")?
            .parse()
            .map_err(|_| "Tempo de aprovação inválido; ações bloqueadas.")?,
        overrides: overrides(&app)?,
    })
}

#[cfg(windows)]
async fn native_confirm(message: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || native_confirm_blocking(&message))
        .await
        .unwrap_or(false)
}

#[cfg(windows)]
fn native_confirm_blocking(message: &str) -> bool {
    use std::ffi::c_void;
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MessageBoxW(hwnd: *mut c_void, text: *const u16, caption: *const u16, kind: u32) -> i32;
    }
    let text: Vec<u16> = format!("{message}\0").encode_utf16().collect();
    let caption: Vec<u16> = "Confirmação do OdeKrai\0".encode_utf16().collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            0x00000004 | 0x00000030 | 0x0000001000 | 0x00000100,
        ) == 6
    }
}

#[cfg(not(windows))]
async fn native_confirm(_: String) -> bool {
    false
}

#[tauri::command]
pub async fn set_permission_mode(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    mode: Mode,
) -> Result<(), String> {
    super::require_main(&caller)?;
    let current = effective_mode(&app)?;
    if current == mode {
        return Ok(());
    }
    if !native_confirm(format!("Alterar o modo de permissão de {} para {}? Esta confirmação ocorre em uma janela nativa do Windows.", current.label(), mode.label())).await {
        return Err("Alteração de modo cancelada pelo usuário.".into());
    }
    set_db_setting(&app, "mode", mode.label())?;
    let _ = app.emit("permission-settings-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn set_tool_override(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    tool: String,
    more_permissive: bool,
) -> Result<(), String> {
    super::require_main(&caller)?;
    if !known_tool(&tool) {
        return Err("Ferramenta desconhecida.".into());
    }
    if more_permissive && !override_enabled(&app, &tool)? && !native_confirm(format!("Permitir que {tool} execute com menos confirmações que o modo global? Esta exceção nunca ignora bloqueios fixos nem conteúdo externo.")).await {
        return Err("Exceção não ativada.".into());
    }
    database(&app)?.execute("INSERT INTO tool_overrides(tool,more_permissive) VALUES (?1,?2) ON CONFLICT(tool) DO UPDATE SET more_permissive=excluded.more_permissive", params![tool, more_permissive as i64]).map_err(|_| "Não foi possível salvar a exceção.".to_string())?;
    let _ = app.emit("permission-settings-updated", ());
    Ok(())
}

fn known_tool(tool: &str) -> bool {
    [
        "workspace.write_file",
        "workspace.delete_file",
        "simulated.send_message",
    ]
    .contains(&tool)
}

#[tauri::command]
pub fn set_kill_shortcut(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    shortcut: String,
) -> Result<(), String> {
    super::require_main(&caller)?;
    if shortcut.len() > 80 || shortcut.trim() != shortcut || !shortcut.contains('+') {
        return Err("Formato de atalho inválido.".into());
    }
    let previous = db_setting(&app, "shortcut")?;
    if previous == shortcut {
        return Ok(());
    }
    let manager = app.global_shortcut();
    let _ = manager.unregister(previous.as_str());
    if let Err(error) = manager.register(shortcut.as_str()) {
        let _ = manager.register(previous.as_str());
        let message = format!("O atalho está em conflito ou não pôde ser registrado: {error}");
        *app.state::<SecurityState>()
            .shortcut_error
            .lock()
            .map_err(|_| "Estado do atalho indisponível.")? = Some(message.clone());
        return Err(message);
    }
    if let Err(error) = set_db_setting(&app, "shortcut", &shortcut) {
        let _ = manager.unregister(shortcut.as_str());
        let _ = manager.register(previous.as_str());
        return Err(error);
    }
    *app.state::<SecurityState>()
        .shortcut_error
        .lock()
        .map_err(|_| "Estado do atalho indisponível.")? = None;
    let _ = app.emit("permission-settings-updated", ());
    Ok(())
}

#[tauri::command]
pub fn set_approval_ttl(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    seconds: u64,
) -> Result<(), String> {
    super::require_main(&caller)?;
    if !(MIN_APPROVAL_TTL..=MAX_APPROVAL_TTL).contains(&seconds) {
        return Err(format!(
            "O prazo deve ficar entre {MIN_APPROVAL_TTL} e {MAX_APPROVAL_TTL} segundos."
        ));
    }
    set_db_setting(&app, "approval_ttl_seconds", &seconds.to_string())?;
    let _ = app.emit("permission-settings-updated", ());
    Ok(())
}

fn action_metadata(action: &SimulatedAction) -> (&'static str, Risk, bool, Option<&'static str>) {
    let tool = tool_for(action);
    let workspace_action = matches!(
        action,
        SimulatedAction::ReadFile { .. }
            | SimulatedAction::WriteFile { .. }
            | SimulatedAction::DeleteFile { .. }
    );
    let fixed = match action {
        SimulatedAction::Payment { .. } => Some("fixed_block_payment"),
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            protected_path_block(path)
        }
        SimulatedAction::WriteFile { path, content } => protected_path_block(path)
            .or_else(|| contains_secret_marker(content).then_some("fixed_block_secret_storage")),
        SimulatedAction::SendMessage { message, .. } if contains_secret_marker(message) => {
            Some("fixed_block_secret_exfiltration")
        }
        _ => None,
    };
    (tool.name(), tool.risk(action), workspace_action, fixed)
}

fn summary(action: &SimulatedAction) -> String {
    match action {
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            format!("{}: {}", tool_for(action).name(), path)
        }
        SimulatedAction::WriteFile { path, content } => {
            format!("Salvar arquivo: {path} ({} bytes)", content.len())
        }
        SimulatedAction::SendMessage { recipient, .. } => {
            format!("Mensagem simulada para {}", clipped(recipient, 200))
        }
        SimulatedAction::Payment {
            amount_cents,
            currency,
        } => format!("Pagamento bloqueado: {currency} {amount_cents}"),
    }
}

fn audit_params(action: &SimulatedAction) -> String {
    match action {
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            format!("path={path}")
        }
        SimulatedAction::WriteFile { path, content } => format!(
            "path={path}; bytes={}; sha256={}; prefix={}",
            content.len(),
            digest(content.as_bytes()),
            if contains_secret_marker(content) {
                "[redigido]".into()
            } else {
                clipped(content, 64)
            }
        ),
        SimulatedAction::SendMessage { recipient, message } => format!(
            "recipient={}; bytes={}; sha256={}; prefix={}",
            clipped(recipient, 200),
            message.len(),
            digest(message.as_bytes()),
            if contains_secret_marker(message) {
                "[redigido]".into()
            } else {
                clipped(message, 64)
            }
        ),
        SimulatedAction::Payment {
            amount_cents,
            currency,
        } => format!("amount_cents={amount_cents}; currency={currency}"),
    }
}

fn preview_for(app: &tauri::AppHandle, action: &SimulatedAction) -> Result<String, String> {
    let workspace = if matches!(
        action,
        SimulatedAction::ReadFile { .. }
            | SimulatedAction::WriteFile { .. }
            | SimulatedAction::DeleteFile { .. }
    ) {
        agent_home::workspace_path(app)?
    } else {
        PathBuf::new()
    };
    if matches!(action, SimulatedAction::WriteFile { .. }) {
        return Ok(format!(
            "Destino no workspace:\n{}\n\n{}",
            preview_target(&workspace, action_path(action)?)?.display(),
            tool_for(action).preview(action, &workspace)?
        ));
    }
    tool_for(action).preview(action, &workspace)
}

fn append_audit(
    app: &tauri::AppHandle,
    state: &SecurityState,
    mut payload: AuditPayload,
) -> Result<(), String> {
    let _lock = state
        .audit_lock
        .lock()
        .map_err(|_| "Trava da auditoria indisponível; ação bloqueada.".to_string())?;
    let logs = agent_home::audit_logs_path(app)?;
    let mut previous = String::new();
    if let Some(last) = verify_audit_path(&logs)?.last() {
        previous = last.hash.clone();
    }
    payload.previous_hash = previous;
    let serialized = serde_json::to_vec(&payload)
        .map_err(|_| "Não foi possível preparar a auditoria; ação bloqueada.".to_string())?;
    let line = AuditLine {
        hash: digest(&serialized),
        payload,
    };
    let day = now_secs() / 86_400;
    let path = logs.join(format!("{day}.jsonl"));
    if has_reparse(&path) {
        return Err("O arquivo de auditoria foi redirecionado; ação bloqueada.".into());
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|_| "Não foi possível gravar auditoria; ação bloqueada.".to_string())?;
    serde_json::to_writer(&mut file, &line)
        .map_err(|_| "Não foi possível gravar auditoria; ação bloqueada.".to_string())?;
    file.write_all(b"\n")
        .and_then(|_| file.sync_data())
        .map_err(|_| "Não foi possível confirmar a auditoria; ação bloqueada.".to_string())
}

fn audit_files(logs: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for entry in
        fs::read_dir(logs).map_err(|_| "Não foi possível ler a pasta de auditoria.".to_string())?
    {
        let entry = entry.map_err(|_| "Não foi possível ler a pasta de auditoria.".to_string())?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "jsonl") {
            if has_reparse(&path) || !path.is_file() {
                return Err("A auditoria contém um caminho inesperado.".into());
            }
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn read_audit_lines(path: &Path) -> Result<Vec<AuditLine>, String> {
    let file =
        fs::File::open(path).map_err(|_| "Não foi possível verificar a auditoria.".to_string())?;
    let reader = BufReader::new(file);
    let mut lines = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|_| "Não foi possível ler a auditoria.".to_string())?;
        let parsed: AuditLine = serde_json::from_str(&line)
            .map_err(|_| "A cadeia de auditoria está inválida.".to_string())?;
        let serialized = serde_json::to_vec(&parsed.payload)
            .map_err(|_| "A cadeia de auditoria está inválida.".to_string())?;
        if parsed.hash != digest(&serialized) {
            return Err("A cadeia de auditoria foi alterada.".into());
        }
        lines.push(parsed);
    }
    Ok(lines)
}

fn verify_audit_path(logs: &Path) -> Result<Vec<AuditLine>, String> {
    let mut previous = String::new();
    let mut all = Vec::new();
    for file in audit_files(logs)? {
        for line in read_audit_lines(&file)? {
            if line.payload.previous_hash != previous {
                return Err("A cadeia de auditoria está quebrada.".into());
            }
            previous = line.hash.clone();
            all.push(line);
        }
    }
    Ok(all)
}

#[allow(clippy::too_many_arguments)]
fn record(
    app: &tauri::AppHandle,
    state: &SecurityState,
    id: &str,
    tool: &str,
    risk: Risk,
    origin: &Origin,
    decision: &str,
    rule: &str,
    approval: &str,
    latency: u64,
    params_summary: String,
    status: &str,
    error: Option<String>,
) -> Result<(), String> {
    let mode = effective_mode(app)?;
    let origin = match origin {
        Origin::User => "usuário".to_string(),
        Origin::Model => "modelo".to_string(),
        Origin::ExternalContent(source) => format!("conteúdo externo: {}", clipped(source, 120)),
    };
    append_audit(
        app,
        state,
        AuditPayload {
            timestamp: now_secs(),
            id: id.into(),
            tool: tool.into(),
            risk,
            mode,
            origin,
            decision: decision.into(),
            rule_id: rule.into(),
            approval: approval.into(),
            latency_ms: latency,
            params_summary,
            status: status.into(),
            error,
            previous_hash: String::new(),
        },
    )
}

fn allowed_rate(state: &SecurityState, tool: &dyn Tool) -> Result<bool, String> {
    let mut rate = state
        .rate
        .lock()
        .map_err(|_| "Limite de frequência indisponível.".to_string())?;
    let now = Instant::now();
    let entries = rate.entry(tool.name().into()).or_default();
    while entries
        .front()
        .is_some_and(|at| now.duration_since(*at) > Duration::from_secs(60))
    {
        entries.pop_front();
    }
    if entries.len() >= tool.rate_limit_per_minute() {
        return Ok(false);
    }
    entries.push_back(now);
    Ok(true)
}

fn execute_action(action: &SimulatedAction, app: &tauri::AppHandle) -> Result<String, String> {
    let workspace_action = matches!(
        action,
        SimulatedAction::ReadFile { .. }
            | SimulatedAction::WriteFile { .. }
            | SimulatedAction::DeleteFile { .. }
    );
    let workspace = if workspace_action {
        agent_home::workspace_path(app)?
    } else {
        PathBuf::new()
    };
    let tool = tool_for(action);
    let started = Instant::now();
    let result = tool.execute(action, &workspace);
    if started.elapsed() > tool.timeout() {
        return Err("A ferramenta simulada excedeu o tempo limite.".into());
    }
    result
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn submit_simulated_action(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
    request: ActionRequest,
) -> Result<ActionResult, String> {
    super::require_main(&caller)?;
    submit_action(&app, &state, request.action, Origin::User)
}

fn submit_action(
    app: &tauri::AppHandle,
    state: &SecurityState,
    action: SimulatedAction,
    origin: Origin,
) -> Result<ActionResult, String> {
    if state.is_halted() {
        return Err(
            "O OdeKrai está parado. Retome na janela principal para permitir novas ações.".into(),
        );
    }
    let (tool_name, risk, inside, fixed) = action_metadata(&action);
    let id = id();
    let summary = summary(&action);
    if let Err(error) = validate_action(&action) {
        record(
            app,
            state,
            &id,
            tool_name,
            risk,
            &origin,
            "deny",
            "fixed_invalid_parameters",
            "not_required",
            0,
            audit_params(&action),
            "denied",
            Some(error.clone()),
        )?;
        return Ok(ActionResult {
            id,
            status: "denied".into(),
            message: error,
            result: None,
        });
    }
    let preview = match preview_for(app, &action) {
        Ok(preview) => preview,
        Err(error) => {
            record(
                app,
                state,
                &id,
                tool_name,
                risk,
                &origin,
                "deny",
                "target_validation_failed",
                "not_required",
                0,
                audit_params(&action),
                "denied",
                Some(error.clone()),
            )?;
            return Ok(ActionResult {
                id,
                status: "denied".into(),
                message: error,
                result: None,
            });
        }
    };
    let mode = effective_mode(app)?;
    let override_on = override_enabled(app, tool_name)?;
    let decision = policy::decide(mode, risk, &origin, inside, fixed, override_on);
    let (decision_name, rule) = match decision {
        Decision::Allow(rule) => ("allow", rule),
        Decision::AskUser(rule) => ("ask_user", rule),
        Decision::Deny(rule) => ("deny", rule),
    };
    if matches!(&decision, Decision::Deny(_)) {
        record(
            app,
            state,
            &id,
            tool_name,
            risk,
            &origin,
            decision_name,
            rule,
            "not_required",
            0,
            audit_params(&action),
            "denied",
            Some(rule.into()),
        )?;
        return Ok(ActionResult {
            id,
            status: "denied".into(),
            message: format!("Ação bloqueada pela regra {rule}."),
            result: None,
        });
    }
    if !allowed_rate(state, tool_for(&action))? {
        record(
            app,
            state,
            &id,
            tool_name,
            risk,
            &origin,
            "deny",
            "rate_limit",
            "not_required",
            0,
            audit_params(&action),
            "denied",
            Some("Limite de frequência excedido".into()),
        )?;
        return Ok(ActionResult {
            id,
            status: "denied".into(),
            message: "Limite de frequência da ferramenta atingido.".into(),
            result: None,
        });
    }
    match decision {
        Decision::Allow(rule) => {
            record(
                app,
                state,
                &id,
                tool_name,
                risk,
                &origin,
                "allow",
                rule,
                "not_required",
                0,
                audit_params(&action),
                "started",
                None,
            )?;
            let result = execute_action(&action, app);
            let status = if result.is_ok() {
                "completed"
            } else {
                "failed"
            };
            let error = result.as_ref().err().cloned();
            record(
                app,
                state,
                &id,
                tool_name,
                risk,
                &origin,
                "allow",
                rule,
                "not_required",
                0,
                audit_params(&action),
                status,
                error.clone(),
            )?;
            Ok(ActionResult {
                id,
                status: status.into(),
                message: error.unwrap_or_else(|| "Ação concluída.".into()),
                result: result.ok(),
            })
        }
        Decision::AskUser(rule) => {
            let mut pending = state
                .pending
                .lock()
                .map_err(|_| "Fila de aprovação indisponível.".to_string())?;
            if !queue_has_capacity(&pending) {
                drop(pending);
                record(
                    app,
                    state,
                    &id,
                    tool_name,
                    risk,
                    &origin,
                    "deny",
                    "approval_queue_full",
                    "denied",
                    0,
                    audit_params(&action),
                    "denied",
                    Some("Fila de aprovação cheia".into()),
                )?;
                return Ok(ActionResult {
                    id,
                    status: "denied".into(),
                    message: "Fila de aprovação cheia; a ação foi negada.".into(),
                    result: None,
                });
            }
            let digest = digest(
                serde_json::to_string(&action)
                    .map_err(|_| "Não foi possível validar os parâmetros.")?
                    .as_bytes(),
            );
            let ttl = db_setting(app, "approval_ttl_seconds")?
                .parse::<u64>()
                .map_err(|_| "Prazo de aprovação inválido; a ação foi bloqueada.")?;
            if !(MIN_APPROVAL_TTL..=MAX_APPROVAL_TTL).contains(&ttl) {
                return Err("Prazo de aprovação inválido; a ação foi bloqueada.".into());
            }
            let approval_ttl = Duration::from_secs(ttl);
            let expires_at = now_secs() + approval_ttl.as_secs();
            record(
                app,
                state,
                &id,
                tool_name,
                risk,
                &origin,
                "ask_user",
                rule,
                "pending",
                0,
                audit_params(&action),
                "awaiting_approval",
                None,
            )?;
            pending.push_back(PendingAction {
                id: id.clone(),
                action: action.clone(),
                origin: origin.clone(),
                risk,
                rule,
                summary,
                preview,
                digest: digest.clone(),
                expires: Instant::now() + approval_ttl,
                expires_at,
                created_at: Instant::now(),
            });
            drop(pending);
            if let Err(error) = open_approval(app) {
                if let Ok(mut pending) = state.pending.lock() {
                    pending.retain(|item| item.id != id);
                }
                let _ = record(
                    app,
                    state,
                    &id,
                    tool_name,
                    risk,
                    &origin,
                    "deny",
                    "approval_window_failed",
                    "unavailable",
                    0,
                    audit_params(&action),
                    "denied",
                    Some(error.clone()),
                );
                return Err(error);
            }
            let _ = app.emit("approval-updated", ());
            let _ = app.emit("companion-state", serde_json::json!({"type":"activity","state":"awaiting_approval","message":"Aguardando aprovação"}));
            Ok(ActionResult {
                id,
                status: "awaiting_approval".into(),
                message: "Ação aguardando aprovação na janela do OdeKrai.".into(),
                result: None,
            })
        }
        Decision::Deny(_) => unreachable!(),
    }
}

fn open_approval(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("approval") {
        window
            .show()
            .and_then(|_| window.set_focus())
            .map_err(|_| "Não foi possível mostrar a janela de aprovação.".to_string())?;
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(app, "approval", WebviewUrl::App("index.html".into()))
        .title("Aprovação de ação — OdeKrai")
        .inner_size(560.0, 620.0)
        .min_inner_size(420.0, 420.0)
        .always_on_top(true)
        .focusable(true)
        .focused(true)
        .resizable(true)
        .skip_taskbar(false)
        .build()
        .map_err(|_| "Não foi possível abrir a janela de aprovação.".to_string())?;
    let handle = app.clone();
    let close_window = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let Some(state) = handle.try_state::<SecurityState>() else {
                return;
            };
            let item = state.pending.lock().ok().and_then(|mut queue| {
                let item = queue.pop_front();
                if !queue.is_empty() {
                    api.prevent_close();
                }
                item
            });
            if let Some(item) = item {
                let _ = record(
                    &handle,
                    &state,
                    &item.id,
                    tool_for(&item.action).name(),
                    item.risk,
                    &item.origin,
                    "deny",
                    "approval_window_closed",
                    "denied",
                    item.created_at.elapsed().as_millis() as u64,
                    audit_params(&item.action),
                    "denied",
                    None,
                );
                if state
                    .pending
                    .lock()
                    .map(|queue| !queue.is_empty())
                    .unwrap_or(false)
                {
                    let _ = handle.emit("approval-updated", ());
                    let _ = close_window.set_focus();
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn get_pending_approval(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
) -> Result<Option<PendingView>, String> {
    super::require_caller(&caller, &["approval"])?;
    let mut pending = state
        .pending
        .lock()
        .map_err(|_| "Fila de aprovação indisponível.".to_string())?;
    while pending
        .front()
        .is_some_and(|item| is_expired(item.expires, Instant::now()))
    {
        let expired = pending.pop_front().expect("front exists");
        let tool = tool_for(&expired.action).name();
        record(
            &app,
            &state,
            &expired.id,
            tool,
            expired.risk,
            &expired.origin,
            "deny",
            "approval_expired",
            "expired",
            expired.created_at.elapsed().as_millis() as u64,
            audit_params(&expired.action),
            "denied",
            Some("Aprovação expirou".into()),
        )?;
    }
    let Some(item) = pending.front() else {
        drop(pending);
        close_approval_if_empty(&app, &state);
        return Ok(None);
    };
    Ok(Some(PendingView {
        id: item.id.clone(),
        tool: tool_for(&item.action).name().into(),
        risk: item.risk,
        origin: match &item.origin {
            Origin::User => "Ação solicitada pelo usuário".into(),
            Origin::Model => "Ação proposta pelo modelo".into(),
            Origin::ExternalContent(source) => {
                format!("Veio de conteúdo externo: {}", clipped(source, 120))
            }
        },
        summary: item.summary.clone(),
        full_preview: item.preview.chars().count() > 4_000,
        preview: clipped(&item.preview, 4_000),
        expires_at: item.expires_at,
        display_hash: item.digest.clone(),
    }))
}

#[tauri::command]
pub fn get_full_approval_preview(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
    id: String,
    display_hash: String,
) -> Result<String, String> {
    super::require_caller(&caller, &["approval"])?;
    let pending = state
        .pending
        .lock()
        .map_err(|_| "Fila de aprovação indisponível.".to_string())?;
    let item = pending
        .front()
        .ok_or("A aprovação não está mais disponível.")?;
    if item.id != id || item.digest != display_hash {
        return Err("A prévia não corresponde à ação pendente.".into());
    }
    if !display_hash_matches(&item.action, &item.digest, &display_hash) {
        return Err("Os parâmetros mudaram; a prévia foi bloqueada.".into());
    }
    let preview = preview_for(&app, &item.action)?;
    if preview.len() > 16 * 1024 {
        return Err("A prévia excede o limite de 16 KiB.".into());
    }
    Ok(preview)
}

#[tauri::command]
pub fn approval_respond(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
    id: String,
    display_hash: String,
    approve: bool,
) -> Result<ActionResult, String> {
    super::require_caller(&caller, &["approval"])?;
    let mut pending = state
        .pending
        .lock()
        .map_err(|_| "Fila de aprovação indisponível.".to_string())?;
    let Some(item) = pending.front() else {
        return Err("A aprovação não está mais disponível.".into());
    };
    if item.id != id {
        return Err("A aprovação está desatualizada.".into());
    }
    if !display_hash_matches(&item.action, &item.digest, &display_hash) {
        return Err("Os parâmetros exibidos mudaram; a ação foi recusada.".into());
    }
    let item = take_pending_approval(&mut pending, &id, &display_hash)
        .map_err(|_| "A aprovação não corresponde à ação pendente.".to_string())?;
    drop(pending);
    let tool = tool_for(&item.action).name();
    if is_expired(item.expires, Instant::now()) || state.is_halted() || !approve {
        let reason = if is_expired(item.expires, Instant::now()) {
            "approval_expired"
        } else if state.is_halted() {
            "kill_switch"
        } else {
            "user_denied"
        };
        record(
            &app,
            &state,
            &item.id,
            tool,
            item.risk,
            &item.origin,
            "deny",
            reason,
            if approve {
                "expired_or_halted"
            } else {
                "denied"
            },
            item.created_at.elapsed().as_millis() as u64,
            audit_params(&item.action),
            "denied",
            None,
        )?;
        close_approval_if_empty(&app, &state);
        return Ok(ActionResult {
            id: item.id,
            status: "denied".into(),
            message: "Ação negada.".into(),
            result: None,
        });
    }
    record(
        &app,
        &state,
        &item.id,
        tool,
        item.risk,
        &item.origin,
        "allow",
        item.rule,
        "approved_once",
        item.created_at.elapsed().as_millis() as u64,
        audit_params(&item.action),
        "started",
        None,
    )?;
    let result = execute_action(&item.action, &app);
    let error = result.as_ref().err().cloned();
    let status = if error.is_some() {
        "failed"
    } else {
        "completed"
    };
    record(
        &app,
        &state,
        &item.id,
        tool,
        item.risk,
        &item.origin,
        "allow",
        item.rule,
        "approved_once",
        item.created_at.elapsed().as_millis() as u64,
        audit_params(&item.action),
        status,
        error.clone(),
    )?;
    close_approval_if_empty(&app, &state);
    let next_activity = if state
        .pending
        .lock()
        .map(|queue| !queue.is_empty())
        .unwrap_or(true)
    {
        "awaiting_approval"
    } else if status == "completed" {
        "completed"
    } else {
        "error"
    };
    let _ = app.emit(
        "companion-state",
        serde_json::json!({"type":"activity","state":next_activity}),
    );
    Ok(ActionResult {
        id: item.id,
        status: status.into(),
        message: error.unwrap_or_else(|| "Ação aprovada e concluída.".into()),
        result: result.ok(),
    })
}

fn close_approval_if_empty(app: &tauri::AppHandle, state: &SecurityState) {
    if state.pending.lock().map(|p| p.is_empty()).unwrap_or(false) {
        if let Some(window) = app.get_webview_window("approval") {
            let _ = window.close();
        }
    }
}

#[tauri::command]
pub fn list_audit(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
) -> Result<Vec<AuditLine>, String> {
    super::require_main(&caller)?;
    let _lock = state
        .audit_lock
        .lock()
        .map_err(|_| "Trava da auditoria indisponível.".to_string())?;
    let logs = agent_home::audit_logs_path(&app)?;
    let all = verify_audit_path(&logs)?;
    Ok(all.into_iter().rev().take(500).collect())
}

#[tauri::command]
pub fn verify_audit(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
) -> Result<bool, String> {
    super::require_main(&caller)?;
    let _lock = state
        .audit_lock
        .lock()
        .map_err(|_| "Trava da auditoria indisponível.".to_string())?;
    verify_audit_path(&agent_home::audit_logs_path(&app)?).map(|_| true)
}

fn set_halted(
    app: &tauri::AppHandle,
    state: &SecurityState,
    halted: bool,
    reason: &'static str,
) -> Result<(), String> {
    if halted {
        state.halted.store(true, Ordering::SeqCst);
        let persistence = set_db_setting(app, "halted", "true");
        crate::providers::cancel_all(app);
        let mut pending = state
            .pending
            .lock()
            .map_err(|_| "Fila de aprovação indisponível.".to_string())?;
        while let Some(item) = pending.pop_front() {
            let _ = record(
                app,
                state,
                &item.id,
                tool_for(&item.action).name(),
                item.risk,
                &item.origin,
                "deny",
                "kill_switch",
                "cancelled",
                item.created_at.elapsed().as_millis() as u64,
                audit_params(&item.action),
                "denied",
                Some("Interrompido pelo kill switch".into()),
            );
        }
        drop(pending);
        if let Some(window) = app.get_webview_window("approval") {
            let _ = window.close();
        }
        let _ = app.emit("companion-state",serde_json::json!({"type":"activity","state":"paused","message":"Parado pelo kill switch"}));
        let _ = app.emit("security-halted", ());
        let request_id = id();
        let origin = Origin::User;
        let audit = record(
            app,
            state,
            &request_id,
            "security.kill_switch",
            Risk::Leitura,
            &origin,
            "halt",
            reason,
            "not_required",
            0,
            "{}".into(),
            "halted",
            None,
        );
        return persistence.and(audit);
    }
    if !state.is_halted() {
        return Ok(());
    }
    let request_id = id();
    let origin = Origin::User;
    record(
        app,
        state,
        &request_id,
        "security.kill_switch",
        Risk::Leitura,
        &origin,
        "resume",
        reason,
        "not_required",
        0,
        "{}".into(),
        "resumed",
        None,
    )?;
    set_db_setting(app, "halted", "false")?;
    state.halted.store(false, Ordering::SeqCst);
    let _ = app.emit("companion-state", serde_json::json!({"type":"reveal"}));
    let _ = app.emit("security-resumed", ());
    Ok(())
}

#[tauri::command]
pub fn halt_all(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
) -> Result<(), String> {
    super::require_main(&caller)?;
    set_halted(&app, &state, true, "user_halt")
}

#[tauri::command]
pub fn resume_all(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    state: State<'_, SecurityState>,
) -> Result<(), String> {
    super::require_main(&caller)?;
    set_halted(&app, &state, false, "user_resume")
}

pub fn on_global_shortcut(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<SecurityState>() {
        if let Err(error) = set_halted(app, &state, true, "global_shortcut") {
            let _ = app.emit("security-error", error);
        }
    }
}

pub fn init_shortcut(app: &tauri::AppHandle) {
    let shortcut = db_setting(app, "shortcut").unwrap_or_else(|_| DEFAULT_SHORTCUT.into());
    if let Err(error) = app.global_shortcut().register(shortcut.as_str()) {
        if let Some(state) = app.try_state::<SecurityState>() {
            if let Ok(mut status) = state.shortcut_error.lock() {
                *status = Some(format!("Atalho não registrado: {error}"));
            }
        }
    }
}

pub fn load_halted(app: &tauri::AppHandle) -> bool {
    db_setting(app, "halted")
        .map(|value| value == "true")
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "odekrai-security-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn simulated_action_schema_rejects_unknown_fields_and_payment_is_fixed_block() {
        assert!(serde_json::from_str::<ActionRequest>(
            r#"{"action":{"tool":"workspace.read_file","path":"a.txt","risk":"allow"}}"#
        )
        .is_err());
        assert_eq!(
            action_metadata(&SimulatedAction::Payment {
                amount_cents: 100,
                currency: "USD".into()
            })
            .3,
            Some("fixed_block_payment")
        );
    }

    #[test]
    fn paths_reject_traversal_absolute_reserved_and_internal_directories() {
        for path in [
            "../secret",
            "C:\\Windows\\x",
            "\\\\server\\share\\x",
            "NUL.txt",
            "COM1.txt",
            "LPT³.log",
            ".history/secret",
            ".trash/item",
        ] {
            assert!(relative_path(path).is_err(), "{path}");
        }
        assert!(relative_path("docs/note.md").is_ok());
    }

    #[test]
    fn fixed_blocks_cover_credentials_payments_and_secret_markers() {
        assert_eq!(
            action_metadata(&SimulatedAction::ReadFile {
                path: ".env".into()
            })
            .3,
            Some("fixed_block_secret_path")
        );
        assert_eq!(
            action_metadata(&SimulatedAction::ReadFile {
                path: "keys/id_ed25519".into()
            })
            .3,
            Some("fixed_block_secret_path")
        );
        assert_eq!(
            action_metadata(&SimulatedAction::SendMessage {
                recipient: "x@example.invalid".into(),
                message: "password=secret".into()
            })
            .3,
            Some("fixed_block_secret_exfiltration")
        );
        assert_eq!(
            action_metadata(&SimulatedAction::Payment {
                amount_cents: 1,
                currency: "USD".into()
            })
            .3,
            Some("fixed_block_payment")
        );
        assert!(contains_secret_marker("-----BEGIN PRIVATE KEY-----"));
        assert_eq!(
            action_metadata(&SimulatedAction::WriteFile {
                path: "notes.txt".into(),
                content: "password=do-not-save".into(),
            })
            .3,
            Some("fixed_block_secret_storage")
        );
    }

    #[test]
    fn fixed_path_blocks_protect_identity_logs_databases_and_configuration_for_all_tools() {
        for path in [
            "ODEKRAI.md",
            "nested/ODEKRAI.md",
            "logs/audit.jsonl",
            "config/providers.json",
            "data/profile.sqlite3",
            "cache/index.db",
            ".env.production",
        ] {
            for action in [
                SimulatedAction::ReadFile { path: path.into() },
                SimulatedAction::WriteFile {
                    path: path.into(),
                    content: "safe".into(),
                },
                SimulatedAction::DeleteFile { path: path.into() },
            ] {
                assert!(
                    action_metadata(&action).3.is_some(),
                    "fixed block missing for {path}"
                );
            }
        }
        assert!(relative_path("../outside.txt").is_err());
    }

    #[test]
    fn workspace_read_blocks_known_secret_markers_in_file_contents() {
        let root = temp_dir();
        fs::write(root.join("notes.txt"), "password=do-not-read").unwrap();
        let action = SimulatedAction::ReadFile {
            path: "notes.txt".into(),
        };
        assert!(WorkspaceRead.execute(&action, &root).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn approval_hash_and_queue_capacity_fail_closed() {
        let action = SimulatedAction::WriteFile {
            path: "a.txt".into(),
            content: "one".into(),
        };
        let expected = digest(serde_json::to_string(&action).unwrap().as_bytes());
        assert!(display_hash_matches(&action, &expected, &expected));
        assert!(!display_hash_matches(&action, &expected, "wrong"));
        let changed = SimulatedAction::WriteFile {
            path: "a.txt".into(),
            content: "two".into(),
        };
        assert!(!display_hash_matches(&changed, &expected, &expected));
        let mut queue = VecDeque::new();
        assert!(queue_has_capacity(&queue));
        for number in 0..MAX_PENDING {
            queue.push_back(PendingAction {
                id: number.to_string(),
                action: action.clone(),
                origin: Origin::User,
                risk: Risk::EscritaReversivel,
                rule: "test",
                summary: String::new(),
                preview: String::new(),
                digest: expected.clone(),
                expires: Instant::now() + Duration::from_secs(30),
                expires_at: 0,
                created_at: Instant::now(),
            });
        }
        assert!(!queue_has_capacity(&queue));
        let consumed = take_pending_approval(&mut queue, "0", &expected).unwrap();
        assert!(take_pending_approval(&mut queue, &consumed.id, &expected).is_err());
        assert!(queue_has_capacity(&queue));
        assert!(
            queue.iter().all(|item| item.id != consumed.id),
            "an approval cannot be replayed after it is consumed"
        );
    }

    #[test]
    fn approval_expiration_uses_the_configured_deadline() {
        let now = Instant::now();
        assert!(!is_expired(now + Duration::from_secs(30), now));
        assert!(is_expired(now - Duration::from_secs(1), now));
    }

    #[test]
    fn audit_write_failure_does_not_create_an_actionable_log() {
        let root = temp_dir();
        let missing = root.join("missing").join("audit.jsonl");
        assert!(OpenOptions::new()
            .create(true)
            .append(true)
            .open(&missing)
            .is_err());
        assert!(!missing.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn simulated_workspace_tools_backup_and_trash_without_permanent_delete() {
        let root = temp_dir();
        let write = WorkspaceWrite;
        let first = SimulatedAction::WriteFile {
            path: "notes/test.txt".into(),
            content: "versão 1".into(),
        };
        assert!(write.execute(&first, &root).is_ok());
        let second = SimulatedAction::WriteFile {
            path: "notes/test.txt".into(),
            content: "versão 2".into(),
        };
        let second_result = write.execute(&second, &root);
        assert!(second_result.is_ok(), "{second_result:?}");
        assert_eq!(
            fs::read_to_string(root.join("notes/test.txt")).unwrap(),
            "versão 2"
        );
        let history = fs::read_dir(root.join(".history"))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(fs::read_to_string(history[0].path()).unwrap(), "versão 1");
        let delete = SimulatedAction::DeleteFile {
            path: "notes/test.txt".into(),
        };
        let delete_result = WorkspaceDelete.execute(&delete, &root);
        assert!(delete_result.is_ok(), "{delete_result:?}");
        assert!(!root.join("notes/test.txt").exists());
        assert_eq!(fs::read_dir(root.join(".trash")).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn simulated_external_tools_never_create_network_side_effects() {
        let send = SimulatedAction::SendMessage {
            recipient: "person@example.invalid".into(),
            message: "hello".into(),
        };
        assert!(SimulatedSend
            .execute(&send, Path::new(""))
            .unwrap()
            .contains("Nenhuma mensagem foi enviada"));
        let payment = SimulatedAction::Payment {
            amount_cents: 500,
            currency: "USD".into(),
        };
        assert!(SimulatedPayment.execute(&payment, Path::new("")).is_err());
    }

    #[test]
    fn tool_rate_bucket_limits_per_tool_without_network() {
        let state = SecurityState::new(false);
        let tool = WorkspaceRead;
        for _ in 0..RATE_LIMIT {
            assert!(allowed_rate(&state, &tool).unwrap());
        }
        assert!(!allowed_rate(&state, &tool).unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn path_resolution_rejects_symlinks() {
        use std::os::unix::fs::symlink;
        let root = temp_dir();
        let outside = temp_dir();
        fs::write(outside.join("secret"), "no").unwrap();
        symlink(&outside, root.join("linked")).unwrap();
        assert!(safe_target(&root, "linked/secret").is_err());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn path_resolution_rejects_windows_reparse_points() {
        use std::os::windows::fs::symlink_dir;
        let root = temp_dir();
        let outside = temp_dir();
        fs::write(outside.join("secret.txt"), "no").unwrap();
        let link = root.join("linked");
        if symlink_dir(&outside, &link).is_ok() {
            assert!(safe_target(&root, "linked/secret.txt").is_err());
        }
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn path_resolution_rejects_hard_links() {
        let root = temp_dir();
        let source = root.join("original.txt");
        let alias = root.join("alias.txt");
        fs::write(&source, "content").unwrap();
        if fs::hard_link(&source, &alias).is_ok() {
            assert!(safe_target(&root, "alias.txt").is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn audit_hash_chain_detects_tampering_and_breaks() {
        let logs = temp_dir();
        let payload = AuditPayload {
            timestamp: 1,
            id: "a".into(),
            tool: "read".into(),
            risk: Risk::Leitura,
            mode: Mode::SemprePerguntar,
            origin: "usuário".into(),
            decision: "allow".into(),
            rule_id: "workspace_read".into(),
            approval: "not_required".into(),
            latency_ms: 0,
            params_summary: "path=x".into(),
            status: "completed".into(),
            error: None,
            previous_hash: String::new(),
        };
        let line = AuditLine {
            hash: digest(&serde_json::to_vec(&payload).unwrap()),
            payload,
        };
        fs::write(
            logs.join("1.jsonl"),
            format!("{}\n", serde_json::to_string(&line).unwrap()),
        )
        .unwrap();
        assert_eq!(verify_audit_path(&logs).unwrap().len(), 1);
        fs::write(
            logs.join("1.jsonl"),
            format!(
                "{}\n",
                serde_json::to_string(&AuditLine {
                    payload: line.payload,
                    hash: "bad".into()
                })
                .unwrap()
            ),
        )
        .unwrap();
        assert!(verify_audit_path(&logs).is_err());
        fs::remove_dir_all(logs).unwrap();
    }

    #[test]
    fn pending_parameter_hash_changes_when_action_changes() {
        let a = SimulatedAction::WriteFile {
            path: "a.txt".into(),
            content: "one".into(),
        };
        let b = SimulatedAction::WriteFile {
            path: "a.txt".into(),
            content: "two".into(),
        };
        assert_ne!(
            digest(serde_json::to_string(&a).unwrap().as_bytes()),
            digest(serde_json::to_string(&b).unwrap().as_bytes())
        );
    }
}

use super::*;

pub(super) trait Tool {
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

pub(super) struct WorkspaceRead;
pub(super) struct WorkspaceWrite;
pub(super) struct WorkspaceDelete;
pub(super) struct SimulatedSend;
pub(super) struct SimulatedPayment;

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

pub(super) fn tool_for(action: &SimulatedAction) -> &'static dyn Tool {
    match action {
        SimulatedAction::ReadFile { .. } => &WorkspaceRead,
        SimulatedAction::WriteFile { .. } => &WorkspaceWrite,
        SimulatedAction::DeleteFile { .. } => &WorkspaceDelete,
        SimulatedAction::SendMessage { .. } => &SimulatedSend,
        SimulatedAction::Payment { .. } => &SimulatedPayment,
    }
}

pub(super) fn action_path(action: &SimulatedAction) -> Result<&str, String> {
    match action {
        SimulatedAction::ReadFile { path }
        | SimulatedAction::WriteFile { path, .. }
        | SimulatedAction::DeleteFile { path } => Ok(path),
        _ => Err("Esta ferramenta não usa um caminho.".into()),
    }
}

pub(super) fn validate_action(action: &SimulatedAction) -> Result<(), String> {
    match action {
        SimulatedAction::ReadFile { path } | SimulatedAction::DeleteFile { path } => {
            validate_tool_path(path)?;
        }
        SimulatedAction::WriteFile { path, content } => {
            validate_tool_path(path)?;
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

fn validate_tool_path(raw: &str) -> Result<(), String> {
    if Path::new(raw).is_absolute() {
        super::skills::validate_raw_folder_path(raw).map(|_| ())
    } else {
        relative_path(raw).map(|_| ())
    }
}

pub(super) fn protected_path_block(raw: &str) -> Option<&'static str> {
    let parts: Vec<String> = raw
        .split(['/', '\\'])
        .map(str::to_ascii_lowercase)
        .collect();
    if parts.iter().any(|part| part == "odekrai.md") {
        return Some("fixed_block_core_identity");
    }
    if parts.iter().any(|part| {
        matches!(
            part.as_str(),
            "windows"
                | "program files"
                | "program files (x86)"
                | "programdata"
                | "appdata"
                | ".ssh"
                | ".gnupg"
                | ".aws"
                | ".azure"
                | "login data"
                | "web data"
                | "local state"
                | "user data"
                | "profiles"
                | "firefox"
                | "mozilla"
                | "opera software"
                | "bravesoftware"
                | "vault"
                | "credentials"
                | "credential manager"
                | "identitycache"
        ) || raw.to_ascii_lowercase().contains("google\\chrome")
            || raw.to_ascii_lowercase().contains("microsoft\\edge")
            || raw.to_ascii_lowercase().contains("google/chrome")
            || raw.to_ascii_lowercase().contains("microsoft/edge")
    }) {
        return Some("fixed_block_system_or_browser_data");
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
            || name.contains("password")
            || name.contains("token")
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

pub(super) fn contains_secret_marker(text: &str) -> bool {
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

pub(super) fn relative_path(raw: &str) -> Result<PathBuf, String> {
    validate_path_syntax(raw, false)
}

pub(super) fn validate_path_syntax(raw: &str, absolute: bool) -> Result<PathBuf, String> {
    let max_len = if absolute { 4096 } else { 512 };
    if raw.is_empty()
        || raw.len() > max_len
        || raw.starts_with("\\\\")
        || raw.starts_with("//")
        || raw.contains('\0')
        || (!absolute && (raw.starts_with(['\\', '/']) || raw.contains(':')))
    {
        return Err("Informe um caminho local válido sem traversal.".into());
    }
    let path = PathBuf::from(raw);
    if path.is_absolute() != absolute
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
            Component::CurDir | Component::ParentDir => true,
            Component::RootDir | Component::Prefix(_) => !absolute,
        })
    {
        return Err(
            "O caminho contém traversal, componente reservado ou caractere inválido.".into(),
        );
    }
    Ok(path)
}

pub(super) fn reserved_windows_name(name: &str) -> bool {
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

pub(super) fn has_multiple_links(path: &Path) -> bool {
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

pub(super) fn has_reparse(path: &Path) -> bool {
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

pub(super) fn safe_target(root: &Path, raw: &str) -> Result<PathBuf, String> {
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

pub(super) fn preview_target(root: &Path, raw: &str) -> Result<PathBuf, String> {
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

pub(super) fn create_safe_target(root: &Path, raw: &str) -> Result<PathBuf, String> {
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

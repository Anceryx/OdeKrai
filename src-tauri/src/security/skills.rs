use super::{
    dispatch::{action_metadata, preview_for},
    workspace::{protected_path_block, tool_for},
    *,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResultTrust {
    Local,
    Untrusted,
}

pub struct Skill {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub model_description: &'static str,
    pub schema: Value,
    pub result_trust: ResultTrust,
    pub timeout: Duration,
    pub rate_limit_per_minute: usize,
}

impl Skill {
    pub fn risk(&self, params: &Value) -> Result<Risk, String> {
        let action = parse_action(self.id, params)?;
        Ok(action_metadata(&action).1)
    }

    pub fn preview(&self, app: &tauri::AppHandle, params: &Value) -> Result<String, String> {
        let action = parse_action(self.id, params)?;
        preview_for(app, &action)
    }

    pub async fn execute(
        &self,
        app: tauri::AppHandle,
        state: &SecurityState,
        params: Value,
        origin: Origin,
        tainted: bool,
        cancel: &tokio_util::sync::CancellationToken,
        on_approval: &mut (dyn FnMut(String) + Send),
    ) -> Result<ActionResult, String> {
        if !is_skill_enabled(&app, self.id)? {
            return Err("Esta habilidade está desativada.".into());
        }
        self.preview(&app, &params)?;
        let action = parse_action(self.id, &params)?;
        dispatch::submit_agent_action(
            &app,
            state,
            action,
            origin,
            tainted,
            self.timeout,
            self.rate_limit_per_minute,
            cancel,
            on_approval,
        )
        .await
    }
}

pub(crate) fn result_is_untrusted(
    app: &tauri::AppHandle,
    skill_id: &str,
    params: &Value,
) -> Result<bool, String> {
    let action = parse_action(skill_id, params)?;
    if matches!(
        action,
        SimulatedAction::FilesList { .. }
            | SimulatedAction::FilesSearch { .. }
            | SimulatedAction::FilesRead { .. }
    ) {
        let (root, _) = resolve_action_target(app, &action, false)?;
        let workspace = crate::agent_home::workspace_path(app)?;
        return is_external_file_root(&root, &workspace);
    }
    Ok(registry()
        .into_iter()
        .find(|skill| skill.id == skill_id)
        .is_some_and(|skill| skill.result_trust == ResultTrust::Untrusted))
}

fn is_external_file_root(
    root: &std::path::Path,
    workspace: &std::path::Path,
) -> Result<bool, String> {
    let root = root
        .canonicalize()
        .map_err(|_| "Não foi possível validar a origem do resultado.".to_string())?;
    let workspace = workspace
        .canonicalize()
        .map_err(|_| "Não foi possível validar a pasta de trabalho.".to_string())?;
    Ok(root != workspace)
}

fn action_id(action: &SimulatedAction) -> &'static str {
    match action {
        SimulatedAction::FilesList { .. } => "files.list",
        SimulatedAction::FilesSearch { .. } => "files.search",
        SimulatedAction::FilesRead { .. } => "files.read",
        SimulatedAction::ReadFile { .. } => "workspace.read_file",
        SimulatedAction::WriteFile { .. } => "workspace.write_file",
        SimulatedAction::DeleteFile { .. } => "workspace.delete_file",
        SimulatedAction::SendMessage { .. } => "simulated.send_message",
        SimulatedAction::Payment { .. } => "simulated.payment",
        SimulatedAction::Productivity { skill_id, .. } => match skill_id.as_str() {
            "calendar.create_event" => "calendar.create_event",
            "doc.create_markdown" => "doc.create_markdown",
            "doc.create_text" => "doc.create_text",
            "sheet.create_csv" => "sheet.create_csv",
            _ => "",
        },
    }
}

fn parse_action(id: &str, params: &Value) -> Result<SimulatedAction, String> {
    let mut payload = params.clone();
    let object = payload
        .as_object_mut()
        .ok_or("Os parâmetros da habilidade são inválidos.")?;
    let payload = if matches!(
        id,
        "calendar.create_event" | "doc.create_markdown" | "doc.create_text" | "sheet.create_csv"
    ) {
        json!({ "tool": "productivity", "skill_id": id, "params": payload })
    } else {
        object.insert("tool".into(), Value::String(id.into()));
        payload
    };
    let action: SimulatedAction = serde_json::from_value(payload)
        .map_err(|_| "Os parâmetros da habilidade são inválidos.".to_string())?;
    if action_id(&action) != id {
        return Err("Os parâmetros não correspondem à habilidade.".into());
    }
    validate_action(&action)?;
    Ok(action)
}

pub(super) fn resolve_action_target(
    app: &tauri::AppHandle,
    action: &SimulatedAction,
    write: bool,
) -> Result<(std::path::PathBuf, SimulatedAction), String> {
    let raw = match action {
        SimulatedAction::FilesList { path, .. }
        | SimulatedAction::FilesSearch { path, .. }
        | SimulatedAction::FilesRead { path } => path,
        SimulatedAction::ReadFile { path }
        | SimulatedAction::WriteFile { path, .. }
        | SimulatedAction::DeleteFile { path } => path,
        SimulatedAction::Productivity { params, .. } => params
            .get("path")
            .and_then(Value::as_str)
            .ok_or("Informe um caminho de destino.")?,
        _ => return Err("Esta habilidade não usa uma pasta permitida.".into()),
    };
    let workspace = crate::agent_home::workspace_path(app)?;
    if matches!(action, SimulatedAction::Productivity { skill_id, .. } if skill_id == "calendar.create_event")
        && std::path::Path::new(raw).is_absolute()
    {
        return Err("Eventos de calendário só podem ser criados na pasta de trabalho.".into());
    }
    if raw.is_empty()
        && matches!(
            action,
            SimulatedAction::FilesList { .. } | SimulatedAction::FilesSearch { .. }
        )
    {
        return Ok((workspace, action.clone()));
    }
    if !std::path::Path::new(raw).is_absolute() {
        if !is_fixed_drive(&workspace) {
            return Err("A pasta de trabalho precisa estar em uma unidade local fixa.".into());
        }
        return Ok((workspace, action.clone()));
    }
    if protected_path_block(raw).is_some() {
        return Err("O caminho está em uma área permanentemente protegida.".into());
    }
    let raw_candidate = validate_raw_folder_path(raw)?;
    if has_reparse(&raw_candidate) {
        return Err("O caminho contém um link simbólico ou junction.".into());
    }
    let candidate = canonicalize_nonexistent_tail(&raw_candidate)?;
    if workspace
        .parent()
        .is_some_and(|home| candidate.starts_with(home) && !candidate.starts_with(&workspace))
        || app
            .path()
            .app_data_dir()
            .is_ok_and(|data_dir| candidate.starts_with(data_dir))
    {
        return Err("O caminho pertence aos dados privados do OdeKrai.".into());
    }
    let mut roots = vec![(workspace, true)];
    let db = database(app)?;
    let mut statement = db
        .prepare("SELECT path,access FROM allowed_folders")
        .map_err(|_| "Não foi possível validar as pastas permitidas.".to_string())?;
    let configured = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "Não foi possível validar as pastas permitidas.".to_string())?;
    for entry in configured {
        let (path, access) =
            entry.map_err(|_| "Não foi possível validar as pastas permitidas.".to_string())?;
        roots.push((std::path::PathBuf::from(path), access == "read_write"));
    }
    let root = select_allowed_root(&candidate, &roots, write)?;
    let relative = candidate
        .strip_prefix(&root)
        .map_err(|_| "O caminho não pertence à pasta permitida.")?
        .to_str()
        .ok_or("O caminho não usa texto UTF-8 válido.")?
        .to_string();
    if !relative.is_empty() {
        relative_path(&relative)?;
    }
    if matches!(action, SimulatedAction::WriteFile { .. }) {
        workspace::preview_target(&root, &relative)?;
    } else if !relative.is_empty() {
        workspace::safe_target(&root, &relative)?;
    }
    let normalized = match action {
        SimulatedAction::FilesList { depth, limit, .. } => SimulatedAction::FilesList {
            path: relative,
            depth: *depth,
            limit: *limit,
        },
        SimulatedAction::FilesSearch {
            query,
            by,
            depth,
            max_file_bytes,
            limit,
            ..
        } => SimulatedAction::FilesSearch {
            path: relative,
            query: query.clone(),
            by: by.clone(),
            depth: *depth,
            max_file_bytes: *max_file_bytes,
            limit: *limit,
        },
        SimulatedAction::FilesRead { .. } => SimulatedAction::FilesRead { path: relative },
        SimulatedAction::ReadFile { .. } => SimulatedAction::ReadFile { path: relative },
        SimulatedAction::WriteFile { content, .. } => SimulatedAction::WriteFile {
            path: relative,
            content: content.clone(),
        },
        SimulatedAction::DeleteFile { .. } => SimulatedAction::DeleteFile { path: relative },
        SimulatedAction::Productivity { skill_id, params } => {
            let mut params = params.clone();
            if let Some(object) = params.as_object_mut() {
                object.insert("path".into(), Value::String(relative));
            }
            SimulatedAction::Productivity {
                skill_id: skill_id.clone(),
                params,
            }
        }
        _ => unreachable!(),
    };
    Ok((root, normalized))
}

fn canonicalize_nonexistent_tail(path: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let mut ancestor = path;
    let mut tail = Vec::new();
    while !ancestor.exists() {
        tail.push(
            ancestor
                .file_name()
                .ok_or("O caminho não tem um arquivo de destino válido.")?
                .to_os_string(),
        );
        ancestor = ancestor
            .parent()
            .ok_or("Não foi possível validar o caminho selecionado.")?;
    }
    if has_reparse(ancestor) {
        return Err("O caminho contém um link simbólico ou junction.".into());
    }
    let mut canonical = ancestor
        .canonicalize()
        .map_err(|_| "Não foi possível validar o caminho selecionado.".to_string())?;
    for component in tail.into_iter().rev() {
        canonical.push(component);
    }
    Ok(canonical)
}

fn select_allowed_root(
    candidate: &std::path::Path,
    roots: &[(std::path::PathBuf, bool)],
    write: bool,
) -> Result<std::path::PathBuf, String> {
    let mut matches = Vec::new();
    for (configured_root, writable) in roots {
        if has_reparse(configured_root) || !is_fixed_drive(configured_root) {
            continue;
        }
        let Ok(root) = configured_root.canonicalize() else {
            continue;
        };
        if candidate.starts_with(&root) {
            matches.push((root, *writable));
        }
    }
    matches.sort_by_key(|(root, _)| std::cmp::Reverse(root.components().count()));
    let (root, writable) = matches
        .into_iter()
        .next()
        .ok_or("O caminho não pertence a uma pasta permitida.")?;
    if write && !writable {
        return Err("A pasta permitida está configurada somente para leitura.".into());
    }
    Ok(root)
}

pub fn registry() -> Vec<Skill> {
    let rows = [
        ("files.list", "Listar arquivos", "Lista arquivos e pastas em uma pasta permitida, com limites.", "Liste itens de uma pasta usando profundidade e limite explícitos.", json!({"type":"object","properties":{"path":{"type":"string"},"depth":{"type":"integer","minimum":1,"maximum":8},"limit":{"type":"integer","minimum":1,"maximum":500}},"required":["path","depth","limit"],"additionalProperties":false}), ResultTrust::Local),
        ("files.search", "Pesquisar arquivos", "Pesquisa nomes ou conteúdo textual com limites explícitos.", "Pesquise arquivos por nome ou trecho de texto. Informe pasta, modo, profundidade, tamanho máximo e limite de resultados.", json!({"type":"object","properties":{"path":{"type":"string"},"query":{"type":"string","minLength":1,"maxLength":256},"by":{"type":"string","enum":["name","text"]},"depth":{"type":"integer","minimum":1,"maximum":8},"max_file_bytes":{"type":"integer","minimum":1,"maximum":65536},"limit":{"type":"integer","minimum":1,"maximum":100}},"required":["path","query","by","depth","max_file_bytes","limit"],"additionalProperties":false}), ResultTrust::Local),
        ("files.read", "Ler arquivo de texto", "Lê texto UTF-8 ou Windows-1252 de até 64 KiB; recusa binários.", "Leia um arquivo textual de até 64 KiB em pasta permitida.", json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}), ResultTrust::Local),
        (
            "workspace.read_file",
            "Ler arquivo",
            "Lê um arquivo de texto da pasta de trabalho ou de uma pasta permitida.",
            "Leia um arquivo de texto pelo caminho relativo à pasta de trabalho ou pelo caminho absoluto de uma pasta permitida.",
            json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}),
            ResultTrust::Local,
        ),
        (
            "workspace.write_file",
            "Salvar arquivo",
            "Salva texto com cópia reversível da versão anterior em uma pasta permitida.",
            "Salve texto em um caminho relativo à pasta de trabalho ou pelo caminho absoluto de uma pasta permitida.",
            json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"],"additionalProperties":false}),
            ResultTrust::Local,
        ),
        (
            "workspace.delete_file",
            "Mover arquivo para a lixeira",
            "Move um arquivo permitido para a lixeira local.",
            "Mova um arquivo para a lixeira local pelo caminho relativo à pasta de trabalho ou pelo caminho absoluto de uma pasta permitida.",
            json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}),
            ResultTrust::Local,
        ),
        (
            "simulated.send_message",
            "Simular mensagem",
            "Apresenta uma simulação; não envia mensagens.",
            "Simule a preparação de uma mensagem. Nenhuma comunicação externa ocorre.",
            json!({"type":"object","properties":{"recipient":{"type":"string"},"message":{"type":"string"}},"required":["recipient","message"],"additionalProperties":false}),
            ResultTrust::Untrusted,
        ),
        (
            "simulated.payment",
            "Pagamento bloqueado",
            "Ação permanentemente bloqueada.",
            "Não solicite pagamentos. Esta habilidade está permanentemente bloqueada.",
            json!({"type":"object","properties":{"amount_cents":{"type":"integer"},"currency":{"type":"string"}},"required":["amount_cents","currency"],"additionalProperties":false}),
            ResultTrust::Untrusted,
        ),
        ("calendar.create_event", "Criar evento de calendário", "Gera um arquivo .ics na pasta de trabalho e abre o calendário padrão para confirmação.", "Crie um evento iCalendar com título, início ISO 8601 com fuso, fim opcional, local, descrição e alerta em minutos. Informe um caminho relativo .ics dentro da pasta de trabalho.", json!({"type":"object","properties":{"path":{"type":"string"},"title":{"type":"string","minLength":1,"maxLength":200},"start":{"type":"string","maxLength":64},"end":{"type":["string","null"],"maxLength":64},"location":{"type":"string","maxLength":500},"description":{"type":"string","maxLength":4000},"alert_minutes":{"type":["integer","null"],"minimum":0,"maximum":10080}},"required":["path","title","start","end","location","description","alert_minutes"],"additionalProperties":false}), ResultTrust::Local),
        ("doc.create_markdown", "Criar documento Markdown", "Cria um arquivo Markdown em pasta permitida.", "Crie um documento Markdown no caminho relativo ou absoluto de uma pasta permitida.", json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string","maxLength":1000000}},"required":["path","content"],"additionalProperties":false}), ResultTrust::Local),
        ("doc.create_text", "Criar documento de texto", "Cria um arquivo de texto em pasta permitida.", "Crie um arquivo de texto UTF-8 no caminho relativo ou absoluto de uma pasta permitida.", json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string","maxLength":1000000}},"required":["path","content"],"additionalProperties":false}), ResultTrust::Local),
        ("sheet.create_csv", "Criar planilha CSV", "Cria um CSV delimitado por vírgula, ponto e vírgula ou tabulação com UTF-8 BOM ou Windows-1252.", "Crie um CSV com caminho, delimitador (comma, semicolon ou tab), codificação (utf8_bom ou windows_1252), cabeçalhos e linhas de valores textuais.", json!({"type":"object","properties":{"path":{"type":"string"},"delimiter":{"type":"string","enum":["comma","semicolon","tab"]},"encoding":{"type":"string","enum":["utf8_bom","windows_1252"]},"headers":{"type":"array","items":{"type":"string","maxLength":256},"minItems":1,"maxItems":100},"rows":{"type":"array","items":{"type":"array","items":{"type":"string","maxLength":4096},"maxItems":100},"maxItems":10000}},"required":["path","delimiter","encoding","headers","rows"],"additionalProperties":false}), ResultTrust::Local),
    ];
    rows.into_iter()
        .map(
            |(id, name, description, model_description, schema, result_trust)| Skill {
                id,
                name,
                description,
                model_description,
                schema,
                result_trust,
                timeout: tool_for(&action_example(id)).timeout(),
                rate_limit_per_minute: tool_for(&action_example(id)).rate_limit_per_minute(),
            },
        )
        .collect()
}

fn action_example(id: &str) -> SimulatedAction {
    match id {
        "files.list" => SimulatedAction::FilesList {
            path: String::new(),
            depth: 1,
            limit: 100,
        },
        "files.search" => SimulatedAction::FilesSearch {
            path: String::new(),
            query: "x".into(),
            by: "name".into(),
            depth: 1,
            max_file_bytes: 65536,
            limit: 20,
        },
        "files.read" => SimulatedAction::FilesRead {
            path: "sample.txt".into(),
        },
        "workspace.read_file" => SimulatedAction::ReadFile {
            path: "sample.txt".into(),
        },
        "workspace.write_file" => SimulatedAction::WriteFile {
            path: "sample.txt".into(),
            content: String::new(),
        },
        "workspace.delete_file" => SimulatedAction::DeleteFile {
            path: "sample.txt".into(),
        },
        "calendar.create_event" => SimulatedAction::Productivity {
            skill_id: id.into(),
            params: json!({"path":"event.ics","title":"Evento","start":"2030-01-01T10:00:00-03:00","end":null,"location":"","description":"","alert_minutes":null}),
        },
        "doc.create_markdown" => SimulatedAction::Productivity {
            skill_id: id.into(),
            params: json!({"path":"documento.md","content":""}),
        },
        "doc.create_text" => SimulatedAction::Productivity {
            skill_id: id.into(),
            params: json!({"path":"documento.txt","content":""}),
        },
        "sheet.create_csv" => SimulatedAction::Productivity {
            skill_id: id.into(),
            params: json!({"path":"planilha.csv","delimiter":"semicolon","encoding":"utf8_bom","headers":["coluna"],"rows":[]}),
        },
        "simulated.send_message" => SimulatedAction::SendMessage {
            recipient: "sample".into(),
            message: String::new(),
        },
        _ => SimulatedAction::Payment {
            amount_cents: 0,
            currency: "BRL".into(),
        },
    }
}

pub fn model_tools(app: &tauri::AppHandle) -> Result<Vec<crate::providers::ToolDef>, String> {
    let skills = registry();
    let mut enabled = std::collections::HashSet::new();
    for skill in &skills {
        if is_skill_enabled(app, skill.id)? {
            enabled.insert(skill.id);
        }
    }
    Ok(model_tools_for(&skills, &enabled))
}

fn model_tools_for(
    skills: &[Skill],
    enabled: &std::collections::HashSet<&str>,
) -> Vec<crate::providers::ToolDef> {
    skills
        .iter()
        .filter(|skill| enabled.contains(skill.id))
        .map(|skill| crate::providers::ToolDef {
            name: skill.id.into(),
            description: skill.model_description.into(),
            json_schema: skill.schema.clone(),
        })
        .collect()
}

pub(crate) fn is_skill_enabled(app: &tauri::AppHandle, id: &str) -> Result<bool, String> {
    database(app)?
        .query_row(
            "SELECT enabled FROM skill_settings WHERE skill_id=?1",
            [id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| value.unwrap_or(0) != 0)
        .map_err(|_| "Não foi possível ler as habilidades configuradas.".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillView {
    pub id: String,
    pub name: String,
    pub description: String,
    pub risk: Risk,
    pub result_trust: ResultTrust,
    pub enabled: bool,
    pub more_permissive: bool,
    pub fixed_blocked: bool,
}

#[tauri::command]
pub fn get_skills(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
) -> Result<Vec<SkillView>, String> {
    crate::require_main(&caller)?;
    registry()
        .into_iter()
        .map(|skill| {
            let example = action_example(skill.id);
            let params = if let SimulatedAction::Productivity { params, .. } = &example {
                params.clone()
            } else {
                let mut params = serde_json::to_value(&example).map_err(|_| {
                    "Não foi possível preparar o catálogo de habilidades.".to_string()
                })?;
                if let Some(object) = params.as_object_mut() {
                    object.remove("tool");
                }
                params
            };
            Ok(SkillView {
                id: skill.id.into(),
                name: skill.name.into(),
                description: skill.description.into(),
                risk: skill.risk(&params)?,
                result_trust: skill.result_trust,
                enabled: is_skill_enabled(&app, skill.id)?,
                more_permissive: super::override_enabled(&app, skill.id)?,
                fixed_blocked: skill.id == "simulated.payment",
            })
        })
        .collect()
}

#[tauri::command]
pub fn set_skill_enabled(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    skill_id: String,
    enabled: bool,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    if !registry().iter().any(|skill| skill.id == skill_id) {
        return Err("Habilidade desconhecida.".into());
    }
    database(&app)?.execute("INSERT INTO skill_settings(skill_id,enabled) VALUES (?1,?2) ON CONFLICT(skill_id) DO UPDATE SET enabled=excluded.enabled", params![skill_id, enabled as i64]).map_err(|_| "Não foi possível salvar a habilidade.".to_string())?;
    let _ = app.emit("skills-updated", ());
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllowedFolderView {
    pub path: String,
    pub access: String,
    pub workspace: bool,
}

#[tauri::command]
pub fn get_allowed_folders(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
) -> Result<Vec<AllowedFolderView>, String> {
    crate::require_main(&caller)?;
    let workspace = crate::agent_home::workspace_path(&app)?;
    let mut folders = vec![AllowedFolderView {
        path: workspace.to_string_lossy().into_owned(),
        access: "read_write".into(),
        workspace: true,
    }];
    let db = database(&app)?;
    let mut statement = db
        .prepare("SELECT path,access FROM allowed_folders ORDER BY path")
        .map_err(|_| "Não foi possível ler as pastas permitidas.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "Não foi possível ler as pastas permitidas.".to_string())?;
    for row in rows {
        let (path, access) =
            row.map_err(|_| "Não foi possível ler as pastas permitidas.".to_string())?;
        folders.push(AllowedFolderView {
            path,
            access,
            workspace: false,
        });
    }
    Ok(folders)
}

#[tauri::command]
pub fn add_allowed_folder(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    path: String,
    access: String,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    if !matches!(access.as_str(), "read_only" | "read_write") {
        return Err("Nível de acesso inválido.".into());
    }
    let workspace = crate::agent_home::workspace_path(&app)?;
    let canonical = validate_allowed_folder_path(&path, &workspace, &app)?;
    if canonical == workspace {
        return Err("A pasta de trabalho já tem leitura e escrita.".into());
    }
    database(&app)?.execute("INSERT INTO allowed_folders(path,access) VALUES (?1,?2) ON CONFLICT(path) DO UPDATE SET access=excluded.access", params![canonical.to_string_lossy(), access]).map_err(|_| "Não foi possível salvar a pasta permitida.".to_string())?;
    let _ = app.emit("allowed-folders-updated", ());
    Ok(())
}

#[tauri::command]
pub fn remove_allowed_folder(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    path: String,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    let workspace = crate::agent_home::workspace_path(&app)?;
    let candidate = validate_raw_folder_path(&path)?;
    let saved = candidate.canonicalize().unwrap_or(candidate);
    if saved == workspace {
        return Err("A pasta de trabalho não pode ser removida.".into());
    }
    database(&app)?
        .execute(
            "DELETE FROM allowed_folders WHERE path=?1",
            [saved.to_string_lossy().as_ref()],
        )
        .map_err(|_| "Não foi possível remover a pasta permitida.".to_string())?;
    let _ = app.emit("allowed-folders-updated", ());
    Ok(())
}

fn validate_allowed_folder_path(
    raw: &str,
    workspace: &std::path::Path,
    app: &tauri::AppHandle,
) -> Result<std::path::PathBuf, String> {
    let candidate = validate_raw_folder_path(raw)?;
    if has_reparse(&candidate) {
        return Err("A pasta contém um caminho redirecionado ou não é absoluto.".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
        let prefix = candidate
            .components()
            .next()
            .ok_or("Unidade local inválida.")?;
        let mut root: Vec<u16> = std::path::PathBuf::from(prefix.as_os_str())
            .as_os_str()
            .encode_wide()
            .collect();
        if !root.ends_with(&[b'\\' as u16]) {
            root.push(b'\\' as u16);
        }
        root.push(0);
        if unsafe { GetDriveTypeW(root.as_ptr()) } != 3 {
            return Err("Unidades removíveis ou de rede não são permitidas.".into());
        }
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "A pasta selecionada não existe ou não pode ser validada.".to_string())?;
    if !canonical.is_dir()
        || canonical.parent().is_none()
        || protected_absolute_path(&canonical, workspace, app)
    {
        return Err("A pasta selecionada está em uma área protegida.".into());
    }
    Ok(canonical)
}

pub(crate) fn validate_raw_folder_path(raw: &str) -> Result<std::path::PathBuf, String> {
    workspace::validate_path_syntax(raw, true)
}

fn is_fixed_drive(path: &std::path::Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
        let Some(prefix) = path.components().next() else {
            return false;
        };
        let mut root: Vec<u16> = std::path::PathBuf::from(prefix.as_os_str())
            .as_os_str()
            .encode_wide()
            .collect();
        if !root.ends_with(&[b'\\' as u16]) {
            root.push(b'\\' as u16);
        }
        root.push(0);
        unsafe { GetDriveTypeW(root.as_ptr()) == 3 }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        true
    }
}

fn protected_absolute_path(
    path: &std::path::Path,
    workspace: &std::path::Path,
    app: &tauri::AppHandle,
) -> bool {
    if workspace
        .parent()
        .is_some_and(|home| path.starts_with(home) && path != workspace)
    {
        return true;
    }
    if app
        .path()
        .app_data_dir()
        .is_ok_and(|data_dir| path.starts_with(data_dir))
    {
        return true;
    }
    let text = path.to_string_lossy();
    protected_path_block(&text).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_results_from_workspace_are_local_and_from_other_roots_are_untrusted() {
        let base =
            std::env::temp_dir().join(format!("odekrai-trust-{}", crate::security::now_millis()));
        let workspace = base.join("workspace");
        let allowed = base.join("allowed");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&allowed).unwrap();
        assert!(!is_external_file_root(&workspace, &workspace).unwrap());
        assert!(is_external_file_root(&allowed, &workspace).unwrap());
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn schemas_reject_unknown_fields_and_risk_is_derived_from_rust_action() {
        let read = registry()
            .into_iter()
            .find(|skill| skill.id == "workspace.read_file")
            .unwrap();
        assert_eq!(read.risk(&json!({"path":"a.txt"})).unwrap(), Risk::Leitura);
        assert!(read
            .risk(&json!({"path":"a.txt","risk":"destrutivo_financeiro"}))
            .is_err());
        assert!(parse_action(read.id, &json!({"path":"a.txt","extra":true})).is_err());
        assert_eq!(read.result_trust, ResultTrust::Local);
    }

    #[test]
    fn productivity_skills_are_registered_with_rust_derived_risks_and_strict_schemas() {
        let calendar = registry()
            .into_iter()
            .find(|skill| skill.id == "calendar.create_event")
            .unwrap();
        let params = json!({"path":"evento.ics","title":"Reunião","start":"2030-01-01T10:00:00-03:00","end":null,"location":"","description":"","alert_minutes":null});
        assert_eq!(calendar.risk(&params).unwrap(), Risk::ComunicacaoExterna);
        assert_eq!(
            action_metadata(&parse_action(calendar.id, &params).unwrap()).0,
            "calendar.create_event"
        );
        assert!(parse_action(calendar.id, &json!({"path":"../fora.ics","title":"x","start":"2030-01-01T10:00:00-03:00","end":null,"location":"","description":"","alert_minutes":null})).is_err());
        assert!(parse_action(calendar.id, &json!({"path":"evento.ics","title":"x","start":"2030-01-01T10:00:00","end":null,"location":"","description":"","alert_minutes":null})).is_err());
        assert!(parse_action(
            "doc.create_text",
            &json!({"path":"arquivo.exe","content":"x"})
        )
        .is_err());
    }

    #[test]
    fn disabled_skills_are_not_offered_to_the_model() {
        let skills = registry();
        assert!(model_tools_for(&skills, &std::collections::HashSet::new()).is_empty());
        let enabled = std::collections::HashSet::from(["workspace.read_file"]);
        let tools = model_tools_for(&skills, &enabled);
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "workspace.read_file");
    }

    #[test]
    fn allowlist_validator_rejects_fixed_system_and_browser_locations() {
        for path in [
            r"C:\Windows\System32",
            r"C:\Program Files\App",
            r"C:\ProgramData\Credentials",
            r"C:\Users\Ana\.ssh",
            r"C:\Users\Ana\AppData\Local\Google\Chrome\User Data",
            r"C:\Users\Ana\AppData\Roaming\Mozilla\Firefox\Profiles",
            r"C:\Users\Ana\AppData\Roaming\OdeKrai\logs",
        ] {
            assert!(protected_path_block(path).is_some(), "{path}");
        }
    }

    #[test]
    fn allowlist_path_input_rejects_unc_parent_and_reserved_names() {
        assert!(validate_raw_folder_path(r"\\server\share").is_err());
        assert!(validate_raw_folder_path(r"C:\Users\Ana\..\Documents").is_err());
        assert!(validate_raw_folder_path(r"C:\Users\Ana\CON").is_err());
    }

    #[test]
    fn allowlist_enforces_read_only_and_rejects_unlisted_paths() {
        let root = std::env::temp_dir().canonicalize().unwrap();
        let target = root.join("allowed-folder-test.txt");
        let roots = vec![(root.clone(), false)];
        assert_eq!(select_allowed_root(&target, &roots, false).unwrap(), root);
        assert!(select_allowed_root(&target, &roots, true).is_err());
        assert!(select_allowed_root(
            std::path::Path::new("C:\\not-allowed\\file.txt"),
            &roots,
            false
        )
        .is_err());
    }
}

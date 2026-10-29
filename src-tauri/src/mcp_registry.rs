use keyring::Entry;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, State};

const SERVICE: &str = "site.anceryx.odekrai.mcp";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env_names: Vec<String>,
    pub enabled: bool,
    pub status: String,
    pub error: Option<String>,
}

enum RuntimeStatus {
    Connecting,
    Connected(Arc<crate::mcp::McpStdioClient>),
    Error(String),
}

#[derive(Default)]
pub struct McpRuntime(Mutex<HashMap<String, RuntimeStatus>>);

#[derive(Deserialize)]
struct StoredRow(String, String, String, String, String, bool);

fn valid_env_name(name: &str) -> bool {
    let mut bytes = name.bytes();
    matches!(bytes.next(), Some(b'A'..=b'Z' | b'_'))
        && bytes.all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
}

fn validate(
    name: &str,
    command: &str,
    args: &[String],
    env_names: &[String],
) -> Result<(), String> {
    if name.trim().is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
        return Err("Informe um nome de até 80 caracteres.".into());
    }
    if command.trim().is_empty() || command.len() > 32_768 || command.chars().any(char::is_control)
    {
        return Err("Informe o caminho ou comando do servidor.".into());
    }
    if args.len() > 128
        || args
            .iter()
            .any(|arg| arg.len() > 32_768 || arg.contains('\0'))
    {
        return Err("Os argumentos excedem o limite permitido.".into());
    }
    if env_names.len() > 32
        || env_names.iter().any(|key| !valid_env_name(key))
        || env_names
            .iter()
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            != env_names.len()
    {
        return Err("Use nomes de variáveis únicos no formato A-Z, 0-9 e _.".into());
    }
    Ok(())
}

fn entry(server_id: &str, key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("{server_id}:{key}"))
        .map_err(|_| "Não foi possível acessar o Gerenciador de Credenciais do Windows.".into())
}

trait CredentialVault {
    fn store(&mut self, server_id: &str, key: &str, value: &str) -> Result<(), String>;
    fn erase(&mut self, server_id: &str, key: &str) -> Result<(), String>;
}

struct WindowsVault;

impl CredentialVault for WindowsVault {
    fn store(&mut self, server_id: &str, key: &str, value: &str) -> Result<(), String> {
        entry(server_id, key)?.set_password(value).map_err(|_| {
            "Não foi possível salvar a credencial no Gerenciador de Credenciais do Windows.".into()
        })
    }
    fn erase(&mut self, server_id: &str, key: &str) -> Result<(), String> {
        match entry(server_id, key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => {
                Err("Não foi possível apagar uma credencial do Gerenciador do Windows.".into())
            }
        }
    }
}

fn list(db: &Connection) -> Result<Vec<McpServer>, String> {
    let mut stmt = db.prepare("SELECT id,name,command,args_json,env_names_json,enabled FROM mcp_servers ORDER BY name")
        .map_err(|_| "Não foi possível listar os servidores MCP.".to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StoredRow(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get::<_, i64>(5)? != 0,
            ))
        })
        .map_err(|_| "Não foi possível listar os servidores MCP.".to_string())?;
    rows.map(|row| {
        let StoredRow(id, name, command, args, env_names, enabled) =
            row.map_err(|_| "Não foi possível ler o cadastro MCP.".to_string())?;
        Ok(McpServer {
            id,
            name,
            command,
            args: serde_json::from_str(&args).map_err(|_| "Cadastro MCP inválido.".to_string())?,
            env_names: serde_json::from_str(&env_names)
                .map_err(|_| "Cadastro MCP inválido.".to_string())?,
            enabled,
            status: "Parado".into(),
            error: None,
        })
    })
    .collect()
}

fn insert(db: &Connection, server: &McpServer) -> Result<(), String> {
    validate(
        &server.name,
        &server.command,
        &server.args,
        &server.env_names,
    )?;
    db.execute("INSERT INTO mcp_servers(id,name,command,args_json,env_names_json,enabled) VALUES (?1,?2,?3,?4,?5,?6)", params![server.id, server.name.trim(), server.command, serde_json::to_string(&server.args).unwrap_or_default(), serde_json::to_string(&server.env_names).unwrap_or_default(), server.enabled as i64])
        .map_err(|_| "Não foi possível salvar o servidor MCP.".to_string())?;
    Ok(())
}

fn set_env(server: &McpServer, key: &str, value: &str) -> Result<(), String> {
    set_env_with(server, key, value, &mut WindowsVault)
}

fn set_env_with(
    server: &McpServer,
    key: &str,
    value: &str,
    vault: &mut impl CredentialVault,
) -> Result<(), String> {
    if !server.env_names.iter().any(|candidate| candidate == key)
        || value.len() > 32_768
        || value.contains('\0')
    {
        return Err("A variável não está declarada ou o valor excede o limite.".into());
    }
    vault.store(&server.id, key, value)
}

fn remove(db: &Connection, server: &McpServer) -> Result<(), String> {
    remove_with(db, server, &mut WindowsVault)
}

fn remove_with(
    db: &Connection,
    server: &McpServer,
    vault: &mut impl CredentialVault,
) -> Result<(), String> {
    for key in &server.env_names {
        vault.erase(&server.id, key)?;
    }
    db.execute("DELETE FROM mcp_servers WHERE id=?1", [&server.id])
        .map_err(|_| "Não foi possível remover o servidor MCP.".to_string())?;
    Ok(())
}

fn find(db: &Connection, id: &str) -> Result<McpServer, String> {
    list(db)?
        .into_iter()
        .find(|server| server.id == id)
        .ok_or_else(|| "Servidor MCP não cadastrado.".into())
}

fn inspect(
    server: &McpServer,
) -> Result<(Arc<crate::mcp::McpStdioClient>, serde_json::Value), String> {
    if !server.enabled {
        return Err("Ative o servidor antes de testar a conexão.".into());
    }
    let mut env = BTreeMap::new();
    for key in &server.env_names {
        let value = entry(&server.id, key)?
            .get_password()
            .map_err(|_| format!("Credencial ausente para a variável {key}."))?;
        env.insert(key.clone(), value);
    }
    let mut config = crate::mcp::StdioConfig::new(server.command.clone(), server.args.clone());
    config.env = env;
    config.connection_timeout = Duration::from_secs(10);
    let client = Arc::new(crate::mcp::McpStdioClient::connect(config).map_err(safe_client_error)?);
    let result = client.tools_list().map_err(safe_client_error)?;
    Ok((client, result))
}

fn safe_client_error(error: crate::mcp::ClientError) -> String {
    use crate::mcp::ClientError;
    match error {
        ClientError::Spawn(detail) => format!(
            "Falha ao iniciar o programa do servidor MCP: {}",
            safe_detail(&detail)
        ),
        ClientError::Io(detail) => format!(
            "Falha de comunicação com o servidor MCP: {}",
            safe_detail(&detail)
        ),
        ClientError::Timeout => "Tempo limite de conexão com o servidor MCP.".into(),
        ClientError::Cancelled => "Conexão MCP cancelada.".into(),
        ClientError::Disconnected => "O servidor MCP encerrou o processo.".into(),
        ClientError::Protocol(detail) => format!(
            "Resposta inválida do servidor MCP: {}",
            safe_detail(&detail)
        ),
        ClientError::Remote(_) => {
            "O servidor MCP retornou um erro remoto (detalhe omitido).".into()
        }
    }
}

fn safe_detail(detail: &str) -> String {
    let sanitized: String = detail
        .chars()
        .filter(|character| !character.is_control())
        .take(180)
        .collect();
    format!("{sanitized} [diagnóstico limitado]")
}

#[tauri::command]
pub fn mcp_list_servers(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    runtime: State<'_, McpRuntime>,
) -> Result<Vec<McpServer>, String> {
    crate::require_main(&caller)?;
    let mut servers = list(&crate::security::database(&app)?)?;
    let mut states = runtime
        .0
        .lock()
        .map_err(|_| "Estado MCP indisponível.".to_string())?;
    for server in &mut servers {
        if !server.enabled {
            states.remove(&server.id);
            continue;
        }
        let status = match states.get(&server.id) {
            Some(RuntimeStatus::Connecting) => "Conectando".into(),
            Some(RuntimeStatus::Connected(client)) if client.is_alive() => "Conectado".into(),
            Some(RuntimeStatus::Connected(_)) => "O servidor MCP encerrou o processo.".into(),
            Some(RuntimeStatus::Error(message)) => message.clone(),
            None => "Parado".into(),
        };
        if status == "Parado" || status == "Conectando" || status == "Conectado" {
            server.status = status;
        } else {
            server.status = "Erro".into();
            server.error = Some(status.clone());
            states.insert(server.id.clone(), RuntimeStatus::Error(status));
        }
    }
    Ok(servers)
}

#[tauri::command]
pub fn mcp_add_server(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    name: String,
    command: String,
    args: Vec<String>,
    env_names: Vec<String>,
) -> Result<McpServer, String> {
    crate::require_main(&caller)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let server = McpServer {
        id: format!("mcp-{now}"),
        name,
        command,
        args,
        env_names,
        enabled: false,
        status: "Parado".into(),
        error: None,
    };
    insert(&crate::security::database(&app)?, &server)?;
    Ok(server)
}

#[tauri::command]
pub fn mcp_set_secret(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    server_id: String,
    key: String,
    value: String,
    runtime: State<'_, McpRuntime>,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    let server = find(&crate::security::database(&app)?, &server_id)?;
    set_env(&server, &key, &value)?;
    runtime
        .0
        .lock()
        .map_err(|_| "Estado MCP indisponível.".to_string())?
        .remove(&server_id);
    Ok(())
}

#[tauri::command]
pub fn mcp_set_enabled(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    server_id: String,
    enabled: bool,
    runtime: State<'_, McpRuntime>,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    let changed = crate::security::database(&app)?
        .execute(
            "UPDATE mcp_servers SET enabled=?2 WHERE id=?1",
            params![server_id, enabled as i64],
        )
        .map_err(|_| "Não foi possível atualizar o servidor MCP.".to_string())?;
    if changed != 1 {
        return Err("Servidor MCP não cadastrado.".into());
    }
    if !enabled {
        runtime
            .0
            .lock()
            .map_err(|_| "Estado MCP indisponível.".to_string())?
            .remove(&server_id);
    }
    let _ = app.emit("skills-updated", ());
    Ok(())
}

#[tauri::command]
pub fn mcp_test_connection(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    server_id: String,
    confirmed: bool,
    runtime: State<'_, McpRuntime>,
) -> Result<serde_json::Value, String> {
    crate::require_main(&caller)?;
    if !confirmed {
        return Err("Confirme explicitamente a execução deste programa.".into());
    }
    let server = find(&crate::security::database(&app)?, &server_id)?;
    runtime
        .0
        .lock()
        .map_err(|_| "Estado MCP indisponível.".to_string())?
        .insert(server_id.clone(), RuntimeStatus::Connecting);
    match inspect(&server) {
        Ok((client, tools)) => {
            runtime
                .0
                .lock()
                .map_err(|_| "Estado MCP indisponível.".to_string())?
                .insert(server_id, RuntimeStatus::Connected(client));
            Ok(tools)
        }
        Err(error) => {
            runtime
                .0
                .lock()
                .map_err(|_| "Estado MCP indisponível.".to_string())?
                .insert(server_id, RuntimeStatus::Error(error.clone()));
            Err(error)
        }
    }
}

#[tauri::command]
pub fn mcp_remove_server(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    server_id: String,
    runtime: State<'_, McpRuntime>,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    let db = crate::security::database(&app)?;
    let server = find(&db, &server_id)?;
    runtime
        .0
        .lock()
        .map_err(|_| "Estado MCP indisponível.".to_string())?
        .remove(&server_id);
    remove(&db, &server)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE mcp_servers(id TEXT PRIMARY KEY,name TEXT,command TEXT,args_json TEXT,env_names_json TEXT,enabled INTEGER);").unwrap();
        db
    }

    #[test]
    fn cadastro_guarda_metadados_e_nunca_valores_de_segredo() {
        let db = db();
        let server = McpServer {
            id: "mcp-test".into(),
            name: "Teste".into(),
            command: "fake".into(),
            args: vec!["arg".into()],
            env_names: vec!["TOKEN".into()],
            enabled: false,
            status: "Parado".into(),
            error: None,
        };
        insert(&db, &server).unwrap();
        let row = list(&db).unwrap().remove(0);
        assert_eq!(row.env_names, vec!["TOKEN"]);
        let schema: String = db
            .query_row(
                "SELECT sql FROM sqlite_master WHERE name='mcp_servers'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(!schema.contains("secret"));
        let mut vault = FakeVault::default();
        assert!(set_env_with(&row, "UNDECLARED", "secret-value", &mut vault).is_err());
        set_env_with(&row, "TOKEN", "secret-value", &mut vault).unwrap();
        assert!(!format!("{:?}", list(&db).unwrap()).contains("secret-value"));
        assert_eq!(
            vault.0.get("mcp-test:TOKEN").map(String::as_str),
            Some("secret-value")
        );
    }

    #[test]
    fn remove_apaga_credenciais_e_metadados() {
        let db = db();
        let server = McpServer {
            id: "missing-keyring-test".into(),
            name: "Teste".into(),
            command: "fake".into(),
            args: vec![],
            env_names: vec!["TOKEN".into()],
            enabled: false,
            status: "Parado".into(),
            error: None,
        };
        insert(&db, &server).unwrap();
        let mut vault = FakeVault::default();
        set_env_with(&server, "TOKEN", "segredo", &mut vault).unwrap();
        remove_with(&db, &server, &mut vault).unwrap();
        assert!(list(&db).unwrap().is_empty());
        assert!(vault.0.is_empty());
    }

    #[derive(Default)]
    struct FakeVault(std::collections::HashMap<String, String>);
    impl CredentialVault for FakeVault {
        fn store(&mut self, server_id: &str, key: &str, value: &str) -> Result<(), String> {
            self.0
                .insert(format!("{server_id}:{key}"), value.to_string());
            Ok(())
        }
        fn erase(&mut self, server_id: &str, key: &str) -> Result<(), String> {
            self.0.remove(&format!("{server_id}:{key}"));
            Ok(())
        }
    }
}

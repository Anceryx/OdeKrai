use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::Manager;

const PET_CATALOG: &str = include_str!("../../assets/pets/kenney-mini-characters/pets.json");
const DEFAULT_PET_ID: &str = "character-female-a";

#[derive(Serialize)]
pub struct Conversation {
    id: String,
    title: String,
    created_at: i64,
}

#[derive(Serialize)]
pub struct StoredMessage {
    role: String,
    content: String,
}

fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Não foi possível localizar os dados locais.".to_string())?;
    std::fs::create_dir_all(&dir)
        .map_err(|_| "Não foi possível preparar os dados locais.".to_string())?;
    let db = Connection::open(dir.join("conversations.sqlite3"))
        .map_err(|_| "Não foi possível abrir o histórico local.".to_string())?;
    init_schema(&db)?;
    Ok(db)
}

fn init_schema(db: &Connection) -> Result<(), String> {
    db.execute_batch("PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;
        CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
        CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
        CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);
        CREATE TABLE IF NOT EXISTS pet_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
        .map_err(|_| "Não foi possível preparar o histórico local.".to_string())?;
    Ok(())
}

#[derive(serde::Deserialize)]
struct PetCatalogEntry {
    id: String,
    file: String,
}

fn valid_pet_catalog(json: &str) -> Result<Vec<PetCatalogEntry>, String> {
    let pets: Vec<PetCatalogEntry> = serde_json::from_str(json)
        .map_err(|_| "O catálogo de personagens está ausente ou inválido.".to_string())?;
    if pets.is_empty()
        || pets.iter().any(|pet| {
            pet.id.is_empty()
                || !pet
                    .id
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
                || !pet.file.strip_suffix(".png").is_some_and(|stem| {
                    !stem.is_empty()
                        && stem.bytes().all(|byte| {
                            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-'
                        })
                })
        })
    {
        return Err("O catálogo contém um caminho de personagem inválido.".into());
    }
    Ok(pets)
}

fn pet_id_is_valid(id: &str, manifest: &str) -> bool {
    valid_pet_catalog(manifest).is_ok_and(|pets| pets.iter().any(|pet| pet.id == id))
}

fn selected_pet_from_db(db: &Connection, manifest: &str) -> Result<String, String> {
    let saved: Option<String> = db
        .query_row(
            "SELECT value FROM pet_preferences WHERE key = 'selected'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "N\u{00e3}o foi poss\u{00ed}vel ler o personagem selecionado.".to_string())?;
    if let Some(id) = saved {
        if pet_id_is_valid(&id, manifest) {
            return Ok(id);
        }
        db.execute(
            "INSERT INTO pet_preferences(key, value) VALUES ('selected', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [DEFAULT_PET_ID],
        )
        .map_err(|_| "N\u{00e3}o foi poss\u{00ed}vel atualizar o personagem selecionado.".to_string())?;
    }
    Ok(DEFAULT_PET_ID.to_string())
}

#[tauri::command]
pub fn get_selected_pet(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
) -> Result<String, String> {
    super::require_caller(&caller, &["main", "island", "mascot"])?;
    let db = database(&app)?;
    selected_pet_from_db(&db, PET_CATALOG)
}

#[tauri::command]
pub fn set_selected_pet(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    pet_id: String,
) -> Result<(), String> {
    super::require_main(&caller)?;
    if !pet_id_is_valid(&pet_id, PET_CATALOG) {
        return Err("Personagem inválido.".into());
    }
    let db = database(&app)?;
    db.execute("INSERT INTO pet_preferences(key, value) VALUES ('selected', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [pet_id])
        .map_err(|_| "Não foi possível salvar o personagem selecionado.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_conversations(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
) -> Result<Vec<Conversation>, String> {
    super::require_main(&caller)?;
    let db = database(&app)?;
    read_conversations(&db)
}

fn read_conversations(db: &Connection) -> Result<Vec<Conversation>, String> {
    let mut stmt = db
        .prepare(
            "SELECT id, title, created_at FROM conversations ORDER BY created_at DESC, rowid DESC LIMIT 100",
        )
        .map_err(|_| "Não foi possível ler o histórico local.".to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|_| "Não foi possível ler o histórico local.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível ler o histórico local.".to_string())
}

#[tauri::command]
pub fn load_conversation(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    conversation_id: String,
) -> Result<Vec<StoredMessage>, String> {
    super::require_main(&caller)?;
    let db = database(&app)?;
    let mut stmt = db
        .prepare(
            "SELECT role, content FROM messages WHERE conversation_id = ?1 ORDER BY id LIMIT 100",
        )
        .map_err(|_| "Não foi possível ler a conversa.".to_string())?;
    let rows = stmt
        .query_map([conversation_id], |row| {
            Ok(StoredMessage {
                role: row.get(0)?,
                content: row.get(1)?,
            })
        })
        .map_err(|_| "Não foi possível ler a conversa.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível ler a conversa.".to_string())
}

#[tauri::command]
pub fn append_conversation_message(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    conversation_id: String,
    role: String,
    content: String,
) -> Result<(), String> {
    super::require_main(&caller)?;
    if conversation_id.is_empty()
        || conversation_id.len() > 80
        || !conversation_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        || !matches!(role.as_str(), "user" | "assistant")
        || content.trim().is_empty()
        || content.len() > 1_000_000
    {
        return Err("Mensagem inválida para o histórico.".into());
    }
    let mut db = database(&app)?;
    let tx = db
        .transaction()
        .map_err(|_| "Não foi possível salvar a conversa.".to_string())?;
    if role == "user" {
        let title: String = content.chars().take(80).collect();
        tx.execute(
            "INSERT OR IGNORE INTO conversations (id, title) VALUES (?1, ?2)",
            params![conversation_id, title],
        )
        .map_err(|_| "Não foi possível salvar a conversa.".to_string())?;
    }
    let changed = tx.execute("INSERT INTO messages (conversation_id, role, content) SELECT id, ?2, ?3 FROM conversations WHERE id = ?1", params![conversation_id, role, content])
        .map_err(|_| "Não foi possível salvar a conversa.".to_string())?;
    if changed != 1 {
        return Err("A conversa não foi encontrada.".into());
    }
    tx.commit()
        .map_err(|_| "Não foi possível salvar a conversa.".to_string())
}

#[tauri::command]
pub fn delete_conversation(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    conversation_id: String,
) -> Result<(), String> {
    super::require_main(&caller)?;
    if !valid_id(&conversation_id) {
        return Err("Identificador de conversa inválido.".into());
    }
    let db = database(&app)?;
    db.execute("DELETE FROM conversations WHERE id = ?1", [conversation_id])
        .map_err(|_| "Não foi possível apagar a conversa.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_all_conversations(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
) -> Result<(), String> {
    super::require_main(&caller)?;
    let db = database(&app)?;
    db.execute("DELETE FROM conversations", [])
        .map_err(|_| "Não foi possível apagar o histórico.".to_string())?;
    db.execute_batch("VACUUM")
        .map_err(|_| "Não foi possível concluir a limpeza do histórico.".to_string())
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_and_foreign_keys_are_valid() {
        let db = Connection::open_in_memory().unwrap();
        init_schema(&db).unwrap();
        assert!(db.execute("INSERT INTO messages (conversation_id, role, content) VALUES ('missing','user','olá')", []).is_err());
    }

    #[test]
    fn deleting_conversation_cascades_messages() {
        let db = Connection::open_in_memory().unwrap();
        init_schema(&db).unwrap();
        db.execute(
            "INSERT INTO conversations (id, title) VALUES ('one', 'Um')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES ('one', 'user', 'Olá')",
            [],
        )
        .unwrap();
        db.execute("DELETE FROM conversations WHERE id = 'one'", [])
            .unwrap();
        let count: i64 = db
            .query_row("SELECT count(*) FROM messages", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn conversation_list_includes_title_and_creation_time() {
        let db = Connection::open_in_memory().unwrap();
        init_schema(&db).unwrap();
        db.execute(
            "INSERT INTO conversations (id, title, created_at) VALUES ('one', 'Teste', 1798000000)",
            [],
        )
        .unwrap();
        let items = read_conversations(&db).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Teste");
        assert_eq!(items[0].created_at, 1798000000);
    }

    #[test]
    fn pet_catalog_rejects_missing_json_and_unsafe_paths() {
        assert!(valid_pet_catalog("").is_err());
        assert!(valid_pet_catalog(r#"[{"id":"bad","file":"../secret.png"}]"#).is_err());
        assert!(valid_pet_catalog(r#"[{"id":"bad","file":"C:secret.png"}]"#).is_err());
        assert!(valid_pet_catalog(PET_CATALOG).is_ok());
    }

    #[test]
    fn selected_pet_defaults_and_persists_in_sqlite() {
        let db = Connection::open_in_memory().unwrap();
        init_schema(&db).unwrap();
        assert_eq!(
            selected_pet_from_db(&db, PET_CATALOG).unwrap(),
            DEFAULT_PET_ID
        );
        db.execute(
            "INSERT INTO pet_preferences(key,value) VALUES ('selected','character-male-a')",
            [],
        )
        .unwrap();
        assert_eq!(
            selected_pet_from_db(&db, PET_CATALOG).unwrap(),
            "character-male-a"
        );
        assert!(!pet_id_is_valid("../secret", PET_CATALOG));
    }

    #[test]
    fn selected_pet_migrates_unknown_saved_id_to_default() {
        let db = Connection::open_in_memory().unwrap();
        init_schema(&db).unwrap();
        db.execute(
            "INSERT INTO pet_preferences(key,value) VALUES ('selected','character-no-longer-in-catalog')",
            [],
        )
        .unwrap();

        assert_eq!(
            selected_pet_from_db(&db, PET_CATALOG).unwrap(),
            DEFAULT_PET_ID
        );
        let stored: String = db
            .query_row(
                "SELECT value FROM pet_preferences WHERE key='selected'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored, DEFAULT_PET_ID);
    }
}

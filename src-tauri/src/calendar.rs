use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start: String,
    pub end: String,
    pub location: String,
    pub description: String,
    pub alert_minutes: Option<u32>,
    pub recurrence: String,
}

fn validate(event: &CalendarEvent) -> Result<(), String> {
    if event.id.is_empty()
        || event.id.len() > 80
        || event.title.trim().is_empty()
        || event.title.chars().count() > 200
        || event.location.chars().count() > 500
        || event.description.chars().count() > 4000
        || event.start.len() > 64
        || event.end.len() > 64
        || event.alert_minutes.is_some_and(|n| n > 10080)
        || !matches!(
            event.recurrence.as_str(),
            "none" | "daily" | "weekly" | "monthly"
        )
    {
        return Err("Os dados do evento são inválidos.".into());
    }
    let start = DateTime::parse_from_rfc3339(&event.start)
        .map_err(|_| "O início precisa incluir data, hora e fuso.".to_string())?;
    let end = DateTime::parse_from_rfc3339(&event.end)
        .map_err(|_| "O fim precisa incluir data, hora e fuso.".to_string())?;
    if end <= start {
        return Err("O fim do evento precisa ocorrer depois do início.".into());
    }
    if event.title.contains('\0')
        || event.location.contains('\0')
        || event.description.contains('\0')
    {
        return Err("O evento contém caracteres inválidos.".into());
    }
    Ok(())
}

fn db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Não foi possível localizar os dados locais.".to_string())?;
    std::fs::create_dir_all(&dir)
        .map_err(|_| "Não foi possível preparar os dados locais.".to_string())?;
    let conn = Connection::open(dir.join("calendar.sqlite3"))
        .map_err(|_| "Não foi possível abrir a agenda local.".to_string())?;
    init(&conn)?;
    Ok(conn)
}

fn init(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, location TEXT NOT NULL, description TEXT NOT NULL, alert_minutes INTEGER, recurrence TEXT NOT NULL CHECK(recurrence IN ('none','daily','weekly','monthly')));")
        .map_err(|_| "Não foi possível preparar a agenda local.".to_string())
}

fn save(conn: &Connection, event: &CalendarEvent) -> Result<(), String> {
    validate(event)?;
    conn.execute("INSERT INTO calendar_events(id,title,start,end,location,description,alert_minutes,recurrence) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(id) DO UPDATE SET title=excluded.title,start=excluded.start,end=excluded.end,location=excluded.location,description=excluded.description,alert_minutes=excluded.alert_minutes,recurrence=excluded.recurrence", params![event.id,event.title,event.start,event.end,event.location,event.description,event.alert_minutes,event.recurrence])
        .map_err(|_| "Não foi possível salvar o evento.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn calendar_list_events(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    from: String,
    to: String,
) -> Result<Vec<CalendarEvent>, String> {
    crate::require_main(&caller)?;
    let from = DateTime::parse_from_rfc3339(&from)
        .map_err(|_| "O início do intervalo é inválido.".to_string())?
        .with_timezone(&Utc)
        .to_rfc3339();
    let to = DateTime::parse_from_rfc3339(&to)
        .map_err(|_| "O fim do intervalo é inválido.".to_string())?
        .with_timezone(&Utc)
        .to_rfc3339();
    if from >= to {
        return Err("O intervalo da agenda é inválido.".into());
    }
    let conn = db(&app)?;
    let mut stmt = conn.prepare("SELECT id,title,start,end,location,description,alert_minutes,recurrence FROM calendar_events WHERE julianday(start) < julianday(?2) AND julianday(end) > julianday(?1) ORDER BY julianday(start) LIMIT 1000").map_err(|_| "Não foi possível consultar a agenda.".to_string())?;
    let rows = stmt
        .query_map(params![from, to], |r| {
            Ok(CalendarEvent {
                id: r.get(0)?,
                title: r.get(1)?,
                start: r.get(2)?,
                end: r.get(3)?,
                location: r.get(4)?,
                description: r.get(5)?,
                alert_minutes: r.get(6)?,
                recurrence: r.get(7)?,
            })
        })
        .map_err(|_| "Não foi possível consultar a agenda.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Não foi possível ler os eventos.".into())
}

#[tauri::command]
pub fn calendar_save_event(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    event: CalendarEvent,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    save(&db(&app)?, &event)
}

#[tauri::command]
pub fn calendar_delete_event(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    id: String,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    if id.is_empty() || id.len() > 80 {
        return Err("Identificador de evento inválido.".into());
    }
    db(&app)?
        .execute("DELETE FROM calendar_events WHERE id=?1", [id])
        .map_err(|_| "Não foi possível apagar o evento.".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn event() -> CalendarEvent {
        CalendarEvent {
            id: "evt-1".into(),
            title: "Reunião".into(),
            start: "2030-03-10T01:30:00-05:00".into(),
            end: "2030-03-10T02:30:00-05:00".into(),
            location: "".into(),
            description: "".into(),
            alert_minutes: Some(10),
            recurrence: "weekly".into(),
        }
    }

    #[test]
    fn saves_updates_and_lists_events_by_absolute_time() {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        let mut e = event();
        save(&conn, &e).unwrap();
        e.title = "Atualizada".into();
        e.recurrence = "monthly".into();
        save(&conn, &e).unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM calendar_events WHERE title='Atualizada' AND recurrence='monthly' AND julianday(start) < julianday(?1) AND julianday(end) > julianday(?2)",
            params!["2030-03-10T08:00:00Z", "2030-03-10T06:00:00Z"],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 1);
        assert_ne!(
            DateTime::parse_from_rfc3339(&e.start)
                .unwrap()
                .with_timezone(&Utc),
            DateTime::parse_from_rfc3339("2030-03-10T01:30:00Z").unwrap()
        );
    }

    #[test]
    fn rejects_missing_timezone_past_end_and_invalid_recurrence() {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        let mut e = event();
        e.start = "2030-03-10T01:30:00".into();
        assert!(save(&conn, &e).is_err());
        e = event();
        e.end = "2030-03-10T01:00:00-05:00".into();
        assert!(save(&conn, &e).is_err());
        e = event();
        e.recurrence = "yearly".into();
        assert!(save(&conn, &e).is_err());
    }
}

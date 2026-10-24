use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{imageops::FilterType, ImageFormat, ImageReader, Limits};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::io::Cursor;
use tauri::Manager;

const MAX_FILE_BYTES: usize = 5 * 1024 * 1024;
const MAX_DIMENSION: u32 = 4096;
const MAX_PIXELS: u64 = 16_000_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    display_name: String,
    nickname: String,
    avatar_data_url: Option<String>,
}

fn paths(app: &tauri::AppHandle) -> Result<(std::path::PathBuf, Connection), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Não foi possível localizar os dados do aplicativo.".to_string())?;
    std::fs::create_dir_all(&dir)
        .map_err(|_| "Não foi possível preparar os dados do aplicativo.".to_string())?;
    let db = Connection::open(dir.join("profile.sqlite3"))
        .map_err(|_| "Não foi possível abrir o perfil local.".to_string())?;
    db.execute_batch("PRAGMA secure_delete = ON; CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), display_name TEXT NOT NULL, nickname TEXT NOT NULL);")
        .map_err(|_| "Não foi possível preparar o perfil local.".to_string())?;
    Ok((dir, db))
}

fn read(app: &tauri::AppHandle) -> Result<UserProfile, String> {
    let (dir, db) = paths(app)?;
    let values: Option<(String, String)> = db
        .query_row(
            "SELECT display_name,nickname FROM profile WHERE id=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| "Não foi possível ler o perfil local.".to_string())?;
    let (display_name, nickname) = values.unwrap_or_default();
    let avatar = dir.join("profile-avatar.png");
    let avatar_data_url = if avatar.is_file() {
        Some(format!(
            "data:image/png;base64,{}",
            STANDARD.encode(
                std::fs::read(avatar).map_err(|_| "Não foi possível ler o avatar.".to_string())?
            )
        ))
    } else {
        None
    };
    Ok(UserProfile {
        display_name,
        nickname,
        avatar_data_url,
    })
}

#[tauri::command]
pub fn get_profile(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
) -> Result<UserProfile, String> {
    super::require_main(&caller)?;
    read(&app)
}

#[tauri::command]
pub fn save_profile(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    display_name: String,
    nickname: String,
) -> Result<UserProfile, String> {
    super::require_main(&caller)?;
    let display_name = clean_text(&display_name, 80, true)?;
    let nickname = clean_text(&nickname, 40, false)?;
    let (_, db) = paths(&app)?;
    db.execute("INSERT INTO profile(id,display_name,nickname) VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,nickname=excluded.nickname", params![display_name,nickname])
        .map_err(|_| "Não foi possível salvar o perfil.".to_string())?;
    read(&app)
}

#[tauri::command]
pub fn save_profile_avatar(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    data_url: String,
) -> Result<UserProfile, String> {
    super::require_main(&caller)?;
    let (mime, encoded) = data_url
        .split_once(",")
        .ok_or("Arquivo de imagem inválido.")?;
    let expected = match mime {
        "data:image/png;base64" => ImageFormat::Png,
        "data:image/jpeg;base64" => ImageFormat::Jpeg,
        "data:image/webp;base64" => ImageFormat::WebP,
        _ => return Err("Escolha uma imagem PNG, JPEG ou WebP.".into()),
    };
    if encoded.len() > (MAX_FILE_BYTES * 4 / 3 + 8) {
        return Err("A imagem excede o limite de 5 MB.".into());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Arquivo de imagem inválido.")?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err("A imagem excede o limite de 5 MB.".into());
    }
    let png = normalize_avatar(&bytes, expected)?;
    let (dir, _) = paths(&app)?;
    std::fs::write(dir.join("profile-avatar.png"), png)
        .map_err(|_| "Não foi possível salvar o avatar.".to_string())?;
    read(&app)
}

#[tauri::command]
pub fn remove_profile_avatar(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
) -> Result<UserProfile, String> {
    super::require_main(&caller)?;
    let (dir, _) = paths(&app)?;
    match std::fs::remove_file(dir.join("profile-avatar.png")) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Não foi possível remover o avatar.".into()),
    }
    read(&app)
}

fn clean_text(value: &str, limit: usize, required: bool) -> Result<String, String> {
    let value = value.trim();
    if value.chars().count() > limit
        || value.chars().any(char::is_control)
        || (required && value.is_empty())
    {
        return Err("O texto do perfil está vazio ou excede o limite permitido.".into());
    }
    Ok(value.to_string())
}

fn normalize_avatar(bytes: &[u8], expected: ImageFormat) -> Result<Vec<u8>, String> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err("A imagem excede o limite de 5 MB.".into());
    }
    let matches = match expected {
        ImageFormat::Png => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        ImageFormat::Jpeg => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        ImageFormat::WebP => {
            bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP"
        }
        _ => false,
    };
    if !matches {
        return Err("O conteúdo do arquivo não corresponde a PNG, JPEG ou WebP.".into());
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), expected);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "A imagem está corrompida ou excede os limites permitidos.".to_string())?;
    let (width, height) = (image.width(), image.height());
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("A imagem excede o limite de 16 megapixels.".into());
    }
    let side = width.min(height);
    let square = image
        .crop_imm((width - side) / 2, (height - side) / 2, side, side)
        .resize_exact(256, 256, FilterType::Lanczos3);
    let mut output = Cursor::new(Vec::new());
    square
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|_| "Não foi possível processar o avatar.".to_string())?;
    Ok(output.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, RgbImage};

    #[test]
    fn rejects_svg_and_mismatched_or_corrupt_data() {
        assert!(normalize_avatar(b"<svg/>", ImageFormat::Png).is_err());
        assert!(normalize_avatar(b"\x89PNG\r\n\x1a\ncorrupt", ImageFormat::Png).is_err());
        assert!(normalize_avatar(b"GIF89a", ImageFormat::Png).is_err());
    }

    #[test]
    fn crops_and_reencodes_image_to_metadata_free_256_square_png() {
        let source =
            DynamicImage::ImageRgb8(RgbImage::from_pixel(320, 180, image::Rgb([20, 30, 40])));
        let mut bytes = Cursor::new(Vec::new());
        source.write_to(&mut bytes, ImageFormat::Jpeg).unwrap();
        let normalized = normalize_avatar(bytes.get_ref(), ImageFormat::Jpeg).unwrap();
        let decoded = image::load_from_memory_with_format(&normalized, ImageFormat::Png).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (256, 256));
        assert!(normalized.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(!normalized.windows(4).any(|chunk| chunk == b"eXIf"));
    }

    #[test]
    fn profile_fields_reject_control_and_oversized_values() {
        assert!(clean_text("ana\nadmin", 80, true).is_err());
        assert!(clean_text("x".repeat(81).as_str(), 80, true).is_err());
        assert_eq!(clean_text(" Ana ", 80, true).unwrap(), "Ana");
    }

    #[test]
    fn rejects_images_exceeding_encoded_file_limit() {
        let oversized = vec![0u8; MAX_FILE_BYTES + 1];
        assert!(normalize_avatar(&oversized, ImageFormat::Png).is_err());
    }
}

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{imageops::FilterType, DynamicImage, ImageFormat, Limits};
use serde::Serialize;
use std::io::Cursor;
use tauri::Manager;

pub(crate) const MAX_SCREENSHOT_BYTES: usize = 512 * 1024;
const MAX_SOURCE_IMAGE_BYTES: usize = 64 * 1024 * 1024;
const MAX_SCREENSHOT_PIXELS: u64 = 40_000_000;
const MAX_DIMENSION: u32 = 1280;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScreenshotPreview {
    pub data_url: String,
    pub destination: String,
    pub width: u32,
    pub height: u32,
}

pub(crate) fn normalize_image(bytes: &[u8]) -> Result<(Vec<u8>, u32, u32), String> {
    if bytes.is_empty() || bytes.len() > MAX_SOURCE_IMAGE_BYTES {
        return Err("A captura excede o limite de entrada.".into());
    }
    let format =
        image::guess_format(bytes).map_err(|_| "A captura não é uma imagem compatível.")?;
    if !matches!(
        format,
        ImageFormat::Bmp | ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP
    ) {
        return Err("A captura precisa estar em BMP, PNG, JPEG ou WebP.".into());
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(12_000);
    limits.max_image_height = Some(12_000);
    limits.max_alloc = Some(192 * 1024 * 1024);
    let mut decoder = image::ImageReader::with_format(Cursor::new(bytes), format);
    decoder.limits(limits);
    let image = decoder
        .decode()
        .map_err(|_| "Não foi possível processar a captura.")?;
    if u64::from(image.width()) * u64::from(image.height()) > MAX_SCREENSHOT_PIXELS {
        return Err("A captura tem resolução acima do limite permitido.".into());
    }

    let mut scaled = image.resize(MAX_DIMENSION, MAX_DIMENSION, FilterType::Lanczos3);
    for quality in [78, 68, 58, 48] {
        let bytes = encode_jpeg(&scaled, quality)?;
        if bytes.len() <= MAX_SCREENSHOT_BYTES {
            return Ok((bytes, scaled.width(), scaled.height()));
        }
        let width = (scaled.width() as f32 * 0.8).round().max(1.0) as u32;
        let height = (scaled.height() as f32 * 0.8).round().max(1.0) as u32;
        scaled = scaled.resize_exact(width, height, FilterType::Lanczos3);
    }
    let bytes = encode_jpeg(&scaled, 38)?;
    if bytes.len() > MAX_SCREENSHOT_BYTES {
        return Err("Não foi possível reduzir a captura ao limite de 512 KiB.".into());
    }
    Ok((bytes, scaled.width(), scaled.height()))
}

fn encode_jpeg(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut output = Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality)
        .encode_image(image)
        .map_err(|_| "Não foi possível preparar a captura.")?;
    Ok(output.into_inner())
}

#[tauri::command]
pub(crate) fn capture_screen_preview(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
) -> Result<ScreenshotPreview, String> {
    crate::require_main(&caller)?;
    let bytes = capture_virtual_screen()?;
    let (jpeg, width, height) = normalize_image(&bytes)?;
    let destination = screenshot_directory(&app)?;
    Ok(ScreenshotPreview {
        data_url: format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg)),
        destination: destination.to_string_lossy().into_owned(),
        width,
        height,
    })
}

#[tauri::command]
pub(crate) fn save_screen_capture(
    app: tauri::AppHandle,
    caller: tauri::WebviewWindow,
    image_base64: String,
) -> Result<String, String> {
    crate::require_main(&caller)?;
    if image_base64.len() > MAX_SCREENSHOT_BYTES * 2 {
        return Err("A captura excede o limite de 512 KiB.".into());
    }
    let input = STANDARD
        .decode(image_base64)
        .map_err(|_| "A captura temporária é inválida.")?;
    let (jpeg, _, _) = normalize_image(&input)?;
    let directory = screenshot_directory(&app)?;
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Não foi possível criar a pasta local de capturas.")?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "Não foi possível nomear a captura.")?
        .as_nanos();
    let path = directory.join(format!("captura-{timestamp}.jpg"));
    std::fs::write(&path, jpeg).map_err(|_| "Não foi possível salvar a captura local.")?;
    Ok(path.to_string_lossy().into_owned())
}

fn screenshot_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "Não foi possível localizar os dados locais do OdeKrai.")?
        .join("screenshots"))
}

#[cfg(windows)]
fn capture_virtual_screen() -> Result<Vec<u8>, String> {
    use std::{ffi::c_void, mem::size_of, ptr::null_mut};
    use windows_sys::Win32::{
        Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
            GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS, SRCCOPY,
        },
        UI::WindowsAndMessaging::{
            GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
            SM_YVIRTUALSCREEN,
        },
    };

    let left = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let top = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };
    if width <= 0
        || height <= 0
        || width > 12_000
        || height > 12_000
        || i64::from(width) * i64::from(height) > MAX_SCREENSHOT_PIXELS as i64
    {
        return Err("A resolução da tela não está dentro do limite permitido.".into());
    }

    unsafe {
        let screen = GetDC(null_mut());
        if screen.is_null() {
            return Err("Não foi possível acessar a tela do Windows.".into());
        }
        let memory = CreateCompatibleDC(screen);
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        if memory.is_null() || bitmap.is_null() {
            if !bitmap.is_null() {
                DeleteObject(bitmap);
            }
            if !memory.is_null() {
                DeleteDC(memory);
            }
            ReleaseDC(null_mut(), screen);
            return Err("Não foi possível preparar a captura da tela.".into());
        }
        let previous = SelectObject(memory, bitmap);
        if previous.is_null()
            || BitBlt(memory, 0, 0, width, height, screen, left, top, SRCCOPY) == 0
        {
            if !previous.is_null() {
                SelectObject(memory, previous);
            }
            DeleteObject(bitmap);
            DeleteDC(memory);
            ReleaseDC(null_mut(), screen);
            return Err("O Windows não conseguiu capturar a tela.".into());
        }
        SelectObject(memory, previous);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        };
        let byte_count = (width as usize)
            .checked_mul(height as usize)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or("A captura excede o limite permitido.")?;
        let mut pixels = vec![0u8; byte_count];
        let copied = GetDIBits(
            memory,
            bitmap,
            0,
            height as u32,
            pixels.as_mut_ptr().cast::<c_void>(),
            &mut info,
            DIB_RGB_COLORS,
        );
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(null_mut(), screen);
        if copied != height {
            return Err("Não foi possível ler os pixels da captura.".into());
        }
        // GDI returns BGRA; encode a simple BMP container for the common image normalizer.
        let mut bmp = Vec::with_capacity(54 + pixels.len());
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&(54u32 + pixels.len() as u32).to_le_bytes());
        bmp.extend_from_slice(&[0; 4]);
        bmp.extend_from_slice(&54u32.to_le_bytes());
        bmp.extend_from_slice(&40u32.to_le_bytes());
        bmp.extend_from_slice(&width.to_le_bytes());
        bmp.extend_from_slice(&(-height).to_le_bytes());
        bmp.extend_from_slice(&1u16.to_le_bytes());
        bmp.extend_from_slice(&32u16.to_le_bytes());
        bmp.extend_from_slice(&0u32.to_le_bytes());
        bmp.extend_from_slice(&(pixels.len() as u32).to_le_bytes());
        bmp.extend_from_slice(&[0; 16]);
        for pixel in pixels.as_chunks_mut::<4>().0 {
            pixel[3] = 255;
        }
        bmp.extend_from_slice(&pixels);
        Ok(bmp)
    }
}

#[cfg(not(windows))]
fn capture_virtual_screen() -> Result<Vec<u8>, String> {
    Err("A captura de tela está disponível somente no Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    fn test_image(width: u32, height: u32) -> Vec<u8> {
        let image =
            DynamicImage::ImageRgb8(ImageBuffer::from_pixel(width, height, Rgb([40, 80, 120])));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        bytes.into_inner()
    }

    #[test]
    fn normalizes_image_and_strips_source_format_metadata() {
        let (jpeg, width, height) = normalize_image(&test_image(1600, 900)).unwrap();
        assert_eq!((width, height), (1280, 720));
        assert!(jpeg.len() <= MAX_SCREENSHOT_BYTES);
        assert_eq!(image::guess_format(&jpeg).unwrap(), ImageFormat::Jpeg);
    }

    #[test]
    fn rejects_invalid_and_excessively_large_image_input() {
        assert!(normalize_image(b"not an image").is_err());
        assert!(normalize_image(&vec![0; MAX_SOURCE_IMAGE_BYTES + 1]).is_err());
    }
}

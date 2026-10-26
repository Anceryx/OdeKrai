use reqwest::{header, redirect::Policy, Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
struct Manifest {
    models: Vec<Model>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Model {
    id: String,
    repository: String,
    file: String,
    size_bytes: Option<u64>,
    sha256: Option<String>,
    license: Option<String>,
    download_hosts: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    model_id: String,
    received_bytes: u64,
    total_bytes: u64,
}

#[derive(Default)]
pub struct Downloads(Mutex<HashMap<String, CancellationToken>>);

#[tauri::command]
pub async fn download_local_model(
    caller: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Downloads>,
    model_id: String,
    destination: String,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    let model = manifest_model(&model_id)?;
    if model.size_bytes.is_none() || model.sha256.is_none() || model.license.is_none() {
        return Err("Este arquivo ainda não tem tamanho, hash e licença verificados.".into());
    }
    let folder = PathBuf::from(destination);
    fs::create_dir_all(&folder)
        .map_err(|_| "Não foi possível preparar a pasta escolhida.".to_string())?;
    let folder = folder
        .canonicalize()
        .map_err(|_| "A pasta escolhida não é válida.".to_string())?;
    let final_path = folder.join(&model.file);
    let partial_path = folder.join(format!("{}.part", model.file));
    let prompt = format!(
        "Baixar o modelo {}?\nTamanho: {} bytes\nLicença: {}\nDestino: {}\n\nO arquivo será obtido por HTTPS e validado por SHA-256.",
        model.id,
        model.size_bytes.unwrap_or_default(),
        model.license.as_deref().unwrap_or("não verificada"),
        folder.display()
    );
    if !crate::security::confirm_native(prompt).await {
        return Err("Download cancelado pelo usuário.".into());
    }
    let token = CancellationToken::new();
    {
        let mut active = state
            .0
            .lock()
            .map_err(|_| "Não foi possível iniciar o download.".to_string())?;
        if active.contains_key(&model_id) {
            return Err("Este modelo já está sendo baixado.".into());
        }
        active.insert(model_id.clone(), token.clone());
    }
    let result = download_file(&app, &model, &final_path, &partial_path, token).await;
    if let Ok(mut active) = state.0.lock() {
        active.remove(&model_id);
    }
    result
}

#[tauri::command]
pub fn cancel_local_model_download(
    caller: tauri::WebviewWindow,
    state: tauri::State<'_, Downloads>,
    model_id: String,
) -> Result<bool, String> {
    crate::require_main(&caller)?;
    let token = state
        .0
        .lock()
        .map_err(|_| "Não foi possível cancelar o download.".to_string())?
        .get(&model_id)
        .cloned();
    if let Some(token) = token {
        token.cancel();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn delete_local_model(
    caller: tauri::WebviewWindow,
    model_id: String,
    destination: String,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    let model = manifest_model(&model_id)?;
    let folder = PathBuf::from(destination)
        .canonicalize()
        .map_err(|_| "A pasta de modelos não existe.".to_string())?;
    let path = folder.join(&model.file);
    if path.parent() != Some(folder.as_path()) {
        return Err("O destino do modelo é inválido.".into());
    }
    if !crate::security::confirm_native(format!(
        "Apagar o modelo {} de {}?",
        model.id,
        folder.display()
    ))
    .await
    {
        return Err("Exclusão cancelada pelo usuário.".into());
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Não foi possível apagar o arquivo do modelo.".into()),
    }
}

async fn download_file(
    app: &tauri::AppHandle,
    model: &Model,
    destination: &Path,
    partial: &Path,
    token: CancellationToken,
) -> Result<(), String> {
    let size = model
        .size_bytes
        .ok_or("O tamanho do arquivo não foi verificado.")?;
    let expected_hash = model
        .sha256
        .as_deref()
        .ok_or("O hash do arquivo não foi verificado.")?;
    if destination.exists() {
        return Err("Este arquivo já existe no destino.".into());
    }
    let existing = fs::metadata(partial).map(|meta| meta.len()).unwrap_or(0);
    if existing > size {
        fs::remove_file(partial)
            .map_err(|_| "Não foi possível reiniciar o arquivo parcial.".to_string())?;
    }
    let existing = fs::metadata(partial).map(|meta| meta.len()).unwrap_or(0);
    let mut hash = Sha256::new();
    if existing > 0 {
        let mut prior = fs::File::open(partial)
            .map_err(|_| "Não foi possível retomar o arquivo parcial.".to_string())?;
        let mut buffer = [0; 1024 * 1024];
        loop {
            let count = std::io::Read::read(&mut prior, &mut buffer)
                .map_err(|_| "Não foi possível retomar o arquivo parcial.".to_string())?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
        }
    }
    let mut url = Url::parse(&format!(
        "https://huggingface.co/{}/resolve/main/{}?download=true",
        model.repository, model.file
    ))
    .map_err(|_| "O endereço do modelo é inválido.".to_string())?;
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|_| "Não foi possível preparar o download.".to_string())?;
    let mut request = client.get(url.clone());
    if existing > 0 {
        request = request.header(header::RANGE, format!("bytes={existing}-"));
    }
    let mut response = request.send().await.map_err(|_| {
        "O download falhou; o arquivo parcial foi mantido para retomada.".to_string()
    })?;
    for _ in 0..5 {
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("O servidor enviou um redirecionamento inválido.")?;
            url = url
                .join(location)
                .map_err(|_| "O endereço redirecionado é inválido.".to_string())?;
            if url.scheme() != "https"
                || !model
                    .download_hosts
                    .iter()
                    .any(|host| host == url.host_str().unwrap_or_default())
            {
                return Err("O servidor redirecionou para um host fora da lista permitida.".into());
            }
            let mut next = client.get(url.clone());
            if existing > 0 {
                next = next.header(header::RANGE, format!("bytes={existing}-"));
            }
            response = next.send().await.map_err(|_| {
                "O download falhou; o arquivo parcial foi mantido para retomada.".to_string()
            })?;
        } else {
            break;
        }
    }
    if response.status().is_redirection() {
        return Err("O servidor excedeu o limite de redirecionamentos.".into());
    }
    if existing > 0 && response.status() == StatusCode::OK {
        hash = Sha256::new();
        fs::write(partial, [])
            .map_err(|_| "Não foi possível reiniciar o arquivo parcial.".to_string())?;
    } else if existing > 0 && response.status() != StatusCode::PARTIAL_CONTENT {
        return Err("O servidor não aceitou a retomada do download.".into());
    } else if existing == 0 && !response.status().is_success() {
        return Err("O servidor não disponibilizou o modelo.".into());
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(partial)
        .map_err(|_| "Não foi possível gravar o arquivo do modelo.".to_string())?;
    let mut received = if existing > 0 && response.status() == StatusCode::PARTIAL_CONTENT {
        existing
    } else {
        0
    };
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        "O download foi interrompido; o arquivo parcial foi mantido para retomada.".to_string()
    })? {
        if token.is_cancelled() {
            return Err("Download cancelado; o arquivo parcial foi mantido para retomada.".into());
        }
        received += chunk.len() as u64;
        if received > size {
            return Err("O arquivo recebido excede o tamanho informado no manifesto.".into());
        }
        hash.update(&chunk);
        file.write_all(&chunk)
            .map_err(|_| "Não foi possível gravar o arquivo do modelo.".to_string())?;
        let _ = app.emit(
            "local-model-download-progress",
            DownloadProgress {
                model_id: model.id.clone(),
                received_bytes: received,
                total_bytes: size,
            },
        );
    }
    file.sync_all()
        .map_err(|_| "Não foi possível finalizar a gravação do modelo.".to_string())?;
    if received != size {
        return Err("O download terminou antes do tamanho esperado; tente retomar.".into());
    }
    let actual_hash = format!("{:x}", hash.finalize());
    if actual_hash != expected_hash {
        return Err("A verificação SHA-256 falhou; o arquivo parcial foi mantido.".into());
    }
    fs::rename(partial, destination)
        .map_err(|_| "Não foi possível finalizar o arquivo do modelo.".to_string())?;
    Ok(())
}

fn manifest_model(id: &str) -> Result<Model, String> {
    let manifest: Manifest = serde_json::from_str(include_str!("../resources/local-models.json"))
        .map_err(|_| "O catálogo de modelos está inválido.".to_string())?;
    let model = manifest
        .models
        .into_iter()
        .find(|model| model.id == id)
        .ok_or_else(|| "Modelo não encontrado no catálogo.")?;
    if Path::new(&model.file)
        .file_name()
        .and_then(|name| name.to_str())
        != Some(model.file.as_str())
        || model.file.contains("..")
        || model.download_hosts.is_empty()
        || model.download_hosts.iter().any(|host| {
            host.is_empty()
                || host.contains('/')
                || host.contains(':')
                || !host.chars().all(|character| {
                    character.is_ascii_alphanumeric() || character == '.' || character == '-'
                })
        })
    {
        return Err("O catálogo contém um destino ou host inválido.".into());
    }
    Ok(model)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manifest_download_hosts_are_https_allowlisted() {
        let model = manifest_model("qwen35-2b-q4km").unwrap();
        assert!(model.download_hosts.contains(&"huggingface.co".into()));
        assert!(model
            .download_hosts
            .iter()
            .all(|host| !host.contains('/') && !host.contains(':')));
    }
    #[test]
    fn manifest_file_names_cannot_escape_destination() {
        let model = manifest_model("qwen35-2b-q4km").unwrap();
        assert_eq!(Path::new(&model.file).components().count(), 1);
        assert!(!model.file.contains(".."));
    }
}

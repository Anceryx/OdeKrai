use super::catalog::catalog_entry;
use reqwest::{header, redirect::Policy, Client};
use std::time::Duration;

pub(super) fn http_client(timeout_seconds: u64) -> Result<Client, String> {
    Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|_| "Não foi possível preparar uma conexão segura.".to_string())
}

pub(super) fn provider_client(
    provider_id: &str,
    base_url: &str,
    timeout_seconds: u64,
) -> Result<Client, String> {
    if provider_id != "local" {
        return http_client(timeout_seconds);
    }
    let url = reqwest::Url::parse(base_url.trim())
        .map_err(|_| "Informe um endereço local válido.".to_string())?;
    let addresses = super::endpoint::validate_local_url(&url)?;
    Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(timeout_seconds.min(30)))
        .resolve_to_addrs(url.host_str().unwrap_or_default(), &addresses)
        .build()
        .map_err(|_| "Não foi possível preparar a conexão local.".to_string())
}

pub(super) fn provider_http_error(status: u16) -> String {
    match status {
        400 => {
            format!("O provedor rejeitou o modelo ou os parâmetros da solicitação (HTTP {status}).")
        }
        401 | 403 => format!("A credencial é inválida ou não tem permissão (HTTP {status})."),
        404 => "O endpoint ou modelo não foi encontrado (HTTP 404).".into(),
        408 => "O provedor atingiu o tempo limite (HTTP 408). Tente novamente.".into(),
        429 => "O limite de uso deste provedor foi atingido (HTTP 429). Consulte os limites do seu plano e tente novamente mais tarde.".into(),
        500..=599 => format!("O serviço do provedor está indisponível (HTTP {status})."),
        _ => format!("O provedor respondeu com HTTP {status}."),
    }
}

pub(super) fn header_value(value: &str) -> Result<header::HeaderValue, String> {
    header::HeaderValue::from_str(value)
        .map_err(|_| "A credencial contém caracteres inválidos para uma requisição.".to_string())
}

pub(super) trait AuthRequest {
    fn pipe_auth(self, provider_id: &str, credential: &str) -> Result<Self, String>
    where
        Self: Sized;
}

impl AuthRequest for reqwest::RequestBuilder {
    fn pipe_auth(self, provider_id: &str, credential: &str) -> Result<Self, String> {
        if provider_id == "local" && credential.is_empty() {
            return Ok(self);
        }
        let entry = catalog_entry(provider_id)
            .ok_or("A autenticação deste provedor não está cadastrada.")?;
        match entry.auth_header.as_deref() {
            Some("x-api-key") => Ok(self.header("x-api-key", header_value(credential)?)),
            Some("api-key") => Ok(self.header("api-key", header_value(credential)?)),
            Some("Authorization") => {
                Ok(self.header(header::AUTHORIZATION, bearer_value(credential)?))
            }
            _ => Err("O método de autenticação deste provedor ainda não está implementado.".into()),
        }
    }
}

fn bearer_value(value: &str) -> Result<header::HeaderValue, String> {
    header::HeaderValue::from_str(&format!("Bearer {value}"))
        .map_err(|_| "A credencial contém caracteres inválidos para uma requisição.".to_string())
}

pub(super) fn safe_transport_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "O provedor demorou para responder. Tente novamente.".into()
    } else if error.is_connect() {
        "Não foi possível conectar ao provedor. Verifique sua conexão.".into()
    } else {
        "A comunicação segura com o provedor falhou.".into()
    }
}

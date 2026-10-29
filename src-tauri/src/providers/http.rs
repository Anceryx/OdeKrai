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
        401 => "O provedor recusou a credencial (HTTP 401). Confira a chave em Conectores de IA.".into(),
        403 => "O provedor negou permissão para esta operação (HTTP 403). Confira o acesso da chave e do modelo.".into(),
        404 => "O endpoint ou modelo não foi encontrado (HTTP 404).".into(),
        408 => "O provedor atingiu o tempo limite (HTTP 408). Tente novamente.".into(),
        429 => "O limite de uso deste provedor foi atingido (HTTP 429). Consulte os limites do seu plano e tente novamente mais tarde.".into(),
        500..=599 => format!("O serviço do provedor está indisponível (HTTP {status})."),
        _ => format!("O provedor respondeu com HTTP {status}."),
    }
}

pub(super) fn provider_http_error_with_body(status: u16, body: &str) -> String {
    if status != 400 {
        return provider_http_error(status);
    }
    let normalized = body.to_ascii_lowercase();
    if normalized.contains("function") && normalized.contains("name") {
        return "O provedor recusou o nome de uma ferramenta (HTTP 400). Confira a compatibilidade do modelo.".into();
    }
    if normalized.contains("schema") || normalized.contains("parameters") {
        return "O provedor recusou o schema de ferramenta (HTTP 400). Confira a compatibilidade do modelo.".into();
    }
    if normalized.contains("reasoning_effort") {
        return "O modelo recusou a configuração de raciocínio enviada (HTTP 400). Confira a compatibilidade do modelo.".into();
    }
    provider_http_error(status)
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

#[cfg(test)]
mod tests {
    use super::provider_http_error_with_body;
    use std::{
        io::{Read, Write},
        time::Duration,
    };

    #[tokio::test]
    async fn mock_http_provider_statuses_are_classified_without_echoing_response_bodies() {
        let cases = [
            (
                400,
                r#"{"error":{"message":"Invalid function name: files.read private-user-content"}}"#,
                "nome de uma ferramenta",
            ),
            (
                401,
                r#"{"error":{"message":"invalid api key private-user-content"}}"#,
                "HTTP 401",
            ),
            (
                403,
                r#"{"error":{"message":"model access denied private-user-content"}}"#,
                "negou permissão",
            ),
            (
                429,
                r#"{"error":{"message":"rate limit private-user-content"}}"#,
                "HTTP 429",
            ),
            (
                500,
                r#"{"error":{"message":"internal error private-user-content"}}"#,
                "HTTP 500",
            ),
        ];

        for (status, body, expected) in cases {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let response_body = body.to_owned();
            let server = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = [0_u8; 1024];
                let _ = socket.read(&mut request);
                write!(
                    socket,
                    "HTTP/1.1 {status} Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
                    response_body.len()
                )
                .unwrap();
            });
            let response = reqwest::Client::new()
                .get(format!("http://{address}/mock"))
                .send()
                .await
                .unwrap();
            let actual_status = response.status().as_u16();
            let response_body = response.text().await.unwrap();
            let safe_error = provider_http_error_with_body(actual_status, &response_body);
            server.join().unwrap();

            assert_eq!(actual_status, status);
            assert!(safe_error.contains(expected), "{safe_error}");
            assert!(!safe_error.contains("private-user-content"));
        }
    }
}

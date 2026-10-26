use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_opener::OpenerExt;
use url::Url;

pub fn validate_external_url(value: &str) -> Result<String, &'static str> {
    if value.is_empty()
        || value.len() > 2048
        || value.trim() != value
        || value.chars().any(char::is_control)
        || value.contains('\\')
        || value.chars().any(char::is_whitespace)
        || has_encoded_control(value)
    {
        return Err("O endereço do link é inválido.");
    }

    let url = Url::parse(value).map_err(|_| "O endereço do link é inválido.")?;
    match url.scheme() {
        "http" | "https"
            if url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && !is_private_address(&url) =>
        {
            Ok(url.to_string())
        }
        "mailto" if valid_mailto_address(url.path()) => Ok(url.to_string()),
        _ => Err("Este tipo de link não pode ser aberto."),
    }
}

fn is_private_address(url: &Url) -> bool {
    let Some(host) = url.host() else { return true };
    let ip = match host {
        url::Host::Ipv4(ip) => Some(std::net::IpAddr::V4(ip)),
        url::Host::Ipv6(ip) => Some(std::net::IpAddr::V6(ip)),
        url::Host::Domain(_) => None,
    };
    ip.is_some_and(|ip| match ip {
        std::net::IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_broadcast()
                || ip.octets()[0] == 0
                || ip.octets()[0] >= 224
        }
        std::net::IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || ip
                    .to_ipv4_mapped()
                    .is_some_and(|v4| v4.is_private() || v4.is_loopback() || v4.is_link_local())
        }
    })
}

fn has_encoded_control(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.windows(3).any(|window| {
        window[0] == b'%'
            && matches!(window[1].to_ascii_lowercase(), b'0' | b'1' | b'7')
            && window[2].is_ascii_hexdigit()
            && (window[1] != b'7' || window[2].eq_ignore_ascii_case(&b'f'))
    })
}

fn valid_mailto_address(path: &str) -> bool {
    let Some((local, domain)) = path.split_once('@') else {
        return false;
    };
    !local.is_empty() && !domain.is_empty() && !domain.contains('@')
}

#[tauri::command]
pub fn open_external_link(
    app: AppHandle,
    caller: WebviewWindow,
    url: String,
) -> Result<(), String> {
    crate::require_main(&caller)?;
    let validated = validate_external_url(&url).map_err(str::to_string)?;
    app.opener()
        .open_url(validated, None::<&str>)
        .map_err(|_| "Não foi possível abrir o navegador padrão.".to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_external_url;

    #[test]
    fn accepts_only_http_https_and_mailto_links_without_credentials_or_controls() {
        for url in ["https://example.com/docs", "mailto:hello@example.com"] {
            assert!(validate_external_url(url).is_ok(), "{url}");
        }

        for url in [
            "javascript:alert(1)",
            "data:text/html,hello",
            "file:///C:/secret.txt",
            "https://trusted.example@evil.example/path",
            "https://example.com/\u{0007}path",
            "https://exa\nmple.com",
            "mailto:me@example.com?subject=a%0d%0aBcc%3Dx%40evil.com",
            "https:\\\\evil.example",
            "http://127.0.0.1:8080/path",
            "http://10.0.0.1/",
            "http://192.168.1.1/",
            "http://[::1]/",
            "http://[fc00::1]/",
            "http://[::ffff:127.0.0.1]/",
            "custom:payload",
        ] {
            assert!(validate_external_url(url).is_err(), "{url:?}");
        }
    }
}

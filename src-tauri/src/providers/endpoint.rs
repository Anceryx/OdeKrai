use super::*;

pub(super) fn provider_endpoint(provider_id: &str, base_url: &str) -> Result<Url, String> {
    if !supports_credentials(provider_id) {
        return Err("Este provedor ainda não possui um adaptador ativo.".into());
    }
    let mut url =
        Url::parse(base_url.trim()).map_err(|_| "Informe um endpoint válido.".to_string())?;
    if url.scheme() != "https"
        || url.port().is_some_and(|port| port != 443)
        || url.username() != ""
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "O endpoint precisa usar HTTPS e não pode conter credenciais ou parâmetros.".into(),
        );
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let config =
        catalog_entry(provider_id).ok_or("A configuração deste provedor não está cadastrada.")?;
    let allowed = config.host_rule.as_deref().is_some_and(|rule| {
        rule.split('|').any(|part| {
            if let Some(suffix) = part.strip_prefix("*.") {
                host.len() > suffix.len() + 1 && host.ends_with(&format!(".{suffix}"))
            } else if let Some((prefix, suffix)) = part.split_once("{region}") {
                host.strip_prefix(prefix)
                    .and_then(|rest| rest.strip_suffix(suffix))
                    .is_some_and(|region| {
                        !region.is_empty()
                            && region
                                .bytes()
                                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                    })
            } else {
                host == part
            }
        })
    });
    if !allowed {
        return Err(format!(
            "Este host não corresponde a {provider_id}. Use o host HTTPS documentado: {}.",
            config.host_rule.as_deref().unwrap_or("sem host cadastrado")
        ));
    }

    let path = url.path().trim_end_matches('/');
    let base_path = Url::parse(&config.base_url)
        .map(|value| value.path().trim_end_matches('/').to_string())
        .unwrap_or_default();
    if provider_id == "azure-openai" || provider_id == "bedrock" {
        if !path.ends_with("/openai/v1") {
            return Err("O endpoint precisa terminar em /openai/v1.".into());
        }
    } else if path != base_path && !(provider_id == "anthropic" && path == "/v1/messages") {
        return Err(format!("O caminho do endpoint não corresponde ao prefixo oficial de {provider_id}: {base_path}."));
    }
    let chat_path = config
        .chat_path
        .as_deref()
        .ok_or("Este provedor ainda não possui um adaptador de chat ativo.")?;
    let path = if chat_path.is_empty() || (provider_id == "anthropic" && path.ends_with(chat_path))
    {
        path.to_string()
    } else {
        format!("{path}{chat_path}")
    };
    url.set_path(&path);
    Ok(url)
}

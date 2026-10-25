use super::ProviderCapabilities;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CatalogEntry {
    pub(super) id: String,
    pub(super) base_url: String,
    pub(super) chat_path: Option<String>,
    pub(super) auth_header: Option<String>,
    pub(super) model_list_path: Option<String>,
    pub(super) model_list_shape: Option<String>,
    pub(super) host_rule: Option<String>,
    pub(super) capabilities: ProviderCapabilities,
}

pub(super) fn catalog_entry(provider_id: &str) -> Option<CatalogEntry> {
    serde_json::from_str::<Vec<CatalogEntry>>(include_str!("../../resources/provider-catalog.json"))
        .ok()?
        .into_iter()
        .find(|entry| entry.id == provider_id)
}

pub(super) fn capabilities_with_model_cache(
    mut capabilities: ProviderCapabilities,
    cached_tools_supported: Option<bool>,
) -> ProviderCapabilities {
    if cached_tools_supported == Some(false) {
        capabilities.tools = false;
    }
    capabilities
}

pub(super) fn effective_capabilities(
    app: &tauri::AppHandle,
    provider_id: &str,
    model: &str,
) -> Result<ProviderCapabilities, String> {
    let capabilities = catalog_entry(provider_id)
        .ok_or("O catálogo deste provedor não está disponível.")?
        .capabilities;
    if !capabilities.tools {
        return Ok(capabilities);
    }
    let cached =
        crate::history::cached_tool_support(app, provider_id, model).unwrap_or(Some(false));
    Ok(capabilities_with_model_cache(capabilities, cached))
}

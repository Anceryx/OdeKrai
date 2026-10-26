use keyring::Entry;

const KEYRING_SERVICE: &str = "site.anceryx.odekrai.provider";

pub(super) fn supports_credentials(provider_id: &str) -> bool {
    matches!(
        provider_id,
        "openai"
            | "anthropic"
            | "gemini"
            | "xai"
            | "mistral"
            | "cohere"
            | "groq"
            | "cerebras"
            | "deepseek"
            | "perplexity"
            | "together"
            | "openrouter"
            | "fireworks"
            | "local"
            | "azure-openai"
            | "bedrock"
    )
}

pub(super) fn credential_entry(provider_id: &str) -> Result<Entry, String> {
    if !supports_credentials(provider_id) {
        return Err("Este provedor ainda não aceita credenciais no OdeKrai.".into());
    }
    Entry::new(KEYRING_SERVICE, provider_id)
        .map_err(|_| "Não foi possível acessar o Gerenciador de Credenciais do Windows.".into())
}

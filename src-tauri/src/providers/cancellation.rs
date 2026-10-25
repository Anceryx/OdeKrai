use super::*;
use std::{future::Future, sync::atomic::Ordering};

pub fn cancel_all(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<ProviderRequests>() {
        cancel_requests(&state);
    }
}

pub(super) fn cancel_requests(state: &ProviderRequests) {
    if let Ok(requests) = state.0.lock() {
        for token in requests.values() {
            token.cancel();
        }
    }
}

pub(super) async fn cancellable_request<T, F>(
    requests: &ProviderRequests,
    security: &crate::security::SecurityState,
    future: F,
) -> Result<T, String>
where
    F: Future<Output = Result<T, String>>,
{
    if security.is_halted() {
        return Err("O OdeKrai está parado pelo kill switch.".into());
    }
    let token = CancellationToken::new();
    let id;
    {
        let mut pending = requests
            .0
            .lock()
            .map_err(|_| "Não foi possível iniciar a solicitação.".to_string())?;
        loop {
            let candidate = format!(
                "internal-{}",
                INTERNAL_REQUEST_ID.fetch_add(1, Ordering::Relaxed)
            );
            if !pending.contains_key(&candidate) {
                id = candidate;
                pending.insert(id.clone(), token.clone());
                break;
            }
        }
    }
    if security.is_halted() {
        token.cancel();
    }
    let result = tokio::select! {
        biased;
        _=token.cancelled()=>Err("Solicitação cancelada pelo kill switch.".into()),
        result=future=>result,
    };
    if let Ok(mut pending) = requests.0.lock() {
        pending.remove(&id);
    }
    result
}

use super::*;
use std::{collections::VecDeque, sync::MutexGuard};

pub(super) struct PendingAction {
    pub(super) id: String,
    pub(super) action: SimulatedAction,
    pub(super) origin: Origin,
    pub(super) risk: Risk,
    pub(super) rule: &'static str,
    pub(super) summary: String,
    pub(super) preview: String,
    pub(super) digest: String,
    pub(super) expires: Instant,
    pub(super) expires_at: u64,
    pub(super) created_at: Instant,
}

pub(super) fn lock_pending(
    state: &SecurityState,
) -> Result<MutexGuard<'_, VecDeque<PendingAction>>, String> {
    state.pending.lock().map_err(|_| {
        log::error!("Fila de aprovação indisponível: mutex envenenado; operação bloqueada.");
        "Fila de aprovação indisponível.".to_string()
    })
}

pub(super) fn display_hash_matches(action: &SimulatedAction, expected: &str, shown: &str) -> bool {
    if expected != shown {
        return false;
    }
    serde_json::to_string(action)
        .ok()
        .is_some_and(|value| digest(value.as_bytes()) == expected)
}

pub(super) fn queue_has_capacity(queue: &VecDeque<PendingAction>) -> bool {
    queue.len() < MAX_PENDING
}

pub(super) fn is_expired(expires: Instant, now: Instant) -> bool {
    now >= expires
}

pub(super) fn take_pending_approval(
    queue: &mut VecDeque<PendingAction>,
    id: &str,
    display_hash: &str,
) -> Result<PendingAction, &'static str> {
    let Some(item) = queue.front() else {
        return Err("approval_unavailable");
    };
    if item.id != id {
        return Err("approval_stale");
    }
    if !display_hash_matches(&item.action, &item.digest, display_hash) {
        return Err("approval_parameters_changed");
    }
    queue.pop_front().ok_or("approval_unavailable")
}

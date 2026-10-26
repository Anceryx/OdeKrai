use super::*;
use std::{
    collections::{HashMap, VecDeque},
    sync::MutexGuard,
    time::Duration,
};

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

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ApprovalDecision {
    Aprovada,
    Negada(String),
    Expirada,
    Cancelada,
    Parada,
}

struct BrokerEntry {
    hash: String,
    origin: String,
    expires: Instant,
    sender: tokio::sync::oneshot::Sender<ApprovalDecision>,
}

/// Broker limitado: quem cria o pedido recebe seu payload e aguarda a decisão;
/// quem aprova só pode resolver o canal uma vez, com o hash exibido.
pub struct ApprovalBroker {
    entries: tokio::sync::Mutex<HashMap<String, BrokerEntry>>,
    capacity: usize,
    timeout: Duration,
}

pub struct ApprovalTicket<A> {
    pub id: String,
    pub action: A,
    pub hash: String,
    pub origin: String,
    pub receiver: tokio::sync::oneshot::Receiver<ApprovalDecision>,
}

impl ApprovalBroker {
    pub fn new(capacity: usize, timeout: Duration) -> Self {
        Self {
            entries: tokio::sync::Mutex::new(HashMap::new()),
            capacity,
            timeout,
        }
    }

    pub async fn request<A: serde::Serialize>(
        &self,
        action: A,
        origin: String,
    ) -> Result<ApprovalTicket<A>, &'static str> {
        let encoded = serde_json::to_vec(&action).map_err(|_| "invalid_action")?;
        let hash = digest(&encoded);
        let mut entries = self.entries.lock().await;
        if entries.len() >= self.capacity {
            return Err("approval_queue_full");
        }
        let id = super::id();
        let (sender, receiver) = tokio::sync::oneshot::channel();
        entries.insert(
            id.clone(),
            BrokerEntry {
                hash: hash.clone(),
                origin: origin.clone(),
                expires: Instant::now() + self.timeout,
                sender,
            },
        );
        Ok(ApprovalTicket {
            id,
            action,
            hash,
            origin,
            receiver,
        })
    }

    pub async fn resolve(
        &self,
        id: &str,
        shown_hash: &str,
        decision: ApprovalDecision,
    ) -> Result<(), &'static str> {
        let mut entries = self.entries.lock().await;
        let entry = entries.get(id).ok_or("approval_unavailable")?;
        if entry.hash != shown_hash {
            return Err("approval_parameters_changed");
        }
        let entry = entries.remove(id).ok_or("approval_unavailable")?;
        if Instant::now() >= entry.expires {
            let _ = entry.sender.send(ApprovalDecision::Expirada);
            return Err("approval_expired");
        }
        let _ = entry.origin;
        entry
            .sender
            .send(decision)
            .map_err(|_| "approval_receiver_closed")
    }

    pub async fn cancel(&self, id: &str) -> bool {
        let entry = self.entries.lock().await.remove(id);
        entry.is_some_and(|entry| entry.sender.send(ApprovalDecision::Cancelada).is_ok())
    }

    pub async fn stop_all(&self) {
        let entries = std::mem::take(&mut *self.entries.lock().await);
        for (_, entry) in entries {
            let _ = entry.sender.send(ApprovalDecision::Parada);
        }
    }

    pub async fn deny_all(&self) {
        let entries = std::mem::take(&mut *self.entries.lock().await);
        for (_, entry) in entries {
            let _ = entry
                .sender
                .send(ApprovalDecision::Negada("app_closed".into()));
        }
    }
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

#[cfg(test)]
mod broker_tests {
    use super::*;

    #[tokio::test]
    async fn broker_resolves_once_and_checks_parameter_hash() {
        let broker = ApprovalBroker::new(2, Duration::from_secs(2));
        let ticket = broker
            .request(serde_json::json!({"path":"a"}), "debug".into())
            .await
            .unwrap();
        assert_eq!(
            broker
                .resolve(&ticket.id, "wrong", ApprovalDecision::Aprovada)
                .await,
            Err("approval_parameters_changed")
        );
        broker
            .resolve(&ticket.id, &ticket.hash, ApprovalDecision::Aprovada)
            .await
            .unwrap();
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(1), ticket.receiver)
                .await
                .unwrap()
                .unwrap(),
            ApprovalDecision::Aprovada
        );
        assert_eq!(
            broker
                .resolve(&ticket.id, &ticket.hash, ApprovalDecision::Aprovada)
                .await,
            Err("approval_unavailable")
        );
    }

    #[tokio::test]
    async fn broker_denies_expires_cancels_and_stops_pending_requests() {
        let broker = ApprovalBroker::new(4, Duration::from_millis(20));
        let denied = broker.request("deny", "debug".into()).await.unwrap();
        broker
            .resolve(
                &denied.id,
                &denied.hash,
                ApprovalDecision::Negada("user_denied".into()),
            )
            .await
            .unwrap();
        assert!(matches!(
            denied.receiver.await.unwrap(),
            ApprovalDecision::Negada(_)
        ));
        let expired = broker.request("expire", "debug".into()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(
            broker
                .resolve(&expired.id, &expired.hash, ApprovalDecision::Aprovada)
                .await,
            Err("approval_expired")
        );
        assert_eq!(expired.receiver.await.unwrap(), ApprovalDecision::Expirada);
        let cancelled = broker.request("cancel", "debug".into()).await.unwrap();
        assert!(broker.cancel(&cancelled.id).await);
        assert_eq!(
            cancelled.receiver.await.unwrap(),
            ApprovalDecision::Cancelada
        );
        let stopped = broker.request("stop", "debug".into()).await.unwrap();
        broker.stop_all().await;
        assert_eq!(stopped.receiver.await.unwrap(), ApprovalDecision::Parada);
    }

    #[tokio::test]
    async fn broker_bounds_flood_and_handles_concurrent_waiters_without_deadlock() {
        let broker = std::sync::Arc::new(ApprovalBroker::new(2, Duration::from_secs(2)));
        let first = broker.request(1, "debug".into()).await.unwrap();
        let second = broker.request(2, "debug".into()).await.unwrap();
        assert_eq!(
            broker.request(3, "debug".into()).await.err(),
            Some("approval_queue_full")
        );
        let b1 = broker.clone();
        let id1 = first.id.clone();
        let hash1 = first.hash.clone();
        let b2 = broker.clone();
        let id2 = second.id.clone();
        let hash2 = second.hash.clone();
        let f1 =
            tokio::spawn(async move { b1.resolve(&id1, &hash1, ApprovalDecision::Aprovada).await });
        let f2 =
            tokio::spawn(async move { b2.resolve(&id2, &hash2, ApprovalDecision::Aprovada).await });
        tokio::time::timeout(Duration::from_secs(1), async {
            f1.await.unwrap().unwrap();
            f2.await.unwrap().unwrap();
        })
        .await
        .unwrap();
        assert_eq!(first.receiver.await.unwrap(), ApprovalDecision::Aprovada);
        assert_eq!(second.receiver.await.unwrap(), ApprovalDecision::Aprovada);
    }
}

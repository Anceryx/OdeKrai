use std::future::Future;

pub(super) async fn try_candidates<T, R, F, Fut, A, O>(
    candidates: &[T],
    mut attempt: F,
    mut audit: A,
    mut output_started: O,
) -> Result<(usize, R), String>
where
    F: FnMut(&T) -> Fut,
    Fut: Future<Output = Result<R, String>>,
    A: FnMut(&T, &T, &str) -> Result<(), String>,
    O: FnMut() -> bool,
{
    let mut last_error = None;
    for (index, candidate) in candidates.iter().enumerate() {
        match attempt(candidate).await {
            Ok(value) => return Ok((index, value)),
            Err(error) => {
                let Some(reason) = transient_failure_reason(&error) else {
                    return Err(error);
                };
                if output_started() || index + 1 == candidates.len() {
                    return Err(error);
                }
                audit(candidate, &candidates[index + 1], reason)?;
                last_error = Some(error);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| "Nenhum provedor alternativo está disponível.".into()))
}

pub(super) fn filter_candidates<T: Clone, F>(
    candidates: impl IntoIterator<Item = T>,
    mut eligible: F,
) -> Result<Vec<T>, String>
where
    F: FnMut(&T) -> Result<bool, String>,
{
    let mut result = Vec::new();
    for candidate in candidates {
        if eligible(&candidate)? {
            result.push(candidate);
        }
    }
    Ok(result)
}

pub(super) fn transient_failure_reason(error: &str) -> Option<&'static str> {
    if error.contains("HTTP 429") {
        return Some("http_429");
    }
    for status in 500..=599 {
        if error.contains(&format!("HTTP {status}")) {
            return Some("http_5xx");
        }
    }
    if error.contains("HTTP 408") || error.contains("demorou para responder") {
        return Some("timeout");
    }
    if error.contains("Não foi possível conectar ao provedor")
        || error.contains("A comunicação segura com o provedor falhou")
    {
        return Some("network");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct Candidate(&'static str);

    #[tokio::test]
    async fn http_429_retries_model_call_and_records_the_switch() {
        let candidates = [Candidate("primary"), Candidate("backup")];
        let mut calls = Vec::new();
        let mut switches = Vec::new();
        let (index, result) = try_candidates(
            &candidates,
            |candidate| {
                calls.push(candidate.0);
                let result = if candidate.0 == "primary" {
                    Err("HTTP 429".to_string())
                } else {
                    Ok("answer")
                };
                std::future::ready(result)
            },
            |from, to, reason| {
                switches.push((from.0, to.0, reason.to_string()));
                Ok(())
            },
            || false,
        )
        .await
        .unwrap();
        assert_eq!(index, 1);
        assert_eq!(result, "answer");
        assert_eq!(calls, vec!["primary", "backup"]);
        assert_eq!(
            switches,
            vec![("primary", "backup", "http_429".to_string())]
        );
    }

    #[tokio::test]
    async fn unauthorized_error_does_not_retry() {
        let candidates = [Candidate("primary"), Candidate("backup")];
        let mut calls = Vec::new();
        let result = try_candidates(
            &candidates,
            |candidate| {
                calls.push(candidate.0);
                std::future::ready(Err::<(), _>("Credencial inválida (HTTP 401).".into()))
            },
            |_, _, _| Ok(()),
            || false,
        )
        .await;
        assert!(result.is_err());
        assert_eq!(calls, vec!["primary"]);
    }

    #[tokio::test]
    async fn streamed_output_prevents_retry_so_tools_cannot_be_reexecuted() {
        use std::cell::Cell;

        let candidates = [Candidate("primary"), Candidate("backup")];
        let mut calls = 0;
        let tool_runs = Cell::new(0);
        let output_started = Cell::new(false);
        let result = try_candidates(
            &candidates,
            |_| {
                calls += 1;
                output_started.set(true);
                tool_runs.set(tool_runs.get() + 1);
                std::future::ready(Err::<(), _>("HTTP 503".into()))
            },
            |_, _, _| Ok(()),
            || output_started.get(),
        )
        .await;
        assert!(result.is_err());
        assert_eq!(calls, 1);
        assert_eq!(tool_runs.get(), 1);
    }

    #[test]
    fn candidate_filter_skips_unavailable_credentials_without_changing_order() {
        let candidates = ["primary", "missing", "backup"];
        let eligible =
            filter_candidates(candidates, |candidate| Ok(*candidate != "missing")).unwrap();
        assert_eq!(eligible, vec!["primary", "backup"]);
    }

    #[test]
    fn retries_only_rate_limit_server_timeout_and_network_failures() {
        assert_eq!(
            transient_failure_reason("O limite de uso foi atingido (HTTP 429)."),
            Some("http_429")
        );
        assert_eq!(
            transient_failure_reason("Serviço indisponível (HTTP 503)."),
            Some("http_5xx")
        );
        assert_eq!(
            transient_failure_reason("O provedor demorou para responder."),
            Some("timeout")
        );
        assert_eq!(
            transient_failure_reason("Não foi possível conectar ao provedor."),
            Some("network")
        );
        for error in [
            "Credencial inválida (HTTP 401).",
            "Sem permissão (HTTP 403).",
            "Parâmetros inválidos (HTTP 400).",
            "Modelo não encontrado (HTTP 404).",
            "A resposta do provedor está em formato inválido.",
        ] {
            assert_eq!(transient_failure_reason(error), None, "{error}");
        }
    }
}

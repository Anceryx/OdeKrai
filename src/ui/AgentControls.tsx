import type { ReactNode } from 'react';
import { displayPath } from '../core/display-path';
import { RiskBadge } from './RiskBadge';

export type AgentActionCardData = {
  id: string;
  skillId: string;
  title: string;
  risk: string;
  decision: 'automática' | 'aprovada' | 'negada' | 'expirada' | 'aguardando';
  status: string;
  summary: string;
  resultSummary?: string;
  diff?: string;
};

export function AgentControls({
  enabled,
  disabledReason,
  workspacePath,
  running,
  awaitingApproval,
  onToggle,
  onStop,
  onConfigure,
}: {
  enabled: boolean;
  disabledReason: string | null;
  workspacePath: string | null;
  running: boolean;
  awaitingApproval: boolean;
  onToggle: (enabled: boolean) => void;
  onStop: () => void;
  onConfigure: () => void;
}) {
  const unavailable = Boolean(disabledReason);
  return (
    <div className="agent-controls" aria-label="Controles do modo agente">
      <button
        type="button"
        role="switch"
        aria-checked={enabled && !unavailable}
        aria-label="Modo agente"
        aria-describedby={disabledReason ? 'agent-unavailable-reason' : undefined}
        title={disabledReason ?? undefined}
        disabled={unavailable || running}
        onClick={() => onToggle(!enabled)}
      >
        <span className="agent-switch-indicator" aria-hidden="true" />
        <span>Modo agente</span>
        <strong>{unavailable ? 'Indisponível' : enabled ? 'Ligado' : 'Desligado'}</strong>
      </button>
      {disabledReason && (
        <span className="agent-unavailable" id="agent-unavailable-reason" role="status">
          {disabledReason}
        </span>
      )}
      {disabledReason && (
        <button className="agent-configure-button" type="button" onClick={onConfigure}>
          Configurar agente
        </button>
      )}
      {enabled && workspacePath && (
        <span className="agent-workspace" title={workspacePath}>
          Pasta de trabalho: {displayPath(workspacePath)}
        </span>
      )}
      {awaitingApproval && (
        <span className="agent-approval-status" role="status" aria-live="assertive">
          Aguardando aprovação na janela nativa de aprovação.
        </span>
      )}
      {running && (
        <button className="agent-stop-button" type="button" onClick={onStop}>
          Parar agente
        </button>
      )}
    </div>
  );
}

export function AgentActionCard({
  action,
  children,
}: {
  action: AgentActionCardData;
  children?: ReactNode;
}) {
  return (
    <article className="agent-action-card" aria-label={`Ação: ${action.title}`} aria-live="polite">
      <header>
        <strong>{action.title}</strong>
        <RiskBadge risk={action.risk} className="agent-risk-chip" />
      </header>
      <p>{action.summary}</p>
      {action.resultSummary && <p className="agent-action-result">{action.resultSummary}</p>}
      <dl>
        <div>
          <dt>Decisão</dt>
          <dd>{action.decision}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{action.status}</dd>
        </div>
      </dl>
      {action.diff && (
        <details>
          <summary>Ver diferenças</summary>
          <pre>{action.diff}</pre>
        </details>
      )}
      {children}
    </article>
  );
}

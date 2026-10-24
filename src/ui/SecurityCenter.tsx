import { useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

type Mode = 'sempre_perguntar' | 'aprovar_por_mim' | 'controle_total';
type Risk = 'leitura' | 'escrita_reversivel' | 'comunicacao_externa' | 'destrutivo_financeiro';
type ToolOverride = { tool: string; morePermissive: boolean };
type PermissionSettings = {
  mode: Mode;
  shortcut: string;
  shortcutError: string | null;
  halted: boolean;
  approvalTtlSeconds: number;
  overrides: ToolOverride[];
};
type AuditEntry = {
  timestamp: number;
  id: string;
  tool: string;
  risk: Risk;
  mode: Mode;
  origin: string;
  decision: string;
  ruleId: string;
  approval: string;
  latencyMs: number;
  paramsSummary: string;
  status: string;
  error: string | null;
  previousHash: string;
  hash: string;
};
type Pending = {
  id: string;
  tool: string;
  risk: Risk;
  origin: string;
  summary: string;
  preview: string;
  fullPreview: boolean;
  expiresAt: number;
  displayHash: string;
};

const modes: { id: Mode; title: string; description: string }[] = [
  {
    id: 'aprovar_por_mim',
    title: 'Aprovar por mim',
    description:
      'Leituras e gravações reversíveis no workspace seguem automaticamente. Comunicação externa e ações destrutivas pedem aprovação.',
  },
  {
    id: 'sempre_perguntar',
    title: 'Sempre perguntar',
    description:
      'Toda ação com efeito colateral pede aprovação. Leituras dentro do workspace são permitidas.',
  },
  {
    id: 'controle_total',
    title: 'Controle total',
    description:
      'Executa ações permitidas sem perguntar. Pagamentos, segredos e ações destrutivas fora do workspace continuam bloqueados ou exigem aprovação.',
  },
];
const risks: { id: Risk; title: string }[] = [
  { id: 'leitura', title: 'Leitura no workspace' },
  { id: 'escrita_reversivel', title: 'Escrita reversível' },
  { id: 'comunicacao_externa', title: 'Comunicação externa' },
  { id: 'destrutivo_financeiro', title: 'Destrutivo ou financeiro' },
];
const tools = [
  ['workspace.read_file', 'Ler arquivo do workspace'],
  ['workspace.write_file', 'Salvar arquivo no workspace'],
  ['workspace.delete_file', 'Mover arquivo para a lixeira do workspace'],
  ['simulated.send_message', 'Simular envio de mensagem'],
  ['simulated.payment', 'Pagamento (bloqueado)'],
] as const;

function decision(mode: Mode, risk: Risk): string {
  if (risk === 'leitura') return 'Permitir dentro do workspace';
  if (mode === 'sempre_perguntar') return 'Pedir aprovação';
  if (mode === 'aprovar_por_mim')
    return risk === 'escrita_reversivel' ? 'Permitir no workspace' : 'Pedir aprovação';
  if (risk === 'destrutivo_financeiro')
    return 'Na lixeira: permitir no workspace; fora: pedir aprovação';
  return 'Permitir (origem externa sempre pede aprovação)';
}

export function SecurityCenter({ page }: { page: 'permissions' | 'activity' }) {
  const [settings, setSettings] = useState<PermissionSettings | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [filter, setFilter] = useState('');

  async function refresh() {
    try {
      const current = await invoke<PermissionSettings>('get_permission_settings');
      setSettings(current);
      setShortcut(current.shortcut);
      if (page === 'activity') {
        const [audit, valid] = await Promise.all([
          invoke<AuditEntry[]>('list_audit'),
          invoke<boolean>('verify_audit'),
        ]);
        setEntries(audit);
        setVerified(valid);
      }
      setError('');
    } catch (cause) {
      setError(
        typeof cause === 'string'
          ? cause
          : 'Não foi possível ler as configurações de segurança. Configure a pasta do agente para usar o log de atividade.',
      );
    }
  }

  useEffect(() => {
    if (isTauri()) void refresh();
  }, [page]);

  async function changeMode(mode: Mode) {
    try {
      await invoke('set_permission_mode', { mode });
      await refresh();
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'O modo não foi alterado.');
    }
  }

  async function changeOverride(tool: string, morePermissive: boolean) {
    try {
      await invoke('set_tool_override', { tool, morePermissive });
      await refresh();
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'A exceção não foi alterada.');
    }
  }

  async function changeShortcut() {
    try {
      await invoke('set_kill_shortcut', { shortcut });
      await refresh();
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'O atalho não foi registrado.');
    }
  }

  async function changeApprovalTtl(seconds: number) {
    try {
      await invoke('set_approval_ttl', { seconds });
      await refresh();
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'O prazo de aprovação não foi alterado.');
    }
  }

  async function stopOrResume() {
    try {
      await invoke(settings?.halted ? 'resume_all' : 'halt_all');
      await refresh();
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'Não foi possível alterar o estado do agente.');
    }
  }

  async function runSample(action: object) {
    try {
      const result = await invoke<{ message: string }>('submit_simulated_action', {
        request: { action },
      });
      setError(result.message);
      if (page === 'activity') await refresh();
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'A simulação não foi concluída.');
    }
  }

  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) =>
        `${entry.tool} ${entry.status} ${entry.origin} ${entry.decision}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
    [entries, filter],
  );

  return (
    <div className="page subpage security-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEGURANÇA LOCAL</span>
          <h1>{page === 'permissions' ? 'Permissões' : 'Atividade'}</h1>
          <p>As regras são avaliadas e aplicadas pelo processo Rust.</p>
        </div>
        {settings && (
          <span className={`state-chip ${settings.halted ? 'warning' : 'connected'}`}>
            {settings.halted ? 'PARADO' : `MODO ${settings.mode.toUpperCase()}`}
          </span>
        )}
      </div>
      {error && (
        <div className="security-notice" role="status">
          {error}
        </div>
      )}
      {!isTauri() && (
        <div className="security-notice">
          Permissões e auditoria estão disponíveis no aplicativo nativo.
        </div>
      )}
      {page === 'permissions' && settings && (
        <>
          <section className="settings-panel">
            <div className="panel-heading">
              <div>
                <h3>Modo global</h3>
                <p>Escolha como o OdeKrai trata ações simuladas e futuras ferramentas.</p>
              </div>
            </div>
            <div className="permission-mode-grid">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  className={`permission-mode ${settings.mode === mode.id ? 'selected' : ''}`}
                  onClick={() => void changeMode(mode.id)}
                  aria-pressed={settings.mode === mode.id}
                >
                  <strong>{mode.title}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </div>
            <div className="permission-matrix">
              <table>
                <thead>
                  <tr>
                    <th>Modo</th>
                    {risks.map((risk) => (
                      <th key={risk.id}>{risk.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modes.map((mode) => (
                    <tr key={mode.id}>
                      <th>{mode.title}</th>
                      {risks.map((risk) => (
                        <td key={risk.id}>{decision(mode.id, risk.id)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="settings-panel">
            <div className="panel-heading">
              <div>
                <h3>Exceções por ferramenta</h3>
                <p>
                  Uma exceção permissiva pede confirmação nativa do Windows. Bloqueios fixos e
                  conteúdo externo não podem ser ignorados.
                </p>
              </div>
            </div>
            {tools.map(([tool, label]) => {
              const fixed = tool === 'workspace.read_file' || tool === 'simulated.payment';
              const enabled = settings.overrides.some(
                (item) => item.tool === tool && item.morePermissive,
              );
              return (
                <div className="preference-row" key={tool}>
                  <div>
                    <strong>{label}</strong>
                    <span>
                      {fixed
                        ? tool === 'workspace.read_file'
                          ? 'Leitura local já é permitida pela política.'
                          : 'Bloqueio fixo: nenhuma exceção é aceita.'
                        : tool}
                    </span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={enabled}
                    className={`toggle ${enabled ? 'on' : ''}`}
                    disabled={fixed}
                    onClick={() => void changeOverride(tool, !enabled)}
                  >
                    <span />
                  </button>
                </div>
              );
            })}
          </section>
          <section className="settings-panel">
            <div className="panel-heading">
              <div>
                <h3>Kill switch</h3>
                <p>
                  O atalho global para solicitações de parada é registrado no Rust. Conflitos
                  aparecem abaixo.
                </p>
              </div>
            </div>
            <div className="preference-row">
              <div>
                <strong>Atalho global</strong>
                <span>Exemplo: Ctrl+Shift+F12</span>
              </div>
              <div className="shortcut-editor">
                <input
                  value={shortcut}
                  onChange={(event) => setShortcut(event.target.value)}
                  aria-label="Atalho global do kill switch"
                  maxLength={80}
                />
                <button
                  className="secondary-button small-button"
                  onClick={() => void changeShortcut()}
                >
                  Aplicar
                </button>
              </div>
            </div>
            <div className="preference-row">
              <div>
                <strong>Tempo para aprovar</strong>
                <span>Depois do prazo, a ação é negada automaticamente.</span>
              </div>
              <select
                value={settings.approvalTtlSeconds}
                onChange={(event) => void changeApprovalTtl(Number(event.target.value))}
              >
                <option value={30}>30 segundos</option>
                <option value={60}>1 minuto</option>
                <option value={120}>2 minutos</option>
                <option value={300}>5 minutos</option>
                <option value={600}>10 minutos</option>
              </select>
            </div>
            {settings.shortcutError && <p className="security-error">{settings.shortcutError}</p>}
            <div className="preference-row">
              <div>
                <strong>
                  {settings.halted ? 'O OdeKrai está parado' : 'O OdeKrai está ativo'}
                </strong>
                <span>
                  {settings.halted
                    ? 'Novas ações são recusadas; streams foram cancelados.'
                    : 'Parar cancela solicitações em andamento e nega aprovações pendentes.'}
                </span>
              </div>
              <button
                className={settings.halted ? 'primary-button' : 'danger-button'}
                onClick={() => void stopOrResume()}
              >
                {settings.halted ? 'Retomar' : 'Parar tudo'}
              </button>
            </div>
          </section>
          {import.meta.env.DEV && (
            <section className="settings-panel">
              <div className="panel-heading">
                <div>
                  <h3>Exercitar ferramentas simuladas</h3>
                  <p>
                    Aparece somente em builds de desenvolvimento. O envio é simulado e pagamentos
                    são bloqueados.
                  </p>
                </div>
              </div>
              <div className="sample-actions">
                <button
                  className="secondary-button"
                  onClick={() =>
                    void runSample({ tool: 'workspace.read_file', path: 'fase3-teste.txt' })
                  }
                >
                  Ler arquivo de teste
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void runSample({
                      tool: 'workspace.write_file',
                      path: 'fase3-teste.txt',
                      content: 'Arquivo criado pela ferramenta simulada.',
                    })
                  }
                >
                  Gravar arquivo de teste
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void runSample({ tool: 'workspace.delete_file', path: 'fase3-teste.txt' })
                  }
                >
                  Mover para a lixeira
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void runSample({
                      tool: 'simulated.send_message',
                      recipient: 'destinatario@example.invalid',
                      message: 'Mensagem de teste; não enviar.',
                    })
                  }
                >
                  Simular mensagem
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void runSample({
                      tool: 'simulated.payment',
                      amount_cents: 100,
                      currency: 'USD',
                    })
                  }
                >
                  Testar bloqueio financeiro
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {page === 'activity' && (
        <section className="settings-panel">
          <div className="panel-heading">
            <div>
              <h3>Log de auditoria</h3>
              <p>
                Arquivo JSONL encadeado em {`%USERPROFILE%\\OdeKrai\\logs`}. O log detecta
                alterações, mas não impede um processo local com os mesmos privilégios.
              </p>
            </div>
            <span className={`state-chip ${verified ? 'connected' : 'warning'}`}>
              {verified === null ? 'VERIFICANDO' : verified ? 'CADEIA ÍNTEGRA' : 'FALHA NA CADEIA'}
            </span>
          </div>
          <div className="audit-toolbar">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrar ferramenta, origem ou status"
            />
            <button className="secondary-button small-button" onClick={() => void refresh()}>
              Atualizar
            </button>
            <button
              className="secondary-button small-button"
              disabled={!entries.length}
              onClick={() => {
                const blob = new Blob([entries.map((entry) => JSON.stringify(entry)).join('\n')], {
                  type: 'application/x-ndjson',
                });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'odekrai-atividade.jsonl';
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              Exportar JSONL
            </button>
          </div>
          <div className="audit-list">
            {visibleEntries.map((entry) => (
              <article
                className="audit-entry"
                key={`${entry.id}-${entry.timestamp}-${entry.status}`}
              >
                <div>
                  <strong>{entry.tool}</strong>
                  <span>
                    {new Date(entry.timestamp * 1000).toLocaleString()} · {entry.risk} ·{' '}
                    {entry.origin}
                  </span>
                </div>
                <span className="audit-status">
                  {entry.status} · {entry.decision} ({entry.ruleId})
                </span>
                <pre>{entry.paramsSummary}</pre>
                {entry.error && <p>{entry.error}</p>}
                <small>SHA-256: {entry.hash}</small>
              </article>
            ))}
            {!visibleEntries.length && (
              <p className="empty-state">Nenhum evento de auditoria para mostrar.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function ApprovalWindow() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [completePreview, setCompletePreview] = useState('');
  const [full, setFull] = useState(false);
  const [, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setPending(await invoke<Pending | null>('get_pending_approval'));
      setError('');
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'Não foi possível carregar a aprovação.');
    }
  }

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    void listen('approval-updated', () => void refresh()).then((off) => {
      unlisten = off;
    });
    const timer = window.setInterval(() => setClock((value) => value + 1), 250);
    return () => {
      unlisten?.();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!pending) {
      void getCurrentWindow()
        .close()
        .catch(() => undefined);
      return;
    }
    setCompletePreview('');
    setFull(false);
  }, [pending?.id]);

  async function respond(approve: boolean) {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await invoke('approval_respond', {
        id: pending.id,
        displayHash: pending.displayHash,
        approve,
      });
      await refresh();
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'A resposta não foi aplicada.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function showFullPreview() {
    if (!pending) return;
    try {
      const preview = await invoke<string>('get_full_approval_preview', {
        id: pending.id,
        displayHash: pending.displayHash,
      });
      setCompletePreview(preview);
      setFull(true);
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : 'Não foi possível carregar a prévia completa.');
    }
  }

  const remaining = pending ? Math.max(0, pending.expiresAt - Math.floor(Date.now() / 1000)) : 0;
  useEffect(() => {
    if (pending && remaining === 0) void respond(false);
  }, [remaining]);

  return (
    <main className="approval-window">
      <header>
        <span className="eyebrow">APROVAÇÃO DO ODEKRAI</span>
        <h1>Confirme esta ação</h1>
        <p>Leia destino, origem e prévia. O conteúdo abaixo é texto puro.</p>
      </header>
      {error && <div className="security-notice">{error}</div>}
      {pending ? (
        <>
          <section className="approval-facts">
            <div>
              <small>Ferramenta</small>
              <strong>{pending.tool}</strong>
            </div>
            <div>
              <small>Risco</small>
              <strong>{pending.risk}</strong>
            </div>
            <div>
              <small>Origem</small>
              <strong>{pending.origin}</strong>
            </div>
            <div>
              <small>Ação</small>
              <strong>{pending.summary}</strong>
            </div>
          </section>
          <section className="approval-preview">
            <header>
              <strong>Prévia</strong>
              <span>{remaining}s restantes · expira e é negada automaticamente</span>
            </header>
            <pre>{full ? completePreview : pending.preview}</pre>
            {pending.fullPreview && (
              <button
                className="text-button"
                onClick={() => (full ? setFull(false) : void showFullPreview())}
              >
                {full ? 'Mostrar trecho' : 'Ver completo'}
              </button>
            )}
          </section>
          <footer>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void respond(false)}
            >
              Negar
            </button>
            <button
              className="primary-button"
              disabled={busy || remaining === 0}
              onClick={() => void respond(true)}
            >
              Aprovar só desta vez
            </button>
          </footer>
        </>
      ) : (
        <p className="empty-state">Nenhuma aprovação pendente. Esta janela será encerrada.</p>
      )}
    </main>
  );
}

export function isApprovalWindow(): boolean {
  try {
    return isTauri() && getCurrentWindow().label === 'approval';
  } catch {
    return false;
  }
}

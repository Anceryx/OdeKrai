import { useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AI_PROVIDERS, providerCatalogEntry, type AiProvider } from '../core/providers';
import { openProviderLink } from '../core/provider-links';
import { providerLogoFor } from '../core/provider-logos';
import {
  filterProviderDirectory,
  removeProviderCredential,
  type ProviderDirectoryTab,
} from '../core/provider-directory';
import { PageHeader } from './DesignSystem';
import {
  activeProviderSettings,
  defaultProviderSettings,
  type AppSettings,
  type ProviderSettings,
} from '../core/settings';

type Props = {
  settings: AppSettings;
  keySaved: boolean;
  selectedId: string;
  onSelect: (provider: AiProvider) => void;
  onSetPrimary: (providerId: string) => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
  onSave: (provider: ProviderSettings) => void;
  onChat: () => void;
  onCredentialRemoved: (providerId: string) => void;
};
export function ProviderCatalog({
  settings,
  keySaved,
  selectedId,
  onSelect,
  onSetPrimary,
  onToggleEnabled,
  onSave,
  onChat,
  onCredentialRemoved,
}: Props) {
  const selected = AI_PROVIDERS.find((provider) => provider.id === selectedId) ?? AI_PROVIDERS[0];
  const catalogEntry = providerCatalogEntry(selected.id);
  const active = activeProviderSettings(settings);
  const isActive = settings.activeProviderId === selected.id;
  const [draft, setDraft] = useState<ProviderSettings>(
    settings.providers[selected.id] ?? defaultProviderSettings(selected.id),
  );
  const [secret, setSecret] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ProviderDirectoryTab>('all');
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [externalLinkError, setExternalLinkError] = useState('');
  const [busy, setBusy] = useState(false);
  const [credentialAvailable, setCredentialAvailable] = useState(keySaved);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; status: string; message: string }[]>([]);
  const [technicalError, setTechnicalError] = useState('');
  useEffect(() => {
    setDraft(settings.providers[selected.id] ?? defaultProviderSettings(selected.id));
    setSecret('');
    setNotice('');
    setExternalLinkError('');
    setTechnicalError('');
    setModels([]);
    setStages([]);
    setCredentialAvailable(false);
    if (isTauri() && selected.integration !== 'guide') {
      void invoke<boolean>('has_provider_credential', { providerId: selected.id })
        .then(setCredentialAvailable)
        .catch(() => setCredentialAvailable(false));
    }
  }, [selected.id, settings.providers[selected.id]]);
  useEffect(() => {
    let current = true;
    void Promise.all(
      AI_PROVIDERS.filter((provider) => provider.integration !== 'guide').map(async (provider) => {
        try {
          return (await invoke<boolean>('has_provider_credential', { providerId: provider.id }))
            ? provider.id
            : null;
        } catch {
          return null;
        }
      }),
    ).then((result) => {
      if (current) setConnectedIds(new Set(result.filter((id): id is string => id !== null)));
    });
    return () => {
      current = false;
    };
  }, []);
  const filtered = useMemo(
    () => filterProviderDirectory(AI_PROVIDERS, tab, search, connectedIds),
    [tab, search, connectedIds],
  );
  const readyToSave =
    selected.integration !== 'guide' &&
    Boolean((draft.baseUrl.trim() || selected.region) && (secret.trim() || credentialAvailable));
  const readyToTest =
    selected.integration !== 'guide' && Boolean(draft.model.trim() && credentialAvailable);
  function updateDraft(field: keyof ProviderSettings, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function endpointForDraft() {
    return selected.region
      ? `https://bedrock-runtime.${(draft.region ?? '').trim()}.amazonaws.com/openai/v1`
      : draft.baseUrl.trim();
  }
  async function configure(test: boolean) {
    if (!isTauri()) {
      setNotice('Use o aplicativo Windows para salvar credenciais com segurança.');
      return;
    }
    const baseUrl = endpointForDraft();
    const next = {
      ...draft,
      providerId: selected.id,
      name: selected.name,
      baseUrl,
      authMode: selected.authMode,
    };
    setBusy(true);
    setNotice('');
    try {
      await invoke('validate_provider_endpoint', { providerId: selected.id, baseUrl });
      if (secret.trim())
        await invoke('save_provider_credential', {
          providerId: selected.id,
          credential: secret.trim(),
        });
      setCredentialAvailable(true);
      setConnectedIds((ids) => new Set(ids).add(selected.id));
      onSave(next);
      setSecret('');
      if (test) {
        const result = await invoke<{ stages: typeof stages; overall: string }>(
          'test_provider_connection',
          {
            providerId: selected.id,
            baseUrl,
            model: next.model,
          },
        );
        setStages(result.stages);
        const status =
          result.overall === 'passed'
            ? 'passed'
            : result.overall === 'partial'
              ? 'partial'
              : 'failed';
        const saved = {
          ...next,
          lastTest: {
            status: status as 'passed' | 'failed' | 'partial',
            at: new Date().toISOString(),
            message: result.overall,
          },
        };
        setDraft(saved);
        onSave(saved);
        setNotice(
          status === 'passed'
            ? 'Conexão validada sem enviar texto ao modelo.'
            : 'Verificação parcial; consulte as etapas abaixo.',
        );
      } else setNotice('Credencial salva no Gerenciador do Windows. Ainda não validada.');
    } catch (error) {
      const message =
        typeof error === 'string' ? error : 'Não foi possível configurar este provedor.';
      if (test) setTechnicalError(message);
      if (test) {
        const failed = {
          ...next,
          lastTest: { status: 'failed' as const, at: new Date().toISOString(), message },
        };
        setDraft(failed);
        onSave(failed);
      }
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }
  async function loadModels() {
    setBusy(true);
    setNotice('');
    try {
      await invoke('validate_provider_endpoint', {
        providerId: selected.id,
        baseUrl: endpointForDraft(),
      });
      const result = await invoke<{ id: string; name: string }[]>('list_provider_models', {
        providerId: selected.id,
        baseUrl: endpointForDraft(),
      });
      setModels(result);
      setNotice(`${result.length} modelos carregados.`);
    } catch (error) {
      setNotice(typeof error === 'string' ? error : 'Não foi possível carregar os modelos.');
    } finally {
      setBusy(false);
    }
  }
  async function ping() {
    setBusy(true);
    setNotice('');
    setTechnicalError('');
    try {
      await invoke('validate_provider_endpoint', {
        providerId: selected.id,
        baseUrl: endpointForDraft(),
      });
      await invoke('ping_provider', {
        providerId: selected.id,
        baseUrl: endpointForDraft(),
        model: draft.model,
      });
      const saved = {
        ...draft,
        baseUrl: endpointForDraft(),
        lastTest: {
          status: 'passed' as const,
          at: new Date().toISOString(),
          message: 'O teste rápido foi aceito.',
        },
      };
      setDraft(saved);
      onSave(saved);
      setNotice('O teste rápido foi aceito pelo provedor. Esta solicitação pode gerar cobrança.');
    } catch (error) {
      const message =
        typeof error === 'string' ? error : 'Não foi possível concluir o teste rápido.';
      const failed = {
        ...draft,
        baseUrl: endpointForDraft(),
        lastTest: { status: 'failed' as const, at: new Date().toISOString(), message },
      };
      setDraft(failed);
      onSave(failed);
      setNotice(message);
      setTechnicalError(message);
    } finally {
      setBusy(false);
    }
  }
  async function removeCredential(providerId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const next = await removeProviderCredential(
        providerId,
        (id) => invoke('remove_provider_credential', { providerId: id }),
        connectedIds,
      );
      onCredentialRemoved(providerId);
      if (providerId === selected.id) setCredentialAvailable(false);
      setConnectedIds(next);
      setNotice('Credencial removida do Gerenciador do Windows.');
    } catch {
      setNotice('Não foi possível remover a credencial.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page provider-page">
      <PageHeader
        eyebrow="CONECTORES"
        title="Conecte IAs ao OdeKrai"
        subtitle={`${AI_PROVIDERS.filter((provider) => provider.integration !== 'guide').length} provedores têm integração disponível.`}
        actions={
          <span className="provider-count" aria-label={`${AI_PROVIDERS.length} provedores`}>
            <strong>{AI_PROVIDERS.length}</strong>
            <span>provedores</span>
          </span>
        }
      />
      <div className="provider-summary" role="status">
        <span className={`connection-orb ${keySaved ? 'ready' : ''}`} />
        <div>
          <strong>
            {keySaved ? `${active.name} tem credencial salva` : 'Nenhum provedor configurado'}
          </strong>
          <span>
            {keySaved
              ? 'Credencial salva não significa conexão validada.'
              : 'Escolha um provedor para configurar o acesso.'}
          </span>
        </div>
        {keySaved && isActive && (
          <button className="text-button" onClick={onChat}>
            Abrir conversas ↗
          </button>
        )}
      </div>
      <div className="provider-layout">
        <section className="provider-browser" aria-label="Catálogo de provedores de IA">
          <div className="provider-browser-heading">
            <div>
              <h2>Provedores de IA</h2>
              <p>Escolha um provedor para ver as etapas de configuração.</p>
            </div>
            <label className="provider-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar provedor"
                aria-label="Buscar provedor"
              />
            </label>
          </div>
          <div className="provider-tabs" role="tablist" aria-label="Filtrar provedores">
            {(
              [
                ['connected', 'Conectados'],
                ['free', 'Gratuitos'],
                ['all', 'Todos'],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'active' : ''}
                key={id}
                onClick={() => {
                  setTab(id);
                  setDetailsOpen(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="provider-grid">
            {filtered.map((provider) => {
              const connected = connectedIds.has(provider.id);
              const tested = settings.providers[provider.id]?.lastTest?.status === 'passed';
              const enabled = settings.providers[provider.id]?.enabled !== false;
              const primary = settings.activeProviderId === provider.id;
              return (
                <article className="provider-card" key={provider.id}>
                  <button
                    type="button"
                    aria-pressed={selected.id === provider.id}
                    title={`${provider.name}: ${provider.integration}`}
                    className={`provider-tile ${selected.id === provider.id ? 'selected' : ''}`}
                    onClick={() => {
                      onSelect(provider);
                      setDetailsOpen(true);
                    }}
                  >
                    <ProviderLogo provider={provider} />
                    <span className="provider-tile-copy">
                      <strong>{provider.name}</strong>
                      <small>
                        {connected
                          ? 'Credencial salva'
                          : provider.freePlan
                            ? 'Plano gratuito disponível'
                            : provider.integration === 'guide'
                              ? 'Guia de integração'
                              : provider.integration === 'anthropic-messages'
                                ? 'Anthropic Messages'
                                : provider.integration === 'perplexity-agent'
                                  ? 'Perplexity Agent API'
                                  : 'Chat Completions'}
                      </small>
                    </span>
                    {provider.freePlan && (
                      <span className="provider-free-badge">Plano gratuito</span>
                    )}
                    {primary && <span className="provider-active-dot" title="Principal" />}
                  </button>
                  {connected && (
                    <div className="provider-card-controls">
                      <div
                        className="provider-status-list"
                        aria-label={`Status de ${provider.name}`}
                      >
                        <span>Salva</span>
                        {tested && <span>Testada</span>}
                        {primary && <span>Ativa</span>}
                      </div>
                      <label className="provider-enable">
                        <input
                          type="checkbox"
                          checked={enabled}
                          aria-label={`Ativar ${provider.name}`}
                          onChange={(event) => onToggleEnabled(provider.id, event.target.checked)}
                        />
                        Ativar
                      </label>
                      {!primary && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onSetPrimary(provider.id)}
                        >
                          Definir como principal
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button danger-text"
                        disabled={busy}
                        onClick={() => void removeCredential(provider.id)}
                      >
                        Remover credencial
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="provider-empty" role="status">
              {tab === 'connected' && !search.trim()
                ? 'Nenhum provedor tem credencial salva neste dispositivo.'
                : 'Nenhum provedor corresponde à busca.'}
            </p>
          )}
          <p className="provider-compat-note">
            A consulta sem enviar mensagem carrega os modelos da conta quando o provedor oferece
            esse recurso. O teste de conexão é opcional e pode gerar cobrança.
          </p>
        </section>
        {detailsOpen && (
          <button
            className="provider-detail-backdrop"
            aria-label="Fechar detalhes do provedor"
            onClick={() => setDetailsOpen(false)}
          />
        )}
        {detailsOpen && (
          <aside className="provider-detail" aria-label={`Detalhes de ${selected.name}`}>
            <button
              className="provider-detail-close"
              type="button"
              aria-label="Fechar detalhes"
              onClick={() => setDetailsOpen(false)}
            >
              ×
            </button>
            <div className="provider-detail-top">
              <ProviderLogo provider={selected} large />
              <div>
                <span
                  className={`provider-status ${selected.integration === 'guide' ? 'guide' : ''}`}
                >
                  {selected.integration === 'guide' ? 'GUIA DISPONÍVEL' : 'INTEGRAÇÃO DISPONÍVEL'}
                </span>
                <h2>{selected.name}</h2>
              </div>
            </div>
            <p className="provider-description">{selected.description}</p>
            {externalLinkError && (
              <p className="provider-key-note" role="alert">
                Não foi possível abrir o navegador. Copie este endereço e abra-o manualmente:{' '}
                <code>{externalLinkError}</code>
              </p>
            )}
            {selected.freePlan && (
              <div className="provider-free-note">
                <strong>Plano gratuito disponível</strong>
                {selected.freePlan.note && <span>{selected.freePlan.note}</span>}
                <ProviderExternalLink
                  href={selected.freePlan.limitsUrl}
                  onError={setExternalLinkError}
                >
                  Consultar limites oficiais ↗
                </ProviderExternalLink>
                <p>
                  Alguns provedores podem usar dados do plano gratuito. Leia os termos antes de
                  enviar mensagens.
                </p>
              </div>
            )}
            {catalogEntry && (
              <p className="provider-key-note">
                {catalogEntry.verification === 'verified'
                  ? `Documentação conferida em ${catalogEntry.verifiedAt}.`
                  : 'Detalhes de integração ainda não verificados na documentação oficial.'}
              </p>
            )}
            <div className="provider-requirements">
              <h3>O que você precisa</h3>
              <ul>
                {selected.requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            {selected.integration !== 'guide' ? (
              <div className="provider-form">
                <ol className="provider-steps">
                  <li>
                    <strong>1. Crie sua conta</strong>
                    <ProviderExternalLink href={selected.docsUrl} onError={setExternalLinkError}>
                      Criar conta ↗
                    </ProviderExternalLink>
                  </li>
                  <li>
                    <strong>2. Gere uma chave de API</strong>
                    <ProviderExternalLink href={selected.consoleUrl} onError={setExternalLinkError}>
                      Gerar chave ↗
                    </ProviderExternalLink>
                  </li>
                  <li>
                    <strong>3. Salve a chave no OdeKrai</strong>
                    <span>Ela fica no Gerenciador de Credenciais do Windows.</span>
                  </li>
                  <li>
                    <strong>4. Carregue e selecione um modelo</strong>
                  </li>
                  <li>
                    <strong>5. Teste a conexão</strong>
                  </li>
                </ol>
                {selected.region && (
                  <label className="field-label">
                    Região AWS
                    <input
                      value={draft.region ?? ''}
                      onChange={(event) => updateDraft('region', event.target.value)}
                      placeholder="us-east-1"
                      spellCheck={false}
                    />
                  </label>
                )}
                <details className="provider-advanced">
                  <summary>Avançado</summary>
                  <label className="field-label">
                    {selected.region
                      ? 'Endereço'
                      : selected.id === 'azure-openai'
                        ? 'Endereço do recurso'
                        : 'Endereço da API'}
                    <input
                      value={
                        selected.region
                          ? `https://bedrock-runtime.${draft.region || '{região}'}.amazonaws.com/openai/v1`
                          : draft.baseUrl
                      }
                      onChange={(event) => updateDraft('baseUrl', event.target.value)}
                      placeholder="https://api.exemplo.com/v1"
                      spellCheck={false}
                      readOnly={Boolean(selected.region)}
                    />
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const restored = { ...defaultProviderSettings(selected.id), model: '' };
                      setDraft(restored);
                      onSave(restored);
                      setNotice('Endereço e modelo restaurados ao padrão do provedor.');
                    }}
                  >
                    Restaurar padrão do provedor
                  </button>
                </details>
                {catalogEntry?.modelListPath && (
                  <button
                    className="text-button"
                    type="button"
                    disabled={!credentialAvailable || busy}
                    onClick={() => void loadModels()}
                  >
                    Carregar modelos da conta
                  </button>
                )}
                {models.length > 0 ? (
                  <label className="field-label">
                    Modelo
                    <select
                      value={models.some((item) => item.id === draft.model) ? draft.model : ''}
                      onChange={(event) =>
                        event.target.value && updateDraft('model', event.target.value)
                      }
                    >
                      <option value="">Selecione o modelo carregado</option>
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : !catalogEntry?.modelListPath ? (
                  <label className="field-label">
                    {selected.id === 'azure-openai'
                      ? 'Nome do deployment'
                      : selected.id === 'bedrock'
                        ? 'Model ID'
                        : 'Modelo'}
                    <input
                      value={draft.model}
                      onChange={(event) => updateDraft('model', event.target.value)}
                      placeholder={selected.modelHint}
                      spellCheck={false}
                    />
                  </label>
                ) : null}
                <label className="field-label">
                  {selected.id === 'bedrock'
                    ? 'Chave de API Bedrock'
                    : selected.id === 'azure-openai'
                      ? 'Chave do recurso'
                      : 'Chave de API'}
                  <span className="secret-input provider-key-input">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={secret}
                      autoComplete="off"
                      onChange={(event) => setSecret(event.target.value)}
                      placeholder={
                        credentialAvailable
                          ? 'Deixe vazio para usar a credencial salva'
                          : 'Cole sua chave de API'
                      }
                    />
                    <button type="button" onClick={() => setShowKey((value) => !value)}>
                      {showKey ? 'Ocultar' : 'Exibir'}
                    </button>
                  </span>
                </label>
                <p className="provider-key-note">
                  A credencial fica no Gerenciador de Credenciais do Windows. O endereço é restrito
                  a domínios HTTPS oficiais do provedor.
                </p>
                <button
                  className="primary-button provider-connect"
                  disabled={!readyToSave || busy}
                  onClick={() => void configure(false)}
                >
                  {busy ? 'Aguarde…' : 'Salvar configuração'}
                </button>
                <button
                  className="secondary-button provider-chat-button"
                  disabled={!readyToTest || busy}
                  onClick={() => void configure(true)}
                >
                  Testar conexão sem gerar resposta
                </button>
                {selected.id !== 'perplexity' && (
                  <button
                    className="text-button"
                    disabled={!credentialAvailable || !draft.model.trim() || busy}
                    onClick={() => void ping()}
                    title="Envia um teste curto ao provedor. Pode gerar cobrança."
                  >
                    Teste rápido (pode gerar cobrança)
                  </button>
                )}
                {credentialAvailable && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void removeCredential(selected.id)}
                  >
                    Remover credencial
                  </button>
                )}
                {notice && (
                  <p className="provider-key-note" role="status">
                    {notice}
                  </p>
                )}
                {stages.length > 0 && (
                  <ol className="connection-stages">
                    {stages.map((stage) => (
                      <li key={stage.id} data-status={stage.status}>
                        <strong>
                          {stage.status === 'passed' ? '✓' : stage.status === 'failed' ? '×' : '–'}{' '}
                          {{
                            credential: 'Credencial',
                            host: 'Host permitido',
                            network: 'Rede e TLS',
                            authentication: 'Autenticação',
                            model: 'Modelo',
                          }[stage.id] ?? stage.id}
                        </strong>
                        <span>{stage.message}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {draft.lastTest && (
                  <p className="provider-key-note">
                    Último teste:{' '}
                    {draft.lastTest.status === 'passed'
                      ? 'aprovado'
                      : draft.lastTest.status === 'partial'
                        ? 'parcial'
                        : 'falhou'}{' '}
                    · {new Date(draft.lastTest.at).toLocaleString('pt-BR')}
                  </p>
                )}
                {technicalError && (
                  <details className="provider-key-note">
                    <summary>Detalhes técnicos</summary>
                    <code>{technicalError.slice(0, 500)}</code>
                  </details>
                )}
              </div>
            ) : (
              <div className="provider-unavailable">
                <span className="guide-mark">i</span>
                <div>
                  <strong>Este conector ainda não está ativo no chat.</strong>
                  <p>O fluxo OAuth/ADC ainda precisa de integração nativa e validação.</p>
                </div>
              </div>
            )}
            <div className="provider-detail-links">
              <ProviderExternalLink href={selected.docsUrl} onError={setExternalLinkError}>
                Documentação oficial ↗
              </ProviderExternalLink>
              <ProviderExternalLink href={selected.consoleUrl} onError={setExternalLinkError}>
                {selected.integration === 'guide'
                  ? 'Abrir console do provedor'
                  : 'Obter chave ou credenciais'}{' '}
                ↗
              </ProviderExternalLink>
            </div>
          </aside>
        )}
      </div>
      <div className="provider-privacy">
        <span>◈</span>
        <p>
          <strong>Controle seus custos e credenciais.</strong> Mensagens são enviadas pelo processo
          nativo ao provedor configurado. Confira preços, permissões e retenção antes de enviar.
        </p>
      </div>
    </div>
  );
}
function ProviderLogo({ provider, large = false }: { provider: AiProvider; large?: boolean }) {
  const icon = providerLogoFor(provider.id);
  return (
    <span
      className={`provider-logo ${large ? 'large' : ''}`}
      style={{ '--provider-color': provider.color } as React.CSSProperties}
    >
      <img src={icon} alt="" aria-hidden="true" />
    </span>
  );
}

function ProviderExternalLink({
  href,
  onError,
  children,
}: {
  href: string;
  onError: (url: string) => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        setExternalLinkErrorSafely(href, onError);
      }}
    >
      {children}
    </a>
  );
}

function setExternalLinkErrorSafely(href: string, onError: (url: string) => void) {
  void openProviderLink(href, openUrl).catch(() => onError(href));
}

import { useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  AI_PROVIDERS,
  providerCatalogEntry,
  type AiProvider,
  type ProviderCapabilities,
} from '../core/providers';
import { openProviderLink } from '../core/provider-links';
import { providerLogoFor } from '../core/provider-logos';
import {
  filterProviderDirectory,
  providerCardHasManagement,
  loadProviderDirectoryTab,
  loadConnectedProviderIds,
  removeProviderCredential,
  confirmProviderCredentialRemoval,
  saveProviderDirectoryTab,
  type ProviderDirectoryTab,
} from '../core/provider-directory';
import { PageHeader } from './DesignSystem';
import { Icon } from './Icon';
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
  const [tab, setTab] = useState<ProviderDirectoryTab>(() =>
    loadProviderDirectoryTab(typeof localStorage === 'undefined' ? undefined : localStorage),
  );
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const primaryConnected =
    Boolean(settings.activeProviderId) &&
    connectedIds.has(settings.activeProviderId) &&
    settings.providers[settings.activeProviderId]?.enabled !== false;
  const [credentialChecksComplete, setCredentialChecksComplete] = useState(false);
  const [credentialCheckFailed, setCredentialCheckFailed] = useState(false);
  const [localServerAvailable, setLocalServerAvailable] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [externalLinkError, setExternalLinkError] = useState('');
  const [busy, setBusy] = useState(false);
  const [credentialAvailable, setCredentialAvailable] = useState(keySaved);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [localModelEndpoints, setLocalModelEndpoints] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<{ id: string; status: string; message: string }[]>([]);
  const [technicalError, setTechnicalError] = useState('');
  const [replacementPrimary, setReplacementPrimary] = useState('');
  const [primaryToReplace, setPrimaryToReplace] = useState('');
  const [effectiveCapabilities, setEffectiveCapabilities] = useState<ProviderCapabilities | null>(
    null,
  );
  useEffect(() => {
    setDraft(settings.providers[selected.id] ?? defaultProviderSettings(selected.id));
    setSecret('');
    setNotice('');
    setExternalLinkError('');
    setTechnicalError('');
    setModels([]);
    setStages([]);
  }, [selected.id, settings.providers[selected.id]]);
  useEffect(() => {
    let current = true;
    setCredentialChecksComplete(false);
    setCredentialCheckFailed(false);
    if (isTauri()) {
      const providerIds = AI_PROVIDERS.filter((provider) => provider.integration !== 'guide').map(
        (provider) => provider.id,
      );
      void Promise.all([
        loadConnectedProviderIds(providerIds, (providerId) =>
          invoke<boolean>('has_provider_credential', { providerId }),
        ),
        invoke<{ model: { id: string } }[]>('discover_local_models').catch(() => []),
      ]).then(([result, localModels]) => {
        if (!current) return;
        const connected = new Set(result.connectedIds);
        if (localModels.length > 0) connected.add('local');
        setConnectedIds(connected);
        setLocalServerAvailable(localModels.length > 0);
        setCredentialChecksComplete(true);
        setCredentialCheckFailed(result.failedIds.size > 0);
      });
    } else setCredentialChecksComplete(true);
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    setCredentialAvailable(connectedIds.has(selected.id));
  }, [selected.id, connectedIds]);
  useEffect(() => {
    let current = true;
    const baseCapabilities = catalogEntry?.capabilities ?? null;
    setEffectiveCapabilities(baseCapabilities);
    if (isTauri() && draft.model.trim()) {
      void invoke<ProviderCapabilities>('get_provider_capabilities', {
        providerId: selected.id,
        model: draft.model.trim(),
      })
        .then((result) => {
          if (current) setEffectiveCapabilities(result);
        })
        .catch(() => {
          if (current) setEffectiveCapabilities(baseCapabilities);
        });
    }
    return () => {
      current = false;
    };
  }, [selected.id, draft.model, catalogEntry]);
  const filtered = useMemo(
    () => filterProviderDirectory(AI_PROVIDERS, tab, search, connectedIds),
    [tab, search, connectedIds],
  );
  const readyToSave =
    selected.integration !== 'guide' &&
    Boolean(
      (draft.baseUrl.trim() || selected.region) &&
      (selected.id === 'local' || secret.trim() || credentialAvailable),
    );
  const readyToTest =
    selected.integration !== 'guide' &&
    Boolean(draft.model.trim() && (selected.id === 'local' || credentialAvailable));
  function updateDraft(field: keyof ProviderSettings, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function changeTab(next: ProviderDirectoryTab) {
    setTab(next);
    saveProviderDirectoryTab(next, typeof localStorage === 'undefined' ? undefined : localStorage);
    setDetailsOpen(false);
  }
  function providerApiType(provider: AiProvider) {
    return {
      'openai-chat': 'Chat Completions',
      'anthropic-messages': 'Anthropic Messages',
      'perplexity-agent': 'Perplexity Agent API',
      'local-chat': 'API local compatível com OpenAI',
      guide: 'Guia de integração',
    }[provider.integration];
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
      if (secret.trim() || credentialAvailable) {
        setCredentialAvailable(true);
        setConnectedIds((ids) => new Set(ids).add(selected.id));
      }
      setCredentialChecksComplete(true);
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
      if (selected.id === 'local') {
        const discovered =
          await invoke<{ baseUrl: string; model: { id: string; name: string } }[]>(
            'discover_local_models',
          );
        setModels(discovered.map((item) => item.model));
        setLocalModelEndpoints(
          Object.fromEntries(discovered.map((item) => [item.model.id, item.baseUrl])),
        );
        if (discovered[0]) updateDraft('baseUrl', discovered[0].baseUrl);
        setNotice(`${discovered.length} modelos locais encontrados.`);
        return;
      }
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
    const provider = AI_PROVIDERS.find((item) => item.id === providerId);
    await confirmProviderCredentialRemoval(
      provider?.name ?? providerId,
      (message) => window.confirm(message),
      async () => {
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
      },
    );
  }
  async function testSavedConnection(provider: AiProvider) {
    const config = settings.providers[provider.id] ?? defaultProviderSettings(provider.id);
    onSelect(provider);
    setDetailsOpen(true);
    if (!config.model.trim()) {
      setNotice('Escolha um modelo antes de testar a conexão.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const result = await invoke<{ stages: typeof stages; overall: string }>(
        'test_provider_connection',
        { providerId: provider.id, baseUrl: config.baseUrl, model: config.model },
      );
      setStages(result.stages);
      setNotice(
        result.overall === 'passed'
          ? 'Conexão validada.'
          : 'Verificação parcial; consulte as etapas.',
      );
    } catch (error) {
      setTechnicalError(typeof error === 'string' ? error : 'Falha ao testar a conexão.');
      setNotice('Não foi possível testar a conexão. Consulte os detalhes técnicos.');
    } finally {
      setBusy(false);
    }
  }
  async function discoverLocalForCard(provider: AiProvider) {
    onSelect(provider);
    setDetailsOpen(true);
    setBusy(true);
    setNotice('Procurando servidores locais…');
    try {
      const discovered =
        await invoke<{ baseUrl: string; model: { id: string; name: string } }[]>(
          'discover_local_models',
        );
      setModels(discovered.map((item) => item.model));
      setLocalModelEndpoints(
        Object.fromEntries(discovered.map((item) => [item.model.id, item.baseUrl])),
      );
      if (discovered.length) setConnectedIds((ids) => new Set([...ids, 'local']));
      setLocalServerAvailable(discovered.length > 0);
      setNotice(
        discovered.length
          ? `${discovered.length} modelos locais encontrados.`
          : 'Servidor encontrado, sem modelos disponíveis.',
      );
    } catch (error) {
      setNotice(typeof error === 'string' ? error : 'Nenhum servidor local foi encontrado.');
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
            {primaryConnected
              ? `${active.name} · Principal · Ativo`
              : 'Nenhum provedor principal conectado'}
          </strong>
          <span>
            {keySaved
              ? 'Credencial disponível nesta sessão; o teste de conexão é opcional.'
              : active.name === 'IA local' && localServerAvailable
                ? 'Servidor local disponível neste dispositivo.'
                : 'Escolha um provedor conectado ou configure um novo acesso.'}
          </span>
        </div>
        {primaryConnected && isActive && (
          <button className="text-button" onClick={onChat}>
            Abrir conversas <Icon name="external-link" />
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
              <Icon name="search" />
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
                onClick={() => changeTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'connected' && credentialCheckFailed && filtered.length > 0 && (
            <p className="provider-empty" role="status">
              Algumas credenciais não puderam ser consultadas; a lista pode estar incompleta.
            </p>
          )}
          <div className="provider-grid">
            {filtered.map((provider) => {
              const connected = connectedIds.has(provider.id);
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
                      <small>{providerApiType(provider)}</small>
                    </span>
                    <span className="provider-badges">
                      {[
                        connected && 'Conectado',
                        primary && 'Principal',
                        connected && enabled && 'Ativo',
                        provider.freePlan && 'Plano gratuito',
                        provider.id === 'local' && 'Local',
                        provider.id === 'local' && localServerAvailable && 'Servidor disponível',
                      ]
                        .filter(Boolean)
                        .map((badge) => (
                          <span key={badge as string}>{badge}</span>
                        ))}
                    </span>
                  </button>
                  {provider.id === 'local' && (
                    <button
                      type="button"
                      className="provider-local-action"
                      disabled={busy}
                      onClick={() => void discoverLocalForCard(provider)}
                    >
                      Procurar IA local
                    </button>
                  )}
                  {providerCardHasManagement(tab, connected) && (
                    <div className="provider-card-controls">
                      <label className="provider-enable">
                        <input
                          type="checkbox"
                          checked={enabled}
                          aria-label={`Ativar ${provider.name}`}
                          onChange={(event) => {
                            if (!event.target.checked && primary) {
                              setPrimaryToReplace(provider.id);
                              setReplacementPrimary('');
                            } else onToggleEnabled(provider.id, event.target.checked);
                          }}
                        />
                        {enabled ? 'Ativo' : 'Desativado'}
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
                      <details className="provider-actions-menu">
                        <summary aria-label={`Ações de ${provider.name}`}>⋯</summary>
                        <div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void testSavedConnection(provider)}
                          >
                            Testar conexão
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setExternalLinkErrorSafely(provider.docsUrl, setExternalLinkError)
                            }
                          >
                            Abrir documentação
                          </button>
                          <button
                            type="button"
                            className="danger-text"
                            disabled={busy}
                            onClick={() => void removeCredential(provider.id)}
                          >
                            Remover credencial
                          </button>
                        </div>
                      </details>
                    </div>
                  )}
                  {primaryToReplace === provider.id && (
                    <div
                      className="provider-primary-dialog"
                      role="group"
                      aria-label="Escolher novo provedor principal"
                    >
                      <label>
                        Escolha o novo principal
                        <select
                          value={replacementPrimary}
                          onChange={(event) => setReplacementPrimary(event.target.value)}
                        >
                          <option value="">Selecione um provedor conectado</option>
                          {[...connectedIds]
                            .filter(
                              (id) =>
                                id !== provider.id && settings.providers[id]?.enabled !== false,
                            )
                            .map((id) => (
                              <option key={id} value={id}>
                                {AI_PROVIDERS.find((item) => item.id === id)?.name ?? id}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary-button small-button"
                        disabled={!replacementPrimary}
                        onClick={() => {
                          onSetPrimary(replacementPrimary);
                          onToggleEnabled(provider.id, false);
                          setPrimaryToReplace('');
                        }}
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setPrimaryToReplace('')}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="provider-empty" role="status">
              {tab === 'connected' && !search.trim() && !credentialChecksComplete
                ? 'Consultando credenciais salvas…'
                : tab === 'connected' && !search.trim() && credentialCheckFailed
                  ? 'Não foi possível consultar as credenciais. A lista pode estar incompleta.'
                  : tab === 'connected' && !search.trim()
                    ? 'Nenhum provedor conectado.'
                    : 'Nenhum provedor corresponde à busca.'}
            </p>
          )}
          <p className="provider-compat-note">
            A consulta sem enviar mensagem carrega os modelos da conta quando o provedor oferece
            esse recurso. O teste de conexão é opcional e pode gerar cobrança.
          </p>
          {tab === 'connected' &&
            filtered.length === 0 &&
            credentialChecksComplete &&
            !credentialCheckFailed &&
            !search.trim() && (
              <div className="provider-empty-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => changeTab('free')}
                >
                  Ver gratuitos
                </button>
                <button type="button" className="secondary-button" onClick={() => changeTab('all')}>
                  Ver todos
                </button>
              </div>
            )}
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
              <Icon name="close" />
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
            {selected.id === 'local' && (
              <p className="provider-key-note" role="status">
                <strong>Servidor local:</strong>{' '}
                {localServerAvailable ? 'disponível' : 'não encontrado nas portas padrão'}.
              </p>
            )}
            {connectedIds.has(selected.id) && selected.integration !== 'guide' && (
              <div className="provider-detail-controls">
                <label className="provider-enable">
                  <input
                    type="checkbox"
                    checked={settings.providers[selected.id]?.enabled !== false}
                    aria-label={`Ativar ${selected.name}`}
                    onChange={(event) => {
                      if (!event.target.checked && isActive) {
                        setPrimaryToReplace(selected.id);
                        setReplacementPrimary('');
                      } else onToggleEnabled(selected.id, event.target.checked);
                    }}
                  />
                  {settings.providers[selected.id]?.enabled === false ? 'Desativado' : 'Ativo'}
                </label>
                {isActive ? (
                  <span className="provider-badge">Principal</span>
                ) : (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onSetPrimary(selected.id)}
                  >
                    Definir como principal
                  </button>
                )}
              </div>
            )}
            {primaryToReplace === selected.id && detailsOpen && tab !== 'connected' && (
              <div
                className="provider-primary-dialog"
                role="group"
                aria-label="Escolher novo provedor principal"
              >
                <label>
                  Escolha o novo principal
                  <select
                    value={replacementPrimary}
                    onChange={(event) => setReplacementPrimary(event.target.value)}
                  >
                    <option value="">Selecione um provedor conectado</option>
                    {[...connectedIds]
                      .filter(
                        (id) => id !== selected.id && settings.providers[id]?.enabled !== false,
                      )
                      .map((id) => (
                        <option key={id} value={id}>
                          {AI_PROVIDERS.find((item) => item.id === id)?.name ?? id}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary-button small-button"
                  disabled={!replacementPrimary}
                  onClick={() => {
                    onSetPrimary(replacementPrimary);
                    onToggleEnabled(selected.id, false);
                    setPrimaryToReplace('');
                  }}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setPrimaryToReplace('')}
                >
                  Cancelar
                </button>
              </div>
            )}
            {effectiveCapabilities && selected.integration !== 'guide' && (
              <p className="provider-capability-note">
                Ferramentas:{' '}
                <span
                  className={
                    'ui-badge ' +
                    (effectiveCapabilities.tools
                      ? 'ui-badge--success'
                      : effectiveCapabilities.verified
                        ? 'ui-badge--danger'
                        : 'ui-badge--warning')
                  }
                >
                  {effectiveCapabilities.tools
                    ? 'Verificado'
                    : effectiveCapabilities.verified
                      ? 'Sem suporte para este modelo'
                      : 'Não verificado'}
                </span>
              </p>
            )}
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
                  Consultar limites oficiais <Icon name="external-link" />
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
                {selected.id === 'local' && (
                  <p className="provider-key-note">
                    <strong>Local</strong> · A conversa não sai do seu computador.
                  </p>
                )}
                <ol className="provider-steps">
                  {selected.id === 'local' ? (
                    <>
                      <li>
                        Instale o{' '}
                        <ProviderExternalLink
                          href="https://ollama.com/download"
                          onError={setExternalLinkError}
                        >
                          Ollama
                        </ProviderExternalLink>{' '}
                        ou consulte o{' '}
                        <ProviderExternalLink
                          href="https://github.com/ggml-org/llama.cpp/tree/master/tools/server"
                          onError={setExternalLinkError}
                        >
                          llama.cpp server
                        </ProviderExternalLink>
                        .
                      </li>
                      <li>Baixe e carregue um modelo no servidor.</li>
                      <li>Inicie o servidor e procure modelos disponíveis.</li>
                    </>
                  ) : (
                    <>
                      <li>
                        <strong>1. Crie sua conta</strong>
                        <ProviderExternalLink
                          href={selected.signupUrl}
                          onError={setExternalLinkError}
                        >
                          Criar conta <Icon name="external-link" />
                        </ProviderExternalLink>
                      </li>
                      <li>
                        <strong>2. Gere uma chave de API</strong>
                        <ProviderExternalLink
                          href={selected.consoleUrl}
                          onError={setExternalLinkError}
                        >
                          Gerar chave <Icon name="external-link" />
                        </ProviderExternalLink>
                      </li>
                      <li>
                        <strong>3. Salve a chave no OdeKrai</strong>
                        <span>Ela fica no Gerenciador de Credenciais do Windows.</span>
                      </li>
                      <li>
                        <strong>4. Carregue e selecione um modelo</strong>
                      </li>
                    </>
                  )}
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
                {selected.id === 'local' && (
                  <label className="field-label">
                    Servidor local
                    <select
                      value={
                        draft.baseUrl === 'http://127.0.0.1:11434/v1' ||
                        draft.baseUrl === 'http://127.0.0.1:8080/v1'
                          ? draft.baseUrl
                          : 'custom'
                      }
                      onChange={(event) => {
                        if (event.target.value !== 'custom')
                          updateDraft('baseUrl', event.target.value);
                      }}
                    >
                      <option value="http://127.0.0.1:11434/v1">Ollama · 127.0.0.1:11434</option>
                      <option value="http://127.0.0.1:8080/v1">
                        llama.cpp server · 127.0.0.1:8080
                      </option>
                      <option value="custom">Endereço personalizado</option>
                    </select>
                  </label>
                )}
                {selected.id === 'local' && (
                  <label className="field-label">
                    Endereço local (HTTP)
                    <input
                      value={draft.baseUrl}
                      onChange={(event) => updateDraft('baseUrl', event.target.value)}
                      placeholder="http://127.0.0.1:11434/v1"
                      spellCheck={false}
                    />
                  </label>
                )}
                <details className="provider-advanced">
                  <summary>Avançado</summary>
                  {selected.id !== 'local' && (
                    <label className="field-label">
                      {selected.region
                        ? 'Endereço'
                        : selected.id === 'azure-openai'
                          ? 'Endereço do recurso'
                          : selected.id === 'local'
                            ? 'Endereço local (HTTP)'
                            : 'Endereço da API'}
                      <input
                        value={
                          selected.region
                            ? `https://bedrock-runtime.${draft.region || '{região}'}.amazonaws.com/openai/v1`
                            : draft.baseUrl
                        }
                        onChange={(event) => updateDraft('baseUrl', event.target.value)}
                        placeholder={
                          selected.id === 'local'
                            ? 'http://127.0.0.1:11434/v1'
                            : 'https://api.exemplo.com/v1'
                        }
                        spellCheck={false}
                        readOnly={Boolean(selected.region)}
                      />
                    </label>
                  )}
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
                    disabled={(selected.id !== 'local' && !credentialAvailable) || busy}
                    onClick={() => void loadModels()}
                  >
                    {selected.id === 'local' ? 'Procurar IA local' : 'Carregar modelos da conta'}
                  </button>
                )}
                {selected.id === 'local' && (
                  <label className="field-label">
                    Modelo local
                    <select
                      value={models.some((item) => item.id === draft.model) ? draft.model : ''}
                      onChange={(event) => {
                        const selectedModel = models.find((item) => item.id === event.target.value);
                        if (selectedModel) {
                          updateDraft('model', selectedModel.id);
                          updateDraft(
                            'baseUrl',
                            localModelEndpoints[selectedModel.id] ?? draft.baseUrl,
                          );
                        }
                      }}
                    >
                      <option value="">Selecione um modelo encontrado</option>
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {selected.id !== 'local' && models.length > 0 ? (
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
                {selected.id !== 'local' && (
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
                )}
                <p className="provider-key-note">
                  {selected.id === 'local'
                    ? 'Chave opcional, salva no Gerenciador de Credenciais do Windows. O endereço HTTP é permitido apenas para loopback.'
                    : 'A credencial fica no Gerenciador de Credenciais do Windows. O endereço é restrito a domínios HTTPS oficiais do provedor.'}
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
                {selected.id !== 'perplexity' && selected.id !== 'local' && (
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
                          <Icon
                            name={
                              stage.status === 'passed'
                                ? 'success'
                                : stage.status === 'failed'
                                  ? 'error'
                                  : 'pending'
                            }
                          />{' '}
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
                <span className="guide-mark">
                  <Icon name="help" />
                </span>
                <div>
                  <strong>Este conector ainda não está ativo no chat.</strong>
                  <p>O fluxo OAuth/ADC ainda precisa de integração nativa e validação.</p>
                </div>
              </div>
            )}
            <div className="provider-detail-links">
              <ProviderExternalLink href={selected.docsUrl} onError={setExternalLinkError}>
                Documentação oficial <Icon name="external-link" />
              </ProviderExternalLink>
              <ProviderExternalLink href={selected.consoleUrl} onError={setExternalLinkError}>
                {selected.integration === 'guide'
                  ? 'Abrir console do provedor'
                  : 'Obter chave ou credenciais'}{' '}
                <Icon name="external-link" />
              </ProviderExternalLink>
            </div>
          </aside>
        )}
      </div>
      <div className="provider-privacy">
        <Icon name="shield" />
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
      {icon ? (
        <img src={icon} alt="" aria-hidden="true" />
      ) : (
        <Icon name={provider.id === 'local' ? 'harddrives' : 'desktop'} size={large ? 23 : 18} />
      )}
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

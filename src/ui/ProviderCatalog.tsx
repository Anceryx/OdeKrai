import { useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  siAnthropic,
  siDeepseek,
  siGooglecloud,
  siGooglegemini,
  siMistralai,
  siOpenrouter,
  siPerplexity,
  type SimpleIcon,
} from 'simple-icons';
import { AI_PROVIDERS, type AiProvider } from '../core/providers';
import type { ProviderSettings } from '../core/settings';

const logoMap: Record<string, SimpleIcon> = {
  anthropic: siAnthropic,
  deepseek: siDeepseek,
  'google-cloud': siGooglecloud,
  gemini: siGooglegemini,
  mistral: siMistralai,
  openrouter: siOpenrouter,
  perplexity: siPerplexity,
};
type Props = {
  settings: ProviderSettings;
  keySaved: boolean;
  selectedId: string;
  onSelect: (provider: AiProvider) => void;
  onSave: (provider: ProviderSettings) => void;
  onChat: () => void;
  onCredentialRemoved: () => void;
};
export function ProviderCatalog({
  settings,
  keySaved,
  selectedId,
  onSelect,
  onSave,
  onChat,
  onCredentialRemoved,
}: Props) {
  const selected = AI_PROVIDERS.find((provider) => provider.id === selectedId) ?? AI_PROVIDERS[0];
  const isActive = settings.providerId === selected.id;
  const [draft, setDraft] = useState<ProviderSettings>(settings);
  const [secret, setSecret] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [credentialAvailable, setCredentialAvailable] = useState(keySaved);
  useEffect(() => {
    setDraft(
      isActive
        ? settings
        : {
            providerId: selected.id,
            name: selected.name,
            baseUrl: selected.baseUrl ?? '',
            model: '',
            authMode: selected.authMode,
            region: selected.region ? 'us-east-1' : undefined,
          },
    );
    setSecret('');
    setNotice('');
    setCredentialAvailable(false);
    if (isTauri() && selected.integration !== 'guide') {
      void invoke<boolean>('has_provider_credential', { providerId: selected.id })
        .then(setCredentialAvailable)
        .catch(() => setCredentialAvailable(false));
    }
  }, [selected.id]);
  const filtered = useMemo(
    () =>
      AI_PROVIDERS.filter((provider) =>
        provider.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [search],
  );
  const ready =
    selected.integration !== 'guide' &&
    Boolean(
      draft.model.trim() &&
      (draft.baseUrl.trim() || selected.region) &&
      (secret.trim() || credentialAvailable),
    );
  function updateDraft(field: keyof ProviderSettings, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  async function configure(test: boolean) {
    if (!isTauri()) {
      setNotice('Use o aplicativo Windows para salvar credenciais com segurança.');
      return;
    }
    const baseUrl = selected.region
      ? `https://bedrock-runtime.${(draft.region ?? '').trim()}.amazonaws.com/openai/v1`
      : draft.baseUrl.trim();
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
      if (secret.trim())
        await invoke('save_provider_credential', {
          providerId: selected.id,
          credential: secret.trim(),
        });
      setCredentialAvailable(true);
      onSave(next);
      setSecret('');
      if (test) {
        const result = await invoke<{ content: string }>('send_provider_message', {
          providerId: selected.id,
          baseUrl,
          model: next.model,
          messages: [{ role: 'user', content: 'Responda apenas: conexão validada.' }],
          requestId: `test-${crypto.randomUUID()}`,
        });
        setNotice(`Conexão validada: ${result.content.slice(0, 100)}`);
      } else setNotice('Credencial salva no Gerenciador do Windows. Ainda não validada.');
    } catch (error) {
      setNotice(typeof error === 'string' ? error : 'Não foi possível configurar este provedor.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page provider-page">
      <div className="page-heading provider-page-heading">
        <div>
          <span className="eyebrow">CONECTORES</span>
          <h1>Conecte IAs ao OdeKrai</h1>
          <p>
            14 conectores possuem adaptador. Vertex AI permanece como guia até a integração de
            autenticação ADC.
          </p>
        </div>
        <span className="provider-count">
          <strong>15</strong>
          <span>provedores</span>
        </span>
      </div>
      <div className="provider-summary" role="status">
        <span className={`connection-orb ${keySaved ? 'ready' : ''}`} />
        <div>
          <strong>
            {keySaved ? `${settings.name} tem credencial salva` : 'Nenhum provedor configurado'}
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
              <h2>Todos os provedores</h2>
              <p>Selecione um card para abrir os detalhes.</p>
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
          <div className="provider-grid">
            {filtered.map((provider) => (
              <button
                type="button"
                key={provider.id}
                aria-pressed={selected.id === provider.id}
                title={`${provider.name}: ${provider.integration}`}
                className={`provider-tile ${selected.id === provider.id ? 'selected' : ''}`}
                onClick={() => onSelect(provider)}
              >
                <ProviderLogo provider={provider} />
                <span className="provider-tile-copy">
                  <strong>{provider.name}</strong>
                  <small>
                    {provider.integration === 'guide'
                      ? 'Guia de integração'
                      : provider.integration === 'anthropic-messages'
                        ? 'Anthropic Messages'
                        : provider.integration === 'perplexity-agent'
                          ? 'Perplexity Agent API'
                          : 'Chat Completions'}
                  </small>
                </span>
                {settings.providerId === provider.id && (
                  <span className="provider-active-dot" title="Selecionado no aplicativo" />
                )}
              </button>
            ))}
          </div>
          <p className="provider-compat-note">
            Teste de conexão envia uma solicitação real ao serviço e pode gerar cobrança. Os modelos
            são informados conforme sua conta.
          </p>
        </section>
        <aside className="provider-detail" aria-label={`Detalhes de ${selected.name}`}>
          <div className="provider-detail-top">
            <ProviderLogo provider={selected} large />
            <div>
              <span
                className={`provider-status ${selected.integration === 'guide' ? 'guide' : ''}`}
              >
                {selected.integration === 'guide' ? 'GUIA DISPONÍVEL' : 'ADAPTADOR IMPLEMENTADO'}
              </span>
              <h2>{selected.name}</h2>
            </div>
          </div>
          <p className="provider-description">{selected.description}</p>
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
              <label className="field-label">
                {selected.region
                  ? 'Endpoint'
                  : selected.id === 'azure-openai'
                    ? 'Endpoint do recurso'
                    : 'Endpoint da API'}
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
                A credencial fica no Gerenciador de Credenciais do Windows. O endpoint é restrito a
                domínios HTTPS oficiais do provedor.
              </p>
              <button
                className="primary-button provider-connect"
                disabled={!ready || busy}
                onClick={() => void configure(false)}
              >
                {busy ? 'Aguarde…' : 'Salvar configuração'}
              </button>
              <button
                className="secondary-button provider-chat-button"
                disabled={!ready || busy}
                onClick={() => void configure(true)}
              >
                Testar conexão
              </button>
              {credentialAvailable && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void invoke('remove_provider_credential', { providerId: selected.id })
                      .then(() => {
                        onCredentialRemoved();
                        setCredentialAvailable(false);
                        setNotice('Credencial removida do Gerenciador do Windows.');
                      })
                      .catch(() => setNotice('Não foi possível remover a credencial.'))
                  }
                >
                  Remover credencial salva
                </button>
              )}
              {notice && (
                <p className="provider-key-note" role="status">
                  {notice}
                </p>
              )}
              {isActive && credentialAvailable && (
                <button className="secondary-button provider-chat-button" onClick={onChat}>
                  Abrir conversas ↗
                </button>
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
            <a href={selected.docsUrl} target="_blank" rel="noreferrer">
              Documentação oficial ↗
            </a>
            <a href={selected.consoleUrl} target="_blank" rel="noreferrer">
              {selected.integration === 'guide'
                ? 'Abrir console do provedor'
                : 'Obter chave ou credenciais'}{' '}
              ↗
            </a>
          </div>
        </aside>
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
  const icon = provider.logo ? logoMap[provider.logo] : undefined;
  const fallback =
    provider.name === 'OpenAI'
      ? 'O'
      : provider.name === 'xAI'
        ? 'x'
        : provider.name === 'AWS Bedrock'
          ? 'aws'
          : provider.name === 'Azure OpenAI'
            ? 'az'
            : provider.name
                .split(/\s+/)
                .map((part) => part[0])
                .join('')
                .slice(0, 3);
  return (
    <span
      className={`provider-logo ${large ? 'large' : ''}`}
      style={{ '--provider-color': provider.color } as React.CSSProperties}
    >
      {icon ? (
        <svg viewBox="0 0 24 24" role="img" aria-label={`${provider.name} logo`}>
          <path d={icon.path} fill="currentColor" />
        </svg>
      ) : (
        <span aria-hidden="true">{fallback}</span>
      )}
    </span>
  );
}

import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { defaultSettings, type AppSettings } from '../../core/settings';
import { AI_PROVIDERS } from '../../core/providers';
import { moveFallbackProvider, setFallbackProviderIds } from '../../core/provider-directory';
import { PageHeader, Toggle } from '../DesignSystem';
import { HistoryDeletionSettings } from '../HistoryDeletionSettings';
import { normalizeTrustedLinkDomain } from '../../core/markdown';

type BuildInfo = {
  version: string;
  commit: string;
  build_date: string;
  webview_version: string;
};

type ProviderUsage = {
  providerId: string;
  todayInput: number;
  todayOutput: number;
  sevenDayInput: number;
  sevenDayOutput: number;
};

type AgentLimits = {
  maxTurns: number;
  maxDurationSeconds: number;
  maxTokens: number;
  maxExternalActions: number;
};

export function SettingsScreen({
  settings,
  update,
  onDeleteAllHistory,
  onOpenPermissions,
}: {
  settings: AppSettings;
  update: (next: AppSettings) => void;
  onDeleteAllHistory: () => Promise<boolean>;
  onOpenPermissions: () => void;
}) {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [usage, setUsage] = useState<ProviderUsage[]>([]);
  const [fallbackToAdd, setFallbackToAdd] = useState('');
  const [linkDomainDraft, setLinkDomainDraft] = useState('');
  const [trustedDomainError, setTrustedDomainError] = useState('');
  const [agentLimits, setAgentLimits] = useState<AgentLimits>({
    maxTurns: 8,
    maxDurationSeconds: 120,
    maxTokens: 16_000,
    maxExternalActions: 2,
  });
  const [agentLimitsError, setAgentLimitsError] = useState('');
  const totalTokensToday = usage.reduce(
    (total, item) => total + item.todayInput + item.todayOutput,
    0,
  );
  const usageStatus =
    settings.dailyTokenLimit === 0
      ? 'Limite desativado'
      : totalTokensToday > settings.dailyTokenLimit
        ? 'Limite ultrapassado'
        : 'Dentro do limite';

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<BuildInfo>('get_build_info')
      .then(setBuildInfo)
      .catch(() => setBuildInfo(null));
    void invoke<ProviderUsage[]>('get_provider_usage')
      .then(setUsage)
      .catch(() => setUsage([]));
    void invoke<AgentLimits>('get_agent_limits')
      .then(setAgentLimits)
      .catch(() => setAgentLimitsError('Não foi possível carregar os limites do agente.'));
    void (async () => {
      for (const value of settings.trustedLinkDomains) {
        const domain = normalizeTrustedLinkDomain(value);
        if (domain) {
          await invoke('trust_external_domain', { domain }).catch(() => undefined);
        }
      }
      const domains = await invoke<string[]>('get_trusted_external_domains');
      update({ ...settings, trustedLinkDomains: domains });
    })().catch(() => setTrustedDomainError('Não foi possível carregar os domínios confiáveis.'));
  }, []);

  function updateAgentLimit<K extends keyof AgentLimits>(key: K, value: AgentLimits[K]) {
    const bounds: Record<keyof AgentLimits, [number, number]> = {
      maxTurns: [1, 32],
      maxDurationSeconds: [10, 600],
      maxTokens: [128, 200_000],
      maxExternalActions: [0, 20],
    };
    if (!Number.isSafeInteger(value) || value < bounds[key][0] || value > bounds[key][1]) return;
    const next = { ...agentLimits, [key]: value };
    setAgentLimits(next);
    if (!isTauri()) return;
    void invoke('set_agent_limits', { limits: next }).then(
      () => setAgentLimitsError(''),
      () => setAgentLimitsError('Não foi possível salvar os limites do agente.'),
    );
  }

  return (
    <div className="page subpage">
      <PageHeader
        eyebrow="PREFERÊNCIAS"
        title="Configurações"
        subtitle="Ajuste como o OdeKrai se comporta neste dispositivo."
      />
      <section className="settings-panel settings-section">
        <h2>Geral</h2>
        <div className="panel-heading">
          <div>
            <h3>Idioma da interface</h3>
            <p>O idioma disponível nesta versão é Português (Brasil).</p>
          </div>
        </div>
        <div className="preference-row">
          <div>
            <strong>Idioma</strong>
          </div>
          <select value="pt-BR" disabled aria-label="Idioma da interface">
            <option value="pt-BR">Português (Brasil)</option>
          </select>
        </div>
      </section>
      <section className="settings-panel settings-section">
        <h2>Janela</h2>
        <div className="preference-row">
          <div>
            <strong>Ao fechar a janela</strong>
            <span>Escolha se o botão X minimiza para a bandeja ou encerra o aplicativo.</span>
          </div>
          <select
            aria-label="Ação ao fechar a janela"
            value={settings.closeBehavior}
            onChange={(event) =>
              update({
                ...settings,
                closeBehavior: event.target.value as AppSettings['closeBehavior'],
              })
            }
          >
            <option value="minimize_to_tray">Minimizar para a bandeja</option>
            <option value="exit">Encerrar</option>
          </select>
        </div>
      </section>
      <section className="settings-panel settings-section">
        <h2>Aparência</h2>
        <div className="preference-row">
          <div>
            <strong>Reduzir animações</strong>
            <span>Respeita a preferência de movimento reduzido.</span>
          </div>
          <Toggle
            checked={settings.reduceMotion}
            label="Reduzir animações"
            onClick={() => update({ ...settings, reduceMotion: !settings.reduceMotion })}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Usar meu mascote como avatar do OdeKrai</strong>
            <span>Substitui o ícone do aplicativo nas respostas.</span>
          </div>
          <Toggle
            checked={settings.useMascotAsAssistantAvatar}
            label="Usar meu mascote como avatar do OdeKrai"
            onClick={() =>
              update({
                ...settings,
                useMascotAsAssistantAvatar: !settings.useMascotAsAssistantAvatar,
              })
            }
          />
        </div>
      </section>
      <section className="settings-panel settings-section" aria-labelledby="agent-settings-heading">
        <h2 id="agent-settings-heading">Agente</h2>
        <p className="settings-description">
          Os limites são aplicados pelo Rust em cada execução e ficam salvos neste dispositivo.
        </p>
        {agentLimitsError && <p role="alert">{agentLimitsError}</p>}
        <div className="preference-row">
          <label htmlFor="agent-max-turns">
            <strong>Voltas máximas</strong>
          </label>
          <input
            id="agent-max-turns"
            type="number"
            min="1"
            max="32"
            value={agentLimits.maxTurns}
            onChange={(event) => updateAgentLimit('maxTurns', Number(event.target.value))}
          />
        </div>
        <div className="preference-row">
          <label htmlFor="agent-max-duration">
            <strong>Tempo máximo (segundos)</strong>
          </label>
          <input
            id="agent-max-duration"
            type="number"
            min="10"
            max="600"
            step="10"
            value={agentLimits.maxDurationSeconds}
            onChange={(event) => updateAgentLimit('maxDurationSeconds', Number(event.target.value))}
          />
        </div>
        <div className="preference-row">
          <label htmlFor="agent-max-tokens">
            <strong>Tokens máximos por execução</strong>
          </label>
          <input
            id="agent-max-tokens"
            type="number"
            min="128"
            max="200000"
            step="128"
            value={agentLimits.maxTokens}
            onChange={(event) => updateAgentLimit('maxTokens', Number(event.target.value))}
          />
        </div>
        <div className="preference-row">
          <label htmlFor="agent-max-external">
            <strong>Ações de comunicação externa</strong>
          </label>
          <input
            id="agent-max-external"
            type="number"
            min="0"
            max="20"
            value={agentLimits.maxExternalActions}
            onChange={(event) => updateAgentLimit('maxExternalActions', Number(event.target.value))}
          />
        </div>
        <div className="agent-mode-help">
          <h3>Modos de permissão</h3>
          <ul>
            <li>
              <strong>Sempre perguntar:</strong> solicita aprovação antes de ações que alteram algo.
            </li>
            <li>
              <strong>Aprovar por mim:</strong> permite alterações reversíveis na pasta de trabalho;
              pergunta para as demais ações permitidas.
            </li>
            <li>
              <strong>Controle total:</strong> permite mais ações sem perguntar, mantendo bloqueios
              fixos e a confirmação nativa quando exigida.
            </li>
          </ul>
          <button
            type="button"
            className="secondary-button small-button"
            onClick={onOpenPermissions}
          >
            Abrir Permissões
          </button>
        </div>
      </section>
      <section className="settings-panel settings-section" aria-labelledby="trusted-links-heading">
        <h2 id="trusted-links-heading">Links externos</h2>
        <p className="settings-description">
          Na primeira abertura de cada domínio, o OdeKrai pede sua confirmação. Os domínios
          lembrados podem ser removidos nesta lista.
        </p>
        <form
          className="fallback-provider-add"
          onSubmit={async (event) => {
            event.preventDefault();
            const domain = normalizeTrustedLinkDomain(linkDomainDraft.trim());
            if (!domain || settings.trustedLinkDomains.includes(domain)) return;
            try {
              if (isTauri()) await invoke('trust_external_domain', { domain });
            } catch {
              setTrustedDomainError('Não foi possível salvar o domínio confiável.');
              return;
            }
            update({
              ...settings,
              trustedLinkDomains: [...settings.trustedLinkDomains, domain].slice(0, 100),
            });
            setTrustedDomainError('');
            setLinkDomainDraft('');
          }}
        >
          <label className="sr-only" htmlFor="trusted-link-domain">
            Domínio confiável
          </label>
          <input
            id="trusted-link-domain"
            value={linkDomainDraft}
            onChange={(event) => setLinkDomainDraft(event.target.value)}
            placeholder="exemplo.com"
            maxLength={253}
          />
          <button
            className="secondary-button small-button"
            type="submit"
            disabled={!linkDomainDraft.trim()}
          >
            Adicionar
          </button>
        </form>
        {trustedDomainError && <p role="alert">{trustedDomainError}</p>}
        <ul className="trusted-link-domains">
          {settings.trustedLinkDomains.map((domain) => (
            <li key={domain}>
              <span>{domain}</span>
              <button
                className="secondary-button small-button"
                type="button"
                aria-label={`Esquecer ${domain}`}
                onClick={() => {
                  const forget = isTauri()
                    ? invoke('forget_external_domain', { domain })
                    : Promise.resolve();
                  void forget.then(
                    () => {
                      update({
                        ...settings,
                        trustedLinkDomains: settings.trustedLinkDomains.filter(
                          (item) => item !== domain,
                        ),
                      });
                      setTrustedDomainError('');
                    },
                    () => setTrustedDomainError('Não foi possível remover o domínio confiável.'),
                  );
                }}
              >
                Esquecer
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section
        className="settings-panel settings-section"
        aria-labelledby="provider-fallback-heading"
      >
        <h2 id="provider-fallback-heading">Provedores alternativos</h2>
        <p className="settings-description">
          Se o provedor principal estiver temporariamente indisponível, o OdeKrai tentará os
          próximos desta lista. Provedores sem credencial ou capacidade compatível serão ignorados.
        </p>
        <div className="preference-row">
          <label htmlFor="fallback-provider-select">
            <strong>Adicionar provedor</strong>
          </label>
          <div className="fallback-provider-add">
            <select
              id="fallback-provider-select"
              value={fallbackToAdd}
              onChange={(event) => setFallbackToAdd(event.target.value)}
            >
              <option value="">Selecione</option>
              {AI_PROVIDERS.filter(
                (provider) =>
                  provider.integration !== 'guide' &&
                  provider.id !== settings.activeProviderId &&
                  !settings.fallbackProviderIds.includes(provider.id),
              ).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <button
              className="secondary-button small-button"
              type="button"
              disabled={!fallbackToAdd}
              onClick={() => {
                update(
                  setFallbackProviderIds(settings, [
                    ...settings.fallbackProviderIds,
                    fallbackToAdd,
                  ]),
                );
                setFallbackToAdd('');
              }}
            >
              Adicionar
            </button>
          </div>
        </div>
        {settings.fallbackProviderIds.length > 0 ? (
          <ol className="fallback-provider-list" aria-label="Ordem dos provedores alternativos">
            {settings.fallbackProviderIds.map((providerId, index) => {
              const provider = AI_PROVIDERS.find((item) => item.id === providerId);
              if (!provider) return null;
              return (
                <li key={providerId}>
                  <span>{provider.name}</span>
                  <div>
                    <button
                      type="button"
                      className="secondary-button small-button"
                      aria-label={`Mover ${provider.name} para cima`}
                      disabled={index === 0}
                      onClick={() => update(moveFallbackProvider(settings, providerId, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="secondary-button small-button"
                      aria-label={`Mover ${provider.name} para baixo`}
                      disabled={index === settings.fallbackProviderIds.length - 1}
                      onClick={() => update(moveFallbackProvider(settings, providerId, 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="secondary-button small-button"
                      onClick={() =>
                        update(
                          setFallbackProviderIds(
                            settings,
                            settings.fallbackProviderIds.filter((id) => id !== providerId),
                          ),
                        )
                      }
                    >
                      Remover
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="settings-description">Nenhum provedor alternativo configurado.</p>
        )}
      </section>
      <section className="settings-panel settings-section" aria-labelledby="usage-heading">
        <h2 id="usage-heading">Uso de tokens</h2>
        <p role="status" aria-live="polite">
          Estado: {usageStatus}
        </p>
        <div className="preference-row">
          <div>
            <strong>Limite diário total</strong>
            <span>
              Se uma resposta ultrapassar o limite, ela será descartada e as próximas serão
              bloqueadas. Use 0 para não definir limite.
            </span>
          </div>
          <input
            type="number"
            min="0"
            max="100000000"
            step="1000"
            aria-label="Limite diário de tokens"
            value={settings.dailyTokenLimit}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000)
                update({ ...settings, dailyTokenLimit: value });
            }}
          />
        </div>
        <ul className="provider-usage-list" aria-label="Uso de tokens por provedor">
          {AI_PROVIDERS.filter((provider) =>
            usage.some((item) => item.providerId === provider.id),
          ).map((provider) => {
            const item = usage.find((entry) => entry.providerId === provider.id)!;
            return (
              <li key={provider.id}>
                <strong>{provider.name}</strong>
                <span>
                  Hoje: {(item.todayInput + item.todayOutput).toLocaleString('pt-BR')} tokens
                </span>
                <span>
                  Últimos 7 dias:{' '}
                  {(item.sevenDayInput + item.sevenDayOutput).toLocaleString('pt-BR')} tokens
                </span>
              </li>
            );
          })}
          {usage.length === 0 && (
            <li className="settings-description">Ainda não há uso registrado.</li>
          )}
        </ul>
      </section>
      <section className="settings-panel settings-section">
        <h2>Dados e privacidade</h2>
        <p className="settings-description">
          Preferências ficam neste dispositivo. Perfil e conversas são salvos no banco de dados
          local; credenciais ficam no Gerenciador de Credenciais do Windows.
        </p>
        <div className="preference-row">
          <div>
            <strong>Restaurar preferências</strong>
            <span>Voltar aos valores iniciais deste dispositivo.</span>
          </div>
          <button className="secondary-button small-button" onClick={() => update(defaultSettings)}>
            Restaurar
          </button>
        </div>
        <HistoryDeletionSettings onConfirm={onDeleteAllHistory} />
      </section>
      <div className="provider-footnote">
        <p>A restauração volta ao padrão Encerrar e não remove perfil, histórico ou credenciais.</p>
      </div>
      <section className="settings-panel settings-section" aria-labelledby="about-heading">
        <h2 id="about-heading">Sobre</h2>
        <dl>
          <dt>Versão</dt>
          <dd>{buildInfo?.version ?? '—'}</dd>
          <dt>Commit</dt>
          <dd>{buildInfo?.commit ?? '—'}</dd>
          <dt>Data do build (UTC)</dt>
          <dd>{buildInfo?.build_date ?? '—'}</dd>
          <dt>WebView2</dt>
          <dd>{buildInfo?.webview_version ?? '—'}</dd>
        </dl>
      </section>
    </div>
  );
}

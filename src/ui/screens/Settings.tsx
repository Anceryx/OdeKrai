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

export function SettingsScreen({
  settings,
  update,
  onDeleteAllHistory,
}: {
  settings: AppSettings;
  update: (next: AppSettings) => void;
  onDeleteAllHistory: () => Promise<boolean>;
}) {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [usage, setUsage] = useState<ProviderUsage[]>([]);
  const [fallbackToAdd, setFallbackToAdd] = useState('');
  const [linkDomainDraft, setLinkDomainDraft] = useState('');
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
  }, []);

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
      <section className="settings-panel settings-section" aria-labelledby="trusted-links-heading">
        <h2 id="trusted-links-heading">Links externos</h2>
        <p className="settings-description">
          Na primeira abertura de cada domínio, o OdeKrai pede sua confirmação. Os domínios
          lembrados podem ser removidos nesta lista.
        </p>
        <form
          className="fallback-provider-add"
          onSubmit={(event) => {
            event.preventDefault();
            const domain = normalizeTrustedLinkDomain(linkDomainDraft.trim());
            if (!domain || settings.trustedLinkDomains.includes(domain)) return;
            update({
              ...settings,
              trustedLinkDomains: [...settings.trustedLinkDomains, domain].slice(0, 100),
            });
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
        <ul className="trusted-link-domains">
          {settings.trustedLinkDomains.map((domain) => (
            <li key={domain}>
              <span>{domain}</span>
              <button
                className="secondary-button small-button"
                type="button"
                aria-label={`Esquecer ${domain}`}
                onClick={() =>
                  update({
                    ...settings,
                    trustedLinkDomains: settings.trustedLinkDomains.filter(
                      (item) => item !== domain,
                    ),
                  })
                }
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

import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  canEnableSkill,
  filterSkills,
  groupEnableTarget,
  groupSkills,
  setSkillEnabledCommand,
  setSkillGroupEnabledCommand,
  type SkillCategory,
  type SkillStatus,
} from '../core/skills-catalog';
import { Button, PageHeader, Toggle } from './DesignSystem';
import { RiskBadge, type RiskLevel } from './RiskBadge';
import { PrivacyConfigurationSummary } from './PrivacyConfigurations';

type Skill = {
  id: string;
  name: string;
  description: string;
  risk: RiskLevel;
  resultTrust: 'local' | 'untrusted';
  enabled: boolean;
  morePermissive: boolean;
  fixedBlocked: boolean;
  category: SkillCategory;
  status: SkillStatus;
  configurationRequired: boolean;
};
type GoogleOAuthStatus = {
  connected: boolean;
  clientId: string | null;
  scopes: string[];
  reauthorize: boolean;
};

export function SkillsScreen({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [googleScopes, setGoogleScopes] = useState('');
  const [googleStatus, setGoogleStatus] = useState<GoogleOAuthStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [nextSkills, nextGoogleStatus] = await Promise.all([
        invoke<Skill[]>('get_skills'),
        invoke<GoogleOAuthStatus>('google_oauth_status'),
      ]);
      setSkills(nextSkills);
      setGoogleStatus(nextGoogleStatus);
      if (nextGoogleStatus.clientId) setGoogleClientId(nextGoogleStatus.clientId);
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setEnabled(skill: Skill, enabled: boolean) {
    setBusy(true);
    try {
      await setSkillEnabledCommand(skill.id, enabled, invoke);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function setGroupEnabled(category: SkillCategory) {
    const members = groupSkills(skills, category);
    const target = groupEnableTarget(members, true);
    if (target === undefined) return;
    setBusy(true);
    try {
      await setSkillGroupEnabledCommand(category, target, invoke);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function setOverride(skill: Skill, morePermissive: boolean) {
    setBusy(true);
    try {
      await invoke('set_tool_override', { tool: skill.id, morePermissive });
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  const filteredSkills = filterSkills(skills, query);
  const localSkills = groupSkills(filteredSkills, 'local');
  const integrationSkills = groupSkills(filteredSkills, 'integration');
  const statusLabels: Record<SkillStatus, string> = {
    installed: 'INSTALADO',
    available: 'DISPONÍVEL',
    configuration_required: 'REQUER CONFIGURAÇÃO',
    unavailable: 'INDISPONÍVEL',
  };

  function renderGroup(category: SkillCategory, items: Skill[]) {
    if (query.trim() && items.length === 0) return null;
    const allMembers = groupSkills(skills, category);
    const configured = !allMembers.some((skill) => skill.status === 'configuration_required');
    const target = groupEnableTarget(allMembers, configured);
    return (
      <section
        className="settings-section skills-catalog-group"
        aria-labelledby={`skills-${category}-heading`}
      >
        <div className="section-heading-row">
          <div>
            <h2 id={`skills-${category}-heading`}>
              {category === 'local' ? 'Habilidades locais' : 'Integrações'}
            </h2>
            <p>
              {category === 'local'
                ? 'Arquivos, sistema, agenda, lembretes, memória, áudio e mídia neste computador.'
                : 'Serviços externos disponíveis no registro do aplicativo. Integrações novas exigem atualização do OdeKrai.'}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={busy || !isTauri() || target === undefined || items.length === 0}
            aria-label={`${target ? 'Ativar' : 'Desativar'} todas as ${category === 'local' ? 'habilidades locais' : 'integrações disponíveis'}`}
            onClick={() => void setGroupEnabled(category)}
          >
            {target ? 'Ativar todas do grupo' : 'Desativar grupo'}
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="skills-empty">Nenhuma capacidade corresponde à pesquisa.</p>
        ) : (
          items.map((skill) => (
            <article className="skill-card" key={skill.id}>
              <div>
                <div className="skill-title-row">
                  <h3>{skill.name}</h3>
                  <span className={`skill-status skill-status--${skill.status}`}>
                    {statusLabels[skill.status]}
                  </span>
                </div>
                <p>{skill.description}</p>
                <RiskBadge risk={skill.risk} />
              </div>
              <div className="skill-switch">
                <label htmlFor={`skill-${skill.id}`}>Ativar capacidade</label>
                <Toggle
                  id={`skill-${skill.id}`}
                  checked={skill.enabled}
                  label={`Ativar ${skill.name}`}
                  disabled={
                    busy ||
                    !isTauri() ||
                    !canEnableSkill(skill, skill.status !== 'configuration_required')
                  }
                  onClick={() => void setEnabled(skill, !skill.enabled)}
                />
              </div>
              <details className="skill-advanced">
                <summary>Detalhes avançados e permissões</summary>
                <p>
                  Identificador: <code>{skill.id}</code>. Resultados externos podem conter
                  instruções maliciosas e são tratados como dados, nunca como autorização.
                </p>
                {!skill.fixedBlocked && skill.status !== 'unavailable' && (
                  <div className="skill-switch">
                    <label htmlFor={`override-${skill.id}`}>
                      Permitir modo mais permissivo para esta ferramenta
                    </label>
                    <Toggle
                      id={`override-${skill.id}`}
                      checked={skill.morePermissive}
                      label={`Permitir modo mais permissivo para ${skill.name}`}
                      disabled={busy || !isTauri()}
                      onClick={() => void setOverride(skill, !skill.morePermissive)}
                    />
                  </div>
                )}
                {skill.status === 'unavailable' && (
                  <p>
                    Esta entrada existe apenas para informar que a capacidade não está implementada
                    e não pode ser ativada.
                  </p>
                )}
              </details>
            </article>
          ))
        )}
      </section>
    );
  }

  return (
    <div className="page subpage skills-page">
      <PageHeader
        eyebrow="CAPACIDADES DO APLICATIVO"
        title="Habilidades"
        subtitle="Pesquise as capacidades disponíveis, confira o que fazem e escolha quais podem ser usadas pelo assistente."
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <section className="settings-section skills-search-section">
        <label htmlFor="skills-search">Pesquisar capacidades</label>
        <input
          id="skills-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ex.: agenda, arquivos, Discord"
        />
        <p role="status" aria-live="polite">
          {filteredSkills.length} capacidades encontradas
        </p>
        <p>
          INSTALADO está ativo para o assistente; DISPONÍVEL existe no aplicativo e pode ser
          ativado; REQUER CONFIGURAÇÃO depende de concluir o assistente da integração; INDISPONÍVEL
          não pode ser ativado nesta versão.
        </p>
      </section>
      {filteredSkills.length === 0 && query.trim() ? (
        <p className="skills-empty" role="status">
          Nenhuma capacidade corresponde à pesquisa.
        </p>
      ) : null}
      {!query.trim() && (
        <section className="settings-section" aria-labelledby="google-oauth-heading">
          <div className="section-heading-row">
            <div>
              <h2 id="google-oauth-heading">Conexão com o Google</h2>
              <p>Conecte sua conta para os recursos que precisam acessar serviços do Google.</p>
            </div>
            <span
              className={`skill-status ${googleStatus?.connected ? 'skill-status--installed' : 'skill-status--configuration_required'}`}
              role="status"
            >
              {googleStatus?.connected ? 'CONECTADO' : 'DESCONECTADO'}
            </span>
          </div>
          {googleStatus?.connected && (
            <p>
              Client ID: <code>{googleStatus.clientId}</code>
              <br />
              Escopos autorizados: {googleStatus.scopes.join(', ')}
            </p>
          )}
          {!googleStatus?.connected && (
            <>
              <label htmlFor="google-client-id">Identificador do cliente Google</label>
              <input
                id="google-client-id"
                value={googleClientId}
                onChange={(event) => setGoogleClientId(event.target.value)}
                autoComplete="off"
              />
              <label htmlFor="google-client-secret">Chave opcional do cliente Google</label>
              <input
                id="google-client-secret"
                type="password"
                value={googleClientSecret}
                onChange={(event) => setGoogleClientSecret(event.target.value)}
                autoComplete="new-password"
              />
              <label htmlFor="google-oauth-scopes">
                Acessos solicitados pelo recurso que você vai usar
              </label>
              <input
                id="google-oauth-scopes"
                value={googleScopes}
                onChange={(event) => setGoogleScopes(event.target.value)}
                placeholder="https://www.googleapis.com/auth/calendar.events.owned"
              />
              <p>
                Para a Agenda Google, informe apenas
                https://www.googleapis.com/auth/calendar.events.owned. Aplicativos de computador não
                conseguem manter uma chave de cliente em segredo.
              </p>
              <Button
                disabled={busy || !isTauri() || !googleClientId.trim() || !googleScopes.trim()}
                onClick={() => {
                  setBusy(true);
                  void invoke<GoogleOAuthStatus>('google_oauth_connect', {
                    clientId: googleClientId,
                    clientSecret: googleClientSecret || null,
                    scopes: googleScopes.trim().split(/\s+/),
                  })
                    .then((status) => {
                      setGoogleStatus(status);
                      setGoogleClientSecret('');
                    })
                    .catch((cause) => setError(String(cause)))
                    .finally(() => setBusy(false));
                }}
              >
                Conectar conta Google
              </Button>
            </>
          )}
          {googleStatus?.connected && (
            <Button
              variant="secondary"
              disabled={busy || !isTauri()}
              onClick={() => {
                setBusy(true);
                void invoke('google_oauth_disconnect')
                  .then(() => {
                    setGoogleStatus({
                      connected: false,
                      clientId: null,
                      scopes: [],
                      reauthorize: false,
                    });
                    setGoogleClientSecret('');
                  })
                  .catch(async (cause) => {
                    setError(String(cause));
                    const status = await invoke<GoogleOAuthStatus>('google_oauth_status');
                    setGoogleStatus(status);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Desconectar
            </Button>
          )}
        </section>
      )}
      {renderGroup('local', localSkills)}
      {!query.trim() && (
        <p className="skills-empty">
          Captura de tela: indisponível nesta versão; não há ferramenta registrada para essa
          capacidade.
        </p>
      )}
      {renderGroup('integration', integrationSkills)}
      <PrivacyConfigurationSummary onOpen={onOpenPrivacy} />
    </div>
  );
}

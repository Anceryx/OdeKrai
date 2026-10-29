import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { desktopDir, documentDir, downloadDir, pictureDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
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
import { DiscordWebhooksSettings } from './DiscordWebhooksSettings';
import { Icon } from './Icon';
import { Button, PageHeader, SelectInput, Toggle } from './DesignSystem';

type Risk =
  | 'leitura'
  | 'escrita_reversivel'
  | 'comunicacao_externa'
  | 'destrutivo_financeiro'
  | 'execucao_de_codigo';
type Skill = {
  id: string;
  name: string;
  description: string;
  risk: Risk;
  resultTrust: 'local' | 'untrusted';
  enabled: boolean;
  morePermissive: boolean;
  fixedBlocked: boolean;
  category: SkillCategory;
  status: SkillStatus;
  configurationRequired: boolean;
};
type Folder = { path: string; access: 'read_only' | 'read_write'; workspace: boolean };
type AllowedApp = { id: string; name: string; path: string };
type McpServer = {
  id: string;
  name: string;
  command: string;
  args: string[];
  envNames: string[];
  enabled: boolean;
  status: string;
  error: string | null;
};
type McpState = { label: string; tools?: unknown; error?: string };
type GoogleOAuthStatus = {
  connected: boolean;
  clientId: string | null;
  scopes: string[];
  reauthorize: boolean;
};

const riskLabels: Record<Risk, string> = {
  leitura: 'Leitura',
  escrita_reversivel: 'Escrita reversível',
  comunicacao_externa: 'Comunicação externa',
  destrutivo_financeiro: 'Destrutivo ou financeiro',
  execucao_de_codigo: 'Execução de código (alto)',
};

export function SkillsScreen() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [apps, setApps] = useState<AllowedApp[]>([]);
  const [access, setAccess] = useState<'read_only' | 'read_write'>('read_only');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpStates, setMcpStates] = useState<Record<string, McpState>>({});
  const [mcpName, setMcpName] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [mcpEnvNames, setMcpEnvNames] = useState('');
  const [mcpSecrets, setMcpSecrets] = useState<Record<string, string>>({});
  const [mcpConfirmed, setMcpConfirmed] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [googleScopes, setGoogleScopes] = useState('');
  const [googleStatus, setGoogleStatus] = useState<GoogleOAuthStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [nextSkills, nextFolders, nextApps, nextMcpServers] = await Promise.all([
        invoke<Skill[]>('get_skills'),
        invoke<Folder[]>('get_allowed_folders'),
        invoke<AllowedApp[]>('get_allowed_apps'),
        invoke<McpServer[]>('mcp_list_servers'),
      ]);
      setSkills(nextSkills);
      setFolders(nextFolders);
      setApps(nextApps);
      setMcpServers(nextMcpServers);
      const nextGoogleStatus = await invoke<GoogleOAuthStatus>('google_oauth_status');
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

  useEffect(() => {
    const refreshMcpStatus = () => {
      if (isTauri()) {
        void invoke<McpServer[]>('mcp_list_servers')
          .then(setMcpServers)
          .catch((cause) => setError(String(cause)));
      }
    };
    window.addEventListener('focus', refreshMcpStatus);
    return () => window.removeEventListener('focus', refreshMcpStatus);
  }, []);

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

  async function addMcpServer() {
    if (!mcpConfirmed) {
      setError('Confirme que este programa será executado com os privilégios do seu usuário.');
      return;
    }
    setBusy(true);
    try {
      const args = mcpArgs.split('\n').filter((line) => line.length > 0);
      const envNames = mcpEnvNames
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const server = await invoke<McpServer>('mcp_add_server', {
        name: mcpName,
        command: mcpCommand,
        args,
        envNames,
      });
      try {
        for (const key of envNames) {
          const value = mcpSecrets[key];
          if (value) await invoke('mcp_set_secret', { serverId: server.id, key, value });
        }
      } catch (cause) {
        await invoke('mcp_remove_server', { serverId: server.id }).catch(() => undefined);
        throw cause;
      }
      setMcpSecrets({});
      setMcpName('');
      setMcpCommand('');
      setMcpArgs('');
      setMcpEnvNames('');
      setMcpConfirmed(false);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setMcpSecrets({});
      setBusy(false);
    }
  }

  async function testMcpServer(server: McpServer) {
    const display = [server.command, ...server.args]
      .map((part) => `"${part.replaceAll('"', '\\"')}"`)
      .join(' ');
    if (
      !window.confirm(
        `Este programa será executado no seu computador com os seus privilégios.\n\nComando completo:\n${display}\n\nDeseja continuar?`,
      )
    )
      return;
    setMcpStates((states) => ({ ...states, [server.id]: { label: 'Conectando…' } }));
    try {
      const tools = await invoke<unknown>('mcp_test_connection', {
        serverId: server.id,
        confirmed: true,
      });
      setMcpStates((states) => ({ ...states, [server.id]: { label: 'Conectado', tools } }));
    } catch (cause) {
      const error = String(cause);
      setMcpStates((states) => ({ ...states, [server.id]: { label: 'Erro', error } }));
    }
  }

  async function saveMcpSecret(server: McpServer, key: string) {
    const value = mcpSecrets[`${server.id}:${key}`];
    if (!value) return;
    setBusy(true);
    try {
      await invoke('mcp_set_secret', { serverId: server.id, key, value });
      setMcpStates((states) => ({ ...states, [server.id]: { label: 'Parado' } }));
      setMcpSecrets((secrets) => {
        const next = { ...secrets };
        delete next[`${server.id}:${key}`];
        return next;
      });
      await refresh();
      setError('');
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function setMcpEnabled(server: McpServer, enabled: boolean) {
    setBusy(true);
    try {
      await invoke('mcp_set_enabled', { serverId: server.id, enabled });
      setMcpStates((states) => ({ ...states, [server.id]: { label: 'Parado' } }));
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addFolder(suggestion: string) {
    if (!isTauri()) return;
    const knownFolder = {
      Documentos: documentDir,
      Downloads: downloadDir,
      'Área de Trabalho': desktopDir,
      Imagens: pictureDir,
    }[suggestion];
    if (!knownFolder) return;
    let selected: string | string[] | null;
    try {
      const defaultPath = await knownFolder();
      selected = await open({
        directory: true,
        multiple: false,
        title: `Escolha uma pasta para ${suggestion}`,
        defaultPath,
      });
    } catch (cause) {
      setError(String(cause));
      return;
    }
    if (typeof selected !== 'string') return;
    setBusy(true);
    try {
      await invoke('add_allowed_folder', { path: selected, access });
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function removeFolder(folder: Folder) {
    setBusy(true);
    try {
      await invoke('remove_allowed_folder', { path: folder.path });
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addApp() {
    if (!isTauri()) return;
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: 'Escolha um aplicativo permitido',
        filters: [{ name: 'Aplicativos Windows', extensions: ['exe'] }],
      });
      if (typeof selected !== 'string') return;
      const suggestedName =
        selected
          .split(/[\\/]/)
          .at(-1)
          ?.replace(/\.exe$/i, '') ?? '';
      const name = window.prompt('Nome do aplicativo permitido', suggestedName)?.trim();
      if (!name) return;
      setBusy(true);
      await invoke('register_allowed_app', { name, path: selected });
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function removeApp(app: AllowedApp) {
    setBusy(true);
    try {
      await invoke('remove_allowed_app', { appId: app.id });
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
                <small>Risco: {riskLabels[skill.risk]}</small>
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
        subtitle="Pesquise o registro Rust do aplicativo, confira os riscos e escolha o que pode ser oferecido ao assistente."
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
              <h2 id="google-oauth-heading">Integração OAuth do Google</h2>
              <p>Conexão reutilizável para integrações que fornecem seus próprios escopos.</p>
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
              <label htmlFor="google-client-id">Client ID do cliente OAuth para computador</label>
              <input
                id="google-client-id"
                value={googleClientId}
                onChange={(event) => setGoogleClientId(event.target.value)}
                autoComplete="off"
              />
              <label htmlFor="google-client-secret">Client secret (opcional)</label>
              <input
                id="google-client-secret"
                type="password"
                value={googleClientSecret}
                onChange={(event) => setGoogleClientSecret(event.target.value)}
                autoComplete="new-password"
              />
              <label htmlFor="google-oauth-scopes">
                Escopos informados pela integração consumidora
              </label>
              <input
                id="google-oauth-scopes"
                value={googleScopes}
                onChange={(event) => setGoogleScopes(event.target.value)}
                placeholder="URI dos escopos, separados por espaço"
              />
              <p>
                O módulo não define escopos. Cole aqui os escopos documentados pela integração que
                usará a conexão. Clientes desktop são públicos; o secret não é confidencial.
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
      {!query.trim() && (
        <section className="settings-section allowed-folders-section" aria-labelledby="mcp-heading">
          <div className="section-heading-row">
            <div>
              <h2 id="mcp-heading">Integrações (MCP)</h2>
              <p>
                Cadastre servidores locais para inspecionar ferramentas e schemas. Eles não ficam
                disponíveis ao assistente.
              </p>
            </div>
          </div>
          <p role="note">
            <strong>Aviso:</strong> este programa roda no seu computador com os seus privilégios.
            Nada é instalado automaticamente.
          </p>
          <div className="mcp-settings-grid">
            <label>
              Nome
              <input
                value={mcpName}
                onChange={(event) => setMcpName(event.target.value)}
                maxLength={80}
              />
            </label>
            <label>
              Comando ou caminho do programa
              <input value={mcpCommand} onChange={(event) => setMcpCommand(event.target.value)} />
            </label>
            <label>
              Argumentos (um por linha)
              <textarea
                value={mcpArgs}
                onChange={(event) => setMcpArgs(event.target.value)}
                rows={3}
              />
            </label>
            <label>
              Nomes das variáveis de ambiente (um por linha)
              <textarea
                value={mcpEnvNames}
                onChange={(event) => setMcpEnvNames(event.target.value)}
                rows={3}
              />
            </label>
            {mcpEnvNames
              .split('\n')
              .map((key) => key.trim())
              .filter(Boolean)
              .map((key) => (
                <label key={key}>
                  {key} (opcional; salvo no Credential Manager)
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={mcpSecrets[key] ?? ''}
                    onChange={(event) =>
                      setMcpSecrets((secrets) => ({ ...secrets, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
          </div>
          <p>
            Comando completo que será executado:{' '}
            <code>
              {[mcpCommand, ...mcpArgs.split('\n').filter(Boolean)]
                .map((part) => `"${part.replaceAll('"', '\\"')}"`)
                .join(' ') || '—'}
            </code>
          </p>
          <label className="skill-switch">
            <input
              type="checkbox"
              checked={mcpConfirmed}
              onChange={(event) => setMcpConfirmed(event.target.checked)}
            />{' '}
            Confirmo que entendo que o programa cadastrado será executado no meu computador com os
            meus privilégios.
          </label>
          <Button
            variant="secondary"
            disabled={busy || !isTauri() || !mcpConfirmed}
            onClick={() => void addMcpServer()}
          >
            Adicionar servidor
          </Button>
          <ul className="allowed-folder-list">
            {mcpServers.length === 0 && <li>Parado · Nenhum servidor MCP cadastrado.</li>}
            {mcpServers.map((server) => {
              const state = mcpStates[server.id] ?? {
                label: server.status,
                error: server.error ?? undefined,
              };
              const displayState = !server.enabled
                ? 'Parado'
                : server.status === 'Erro' || server.status === 'Conectado'
                  ? server.status
                  : state.label;
              const displayError = server.error ?? state.error;
              const command = [server.command, ...server.args].join(' ');
              return (
                <li key={server.id}>
                  <div>
                    <strong>{server.name}</strong>
                    <small className="mcp-server-command">
                      Comando completo: <code>{command}</code>
                    </small>
                    <small>
                      Estado: <span role="status">{displayState}</span> ·{' '}
                      {server.enabled ? 'Ativado' : 'Desativado'}
                    </small>
                    {displayError && <p role="alert">Causa: {displayError}</p>}
                    {server.envNames.map((key) => (
                      <label className="mcp-env-field" key={key}>
                        {key} · segredo (opcional)
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={mcpSecrets[`${server.id}:${key}`] ?? ''}
                          onChange={(event) =>
                            setMcpSecrets((secrets) => ({
                              ...secrets,
                              [`${server.id}:${key}`]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          variant="secondary"
                          disabled={busy || !mcpSecrets[`${server.id}:${key}`]}
                          onClick={() => void saveMcpSecret(server, key)}
                        >
                          Salvar credencial
                        </Button>
                      </label>
                    ))}
                    {state.tools !== undefined && (
                      <pre aria-label="Ferramentas e schemas não confiáveis">
                        {String(JSON.stringify(state.tools, null, 2))}
                      </pre>
                    )}
                    <div className="skill-switch">
                      <label>
                        <input
                          type="checkbox"
                          checked={server.enabled}
                          onChange={(event) => void setMcpEnabled(server, event.target.checked)}
                        />{' '}
                        Ativar integração
                      </label>
                      <Button
                        variant="secondary"
                        disabled={!server.enabled || busy}
                        onClick={() => void testMcpServer(server)}
                      >
                        Testar conexão
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remover ${server.name} e apagar suas credenciais do Gerenciador de Credenciais?`,
                            )
                          )
                            void invoke('mcp_remove_server', { serverId: server.id })
                              .then(refresh)
                              .catch((cause) => setError(String(cause)));
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {integrationSkills.some(({ id }) => id === 'discord.send') && (
        <DiscordWebhooksSettings onChanged={refresh} />
      )}
      <section className="settings-section allowed-folders-section">
        <div className="section-heading-row">
          <div>
            <h2>Aplicativos permitidos</h2>
            <p>O assistente só pode iniciar os executáveis escolhidos aqui, sem argumentos.</p>
          </div>
          <Button variant="secondary" disabled={busy || !isTauri()} onClick={() => void addApp()}>
            <Icon name="folder" /> Escolher aplicativo
          </Button>
        </div>
        <ul className="allowed-folder-list">
          {apps.map((allowedApp) => (
            <li key={allowedApp.id}>
              <div>
                <strong>{allowedApp.name}</strong>
                <small>
                  {allowedApp.path} · {allowedApp.id}
                </small>
              </div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void removeApp(allowedApp)}
                aria-label={`Remover ${allowedApp.name}`}
              >
                <Icon name="delete" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section className="settings-section allowed-folders-section">
        <div className="section-heading-row">
          <div>
            <h2>Pastas permitidas</h2>
            <p>
              A pasta de trabalho permanece sempre com leitura e escrita. Outras pastas só entram na
              lista após você selecioná-las.
            </p>
          </div>
          <label>
            Nível de acesso
            <SelectInput
              value={access}
              onChange={(event) => setAccess(event.target.value as typeof access)}
            >
              <option value="read_only">Somente leitura</option>
              <option value="read_write">Leitura e escrita</option>
            </SelectInput>
          </label>
        </div>
        <div className="folder-shortcuts">
          {['Documentos', 'Downloads', 'Área de Trabalho', 'Imagens'].map((name) => (
            <Button
              key={name}
              variant="secondary"
              disabled={busy || !isTauri()}
              onClick={() => void addFolder(name)}
            >
              <Icon name="folder" /> Adicionar {name}
            </Button>
          ))}
        </div>
        <ul className="allowed-folder-list">
          {folders.map((folder) => (
            <li key={folder.path}>
              <div>
                <strong>{folder.path}</strong>
                <small>
                  {folder.workspace
                    ? 'Pasta de trabalho · leitura e escrita'
                    : folder.access === 'read_only'
                      ? 'Somente leitura'
                      : 'Leitura e escrita'}
                </small>
              </div>
              {!folder.workspace && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void removeFolder(folder)}
                  aria-label={`Remover ${folder.path}`}
                >
                  <Icon name="delete" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

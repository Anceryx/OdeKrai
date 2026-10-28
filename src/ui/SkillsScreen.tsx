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

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [nextSkills, nextFolders, nextApps] = await Promise.all([
        invoke<Skill[]>('get_skills'),
        invoke<Folder[]>('get_allowed_folders'),
        invoke<AllowedApp[]>('get_allowed_apps'),
      ]);
      setSkills(nextSkills);
      setFolders(nextFolders);
      setApps(nextApps);
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
      {renderGroup('local', localSkills)}
      {!query.trim() && (
        <p className="skills-empty">
          Captura de tela: indisponível nesta versão; não há ferramenta registrada para essa
          capacidade.
        </p>
      )}
      {renderGroup('integration', integrationSkills)}
      {!query.trim() && (
        <p className="skills-empty">
          Servidores MCP: indisponíveis nesta versão. Há um módulo de enquadramento de mensagens,
          mas faltam cliente de transporte, cadastro, credenciais e encaminhamento de ferramentas. O
          suporte exige atualização do aplicativo.
        </p>
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

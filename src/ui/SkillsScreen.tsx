import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { desktopDir, documentDir, downloadDir, pictureDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { Icon } from './Icon';
import { Button, PageHeader, SelectInput, Toggle } from './DesignSystem';

type Risk = 'leitura' | 'escrita_reversivel' | 'comunicacao_externa' | 'destrutivo_financeiro';
type Skill = {
  id: string;
  name: string;
  description: string;
  risk: Risk;
  resultTrust: 'local' | 'untrusted';
  enabled: boolean;
  morePermissive: boolean;
  fixedBlocked: boolean;
};
type Folder = { path: string; access: 'read_only' | 'read_write'; workspace: boolean };

const riskLabels: Record<Risk, string> = {
  leitura: 'Leitura',
  escrita_reversivel: 'Escrita reversível',
  comunicacao_externa: 'Comunicação externa',
  destrutivo_financeiro: 'Destrutivo ou financeiro',
};

export function SkillsScreen() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [access, setAccess] = useState<'read_only' | 'read_write'>('read_only');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [nextSkills, nextFolders] = await Promise.all([
        invoke<Skill[]>('get_skills'),
        invoke<Folder[]>('get_allowed_folders'),
      ]);
      setSkills(nextSkills);
      setFolders(nextFolders);
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
      await invoke('set_skill_enabled', { skillId: skill.id, enabled });
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

  const workspaceSkills = skills.filter(
    ({ id }) => id.startsWith('workspace.') || id.startsWith('files.'),
  );
  const simulatedSkills = skills.filter(({ id }) => id.startsWith('simulated.'));

  return (
    <div className="page subpage skills-page">
      <PageHeader
        eyebrow="AUTOMAÇÃO LOCAL"
        title="Habilidades"
        subtitle="Escolha quais capacidades podem ser oferecidas ao assistente."
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <section className="settings-section">
        <h2>Arquivos e pastas</h2>
        {workspaceSkills.map((skill) => (
          <article className="skill-card" key={skill.id}>
            <div>
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
              <small>Risco: {riskLabels[skill.risk]}</small>
            </div>
            <div className="skill-switch">
              <span>Ativar</span>
              <Toggle
                checked={skill.enabled}
                label={`Ativar ${skill.name}`}
                disabled={busy || !isTauri()}
                onClick={() => void setEnabled(skill, !skill.enabled)}
              />
            </div>
            {!skill.fixedBlocked && (
              <div className="skill-switch">
                <span>Usar modo mais permissivo</span>
                <Toggle
                  checked={skill.morePermissive}
                  label={`Usar modo mais permissivo para ${skill.name}`}
                  disabled={busy || !isTauri()}
                  onClick={() => void setOverride(skill, !skill.morePermissive)}
                />
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="settings-section">
        <h2>Simulações</h2>
        {simulatedSkills.map((skill) => (
          <article className="skill-card" key={skill.id}>
            <div>
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
              <small>
                Risco: {riskLabels[skill.risk]} · Resultado:{' '}
                {skill.resultTrust === 'local' ? 'local' : 'não confiável'}
              </small>
            </div>
            <div className="skill-switch">
              <span>Ativar</span>
              <Toggle
                checked={skill.enabled}
                label={`Ativar ${skill.name}`}
                disabled={busy || !isTauri()}
                onClick={() => void setEnabled(skill, !skill.enabled)}
              />
            </div>
            {!skill.fixedBlocked && (
              <div className="skill-switch">
                <span>Usar modo mais permissivo</span>
                <Toggle
                  checked={skill.morePermissive}
                  label={`Usar modo mais permissivo para ${skill.name}`}
                  disabled={busy || !isTauri()}
                  onClick={() => void setOverride(skill, !skill.morePermissive)}
                />
              </div>
            )}
          </article>
        ))}
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

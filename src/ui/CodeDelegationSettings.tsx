import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

type CodeToolSettings = { tool: string | null; executable: string | null };

export function CodeDelegationSettings() {
  const [selected, setSelected] = useState<CodeToolSettings>({ tool: null, executable: null });
  const [tool, setTool] = useState('codex');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!isTauri()) return;
    const current = await invoke<CodeToolSettings>('get_code_tool_settings');
    setSelected(current);
    if (current.tool) setTool(current.tool);
  }

  useEffect(() => {
    void refresh().catch(() => setMessage('Não foi possível carregar a ferramenta configurada.'));
  }, []);

  async function chooseExecutable() {
    if (!isTauri()) return;
    const executable = await open({
      multiple: false,
      directory: false,
      title: 'Selecione a ferramenta de código já instalada',
      filters: [{ name: 'Executáveis Windows', extensions: ['exe'] }],
    });
    if (typeof executable !== 'string') return;
    setBusy(true);
    try {
      await invoke('set_code_tool', { tool, executable });
      await refresh();
      setMessage('Ferramenta salva neste dispositivo.');
    } catch {
      setMessage('Não foi possível validar ou salvar esse executável.');
    } finally {
      setBusy(false);
    }
  }

  async function clearExecutable() {
    setBusy(true);
    try {
      await invoke('set_code_tool', { tool, executable: '' });
      await refresh();
      setMessage('Ferramenta removida.');
    } catch {
      setMessage('Não foi possível remover a configuração.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel settings-section" aria-labelledby="code-delegation-heading">
      <h2 id="code-delegation-heading">Ferramenta de código</h2>
      <p className="settings-description">
        Selecione uma instalação existente do Codex CLI ou Claude Code. O OdeKrai não instala
        ferramentas. Cadastre o projeto em Permissões como pasta permitida com leitura e escrita. A
        execução usa os privilégios da sua conta e sempre pede aprovação.
      </p>
      <label htmlFor="code-tool-kind">Ferramenta</label>
      <select id="code-tool-kind" value={tool} onChange={(event) => setTool(event.target.value)}>
        <option value="codex">Codex CLI</option>
        <option value="claude">Claude Code</option>
      </select>
      {selected.executable && (
        <p className="settings-description" title={selected.executable}>
          Executável: {selected.executable}
        </p>
      )}
      <div className="settings-actions">
        <button
          type="button"
          className="secondary-button small-button"
          onClick={chooseExecutable}
          disabled={busy}
        >
          Selecionar executável
        </button>
        {selected.executable && (
          <button
            type="button"
            className="secondary-button small-button"
            onClick={clearExecutable}
            disabled={busy}
          >
            Remover configuração
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

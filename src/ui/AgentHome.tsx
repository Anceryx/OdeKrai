import { useEffect, useState, type FormEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Banner, Button, Card, PageHeader, SelectInput, TextInput } from './DesignSystem';

const TONE_PRESETS = ['direto e cordial', 'acolhedor', 'formal'];

type HomeStatus = {
  configured: boolean;
  path: string;
  warning: string | null;
  changed_externally: boolean;
};
type CoreRead = {
  content: string;
  current_hash: string;
  approved_content: string;
  changed_externally: boolean;
  diff: string;
};
type Profile = { name: string; nickname: string; language: string; tone: string; mode: string };

export function AgentHome({
  onStatus,
  initialName = '',
  initialNickname = '',
}: {
  onStatus?: (status: HomeStatus) => void;
  initialName?: string;
  initialNickname?: string;
}) {
  const [status, setStatus] = useState<HomeStatus | null>(null);
  const [path, setPath] = useState('');
  const [customTone, setCustomTone] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    name: initialName,
    nickname: initialNickname,
    language: 'pt-BR',
    tone: 'direto e cordial',
    mode: 'sempre_perguntar',
  });
  const [core, setCore] = useState<CoreRead | null>(null);
  const [coreDraft, setCoreDraft] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [memoryName, setMemoryName] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const next = await invoke<HomeStatus>('agent_home_status');
    setStatus(next);
    setPath(next.path);
    onStatus?.(next);
    if (next.configured) {
      const [document, files] = await Promise.all([
        invoke<CoreRead>('agent_home_read_core'),
        invoke<string[]>('agent_memory_list'),
      ]);
      setCore(document);
      setCoreDraft(document.content);
      setNames(files);
    }
  }
  useEffect(() => {
    if (isTauri()) void refresh().catch((cause) => setError(String(cause)));
  }, []);
  useEffect(() => {
    setProfile((current) => ({
      ...current,
      name: current.name || initialName,
      nickname: current.nickname || initialNickname,
    }));
  }, [initialName, initialNickname]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function initialize(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm(`Criar a pasta pessoal do OdeKrai em ${path}?`)) return;
    await run(async () => {
      await invoke('agent_home_init', { path, profile });
      await refresh();
      setNotice('Pasta pessoal criada. Ajuste as permissões ativas na tela Permissões.');
    });
  }
  async function saveCore() {
    if (!core || !window.confirm('Aprovar e salvar este ODEKRAI.md como sua identidade?')) return;
    await run(async () => {
      await invoke('agent_home_save_core', { content: coreDraft, expectedHash: core.current_hash });
      await refresh();
      setNotice('Identidade aprovada e salva.');
    });
  }
  async function openMemory(name: string) {
    await run(async () => {
      setMemoryDraft(await invoke<string>('agent_memory_read', { name }));
      setMemoryName(name);
    });
  }
  async function saveMemory() {
    await run(async () => {
      await invoke('agent_memory_save', { name: memoryName, content: memoryDraft });
      setNames(await invoke<string[]>('agent_memory_list'));
      setNotice('Memória salva.');
    });
  }
  async function deleteMemory() {
    if (!window.confirm(`Apagar ${memoryName}?`)) return;
    await run(async () => {
      await invoke('agent_memory_delete', { name: memoryName });
      setNames(await invoke<string[]>('agent_memory_list'));
      setMemoryName('');
      setMemoryDraft('');
    });
  }
  async function deleteAllMemory() {
    if (!window.confirm('Apagar todos os arquivos de memória? Esta ação não pode ser desfeita.'))
      return;
    await run(async () => {
      await invoke('agent_memory_delete_all');
      setNames([]);
      setMemoryName('');
      setMemoryDraft('');
    });
  }
  if (!isTauri()) return <p>A pasta pessoal está disponível no aplicativo Windows.</p>;
  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="IDENTIDADE LOCAL"
        title="Identidade e memória"
        subtitle="Defina como o OdeKrai conversa com você e edite suas notas locais."
      />
      {error && (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      )}
      {notice && <Banner>{notice}</Banner>}
      {status?.warning && (
        <Banner tone="warning" role="alert">
          {status.warning}
        </Banner>
      )}
      {!status?.configured ? (
        <form onSubmit={initialize} className="settings-card" style={{ display: 'grid', gap: 12 }}>
          <h2>Primeira execução</h2>
          <label>
            Pasta local
            <TextInput value={path} onChange={(e) => setPath(e.target.value)} required />
          </label>
          <Button
            variant="secondary"
            type="button"
            className="secondary-button"
            onClick={async () => {
              const selected = await open({ directory: true, multiple: false });
              if (typeof selected === 'string') setPath(selected);
            }}
          >
            Escolher pasta
          </Button>
          <label>
            Seu nome
            <TextInput
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              maxLength={60}
              required
            />
          </label>
          <label>
            Como quer ser chamado
            <TextInput
              value={profile.nickname}
              onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
              maxLength={60}
              required
            />
          </label>
          <label>
            Idioma
            <SelectInput
              value={profile.language}
              onChange={(e) => setProfile({ ...profile, language: e.target.value })}
            >
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English</option>
            </SelectInput>
          </label>
          <label>
            Tom
            <SelectInput
              value={customTone ? 'personalizado' : profile.tone}
              onChange={(e) => {
                setCustomTone(e.target.value === 'personalizado');
                if (e.target.value !== 'personalizado')
                  setProfile({ ...profile, tone: e.target.value });
              }}
            >
              {TONE_PRESETS.map((tone) => (
                <option key={tone} value={tone}>
                  {tone[0].toLocaleUpperCase('pt-BR') + tone.slice(1)}
                </option>
              ))}
              <option value="personalizado">Personalizado</option>
            </SelectInput>
          </label>
          {customTone && (
            <label>
              Tom personalizado
              <TextInput
                value={profile.tone}
                onChange={(e) => setProfile({ ...profile, tone: e.target.value })}
                maxLength={80}
                required
              />
            </label>
          )}
          <label>
            Modo de permissão preferido
            <SelectInput
              value={profile.mode}
              onChange={(e) => setProfile({ ...profile, mode: e.target.value })}
            >
              <option value="sempre_perguntar">Sempre perguntar</option>
              <option value="aprovar_por_mim">Aprovar por mim</option>
              <option value="controle_total">Controle total</option>
            </SelectInput>
          </label>
          <p>
            Esta preferência fica registrada na identidade. Para mudar as permissões ativas, use a
            tela Permissões.
          </p>
          <Button type="submit" variant="primary" disabled={busy}>
            Criar e aprovar identidade
          </Button>
        </form>
      ) : (
        <>
          <p>
            Pasta: <code>{status.path}</code>
          </p>
          <Card className="settings-card" style={{ display: 'grid', gap: 12 }}>
            <h2>ODEKRAI.md</h2>
            <p>
              Não coloque senhas, tokens ou outros segredos neste arquivo. A versão aprovada é
              guardada localmente para mostrar alterações.
            </p>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              Recarregar arquivo e verificar alterações
            </button>
            {core?.changed_externally && (
              <>
                <p role="alert">
                  O arquivo mudou fora do aplicativo. O chat fica bloqueado até sua aprovação.
                </p>
                <details>
                  <summary>Ver diferenças</summary>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{core.diff}</pre>
                </details>
              </>
            )}
            <textarea
              aria-label="Editar ODEKRAI.md"
              value={coreDraft}
              onChange={(e) => setCoreDraft(e.target.value)}
              rows={14}
              maxLength={16384}
            />
            <button
              className="primary-button"
              onClick={() => void saveCore()}
              disabled={busy || (!core?.changed_externally && coreDraft === core?.content)}
            >
              Aprovar e salvar
            </button>
          </Card>
          <Card className="settings-card" style={{ display: 'grid', gap: 12 }}>
            <h2>Memória</h2>
            <p>
              Somente notas manuais. Não coloque senhas, tokens, documentos ou dados bancários na
              memória. O conteúdo de estilo.md pode ser resumido e enviado ao provedor durante o
              chat.
            </p>
            <div>
              {names.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="secondary-button"
                  onClick={() => void openMemory(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setMemoryName('');
                setMemoryDraft('');
              }}
            >
              Nova nota
            </button>
            <label>
              Nome do arquivo (.md)
              <input
                value={memoryName}
                onChange={(e) => setMemoryName(e.target.value)}
                maxLength={64}
                placeholder="estilo.md"
              />
            </label>
            <textarea
              aria-label="Conteúdo da memória"
              value={memoryDraft}
              onChange={(e) => setMemoryDraft(e.target.value)}
              maxLength={8192}
              rows={8}
            />
            <div>
              <button
                className="primary-button"
                type="button"
                disabled={busy || !memoryName}
                onClick={() => void saveMemory()}
              >
                Salvar nota
              </button>{' '}
              <button
                className="secondary-button"
                type="button"
                disabled={busy || !names.includes(memoryName)}
                onClick={() => void deleteMemory()}
              >
                Apagar nota
              </button>{' '}
              <button
                className="secondary-button"
                type="button"
                disabled={busy || names.length === 0}
                onClick={() => void deleteAllMemory()}
              >
                Apagar toda a memória
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

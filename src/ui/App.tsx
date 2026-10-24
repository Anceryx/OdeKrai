import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { sendChatMessage, type ChatMessage } from '../core/chat';
import { defaultSettings, loadSettings, saveSettings, type AppSettings } from '../core/settings';
import { emit } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  normalizeSoundPreferences,
  playSound,
  SOUND_EVENTS,
  type SoundEvent,
} from '../core/sounds';

type Section = 'overview' | 'chat' | 'providers' | 'companion' | 'settings';

const nav: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'overview', label: 'Visão geral', icon: '⌂', group: 'ESPAÇO DE TRABALHO' },
  { id: 'chat', label: 'Conversas', icon: '◌', group: 'ESPAÇO DE TRABALHO' },
  { id: 'providers', label: 'Provedores de IA', icon: '✳', group: 'INTELIGÊNCIA' },
  { id: 'companion', label: 'Companion', icon: '◇', group: 'PERSONALIZAÇÃO' },
  { id: 'settings', label: 'Configurações', icon: '⚙', group: 'PERSONALIZAÇÃO' },
];

export function App() {
  const [section, setSection] = useState<Section>('overview');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [apiKey, setApiKey] = useState('');
  const [keySavedForSession, setKeySavedForSession] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [chatMode, setChatMode] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    const refreshSettings = () => setSettings(loadSettings());
    window.addEventListener('storage', refreshSettings);
    return () => window.removeEventListener('storage', refreshSettings);
  }, []);
  useEffect(() => {
    const companion = settings.companion;
    if (!isTauri() || !companion.enabled) return;
    const width = 280 * companion.size;
    const height = 150 * companion.size;
    const right = companion.position.endsWith('right');
    const bottom = companion.position.startsWith('bottom');
    const x =
      companion.coordinates?.x ?? (right ? Math.max(0, screen.availWidth - width - 28) : 28);
    const y =
      companion.coordinates?.y ?? (bottom ? Math.max(0, screen.availHeight - height - 58) : 28);
    void invoke('set_island_position', { x, y, size: companion.size })
      .then(() => invoke('set_island_topmost', { enabled: companion.alwaysOnTop }))
      .then(() => invoke('set_island_visible', { visible: true }))
      .then(() => emit('companion-state', { type: 'reveal' }))
      .catch(() => setToast('Não foi possível restaurar a ilha do Companion.'));
  }, []);
  useEffect(() => {
    const companion = settings.companion;
    if (!isTauri() || !companion.freeMode) return;
    const x =
      companion.desktopCoordinates?.x ??
      Math.max(0, (screen.availWidth - 104 * companion.size) / 2);
    const y =
      companion.desktopCoordinates?.y ??
      Math.max(0, (screen.availHeight - 104 * companion.size) / 2);
    void invoke('set_character_position', { x, y, size: companion.size })
      .then(() => invoke('set_character_visible', { visible: true }))
      .catch(() => setToast('Não foi possível restaurar o marcador no desktop.'));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => () => request.current?.abort(), []);

  const currentNav = useMemo(() => nav.find((item) => item.id === section), [section]);

  function updateProvider(field: keyof AppSettings['provider'], value: string) {
    setSettings((current) => ({ ...current, provider: { ...current.provider, [field]: value } }));
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (!apiKey.trim()) {
      setError('Adicione uma chave de API para conversar com o provedor configurado.');
      setSection('providers');
      return;
    }
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setDraft('');
    setError('');
    setBusy(true);
    if (isTauri())
      void emit('companion-state', {
        type: 'activity',
        state: 'thinking',
        message: 'Aguardando resposta do provedor',
      });
    request.current = new AbortController();
    try {
      const answer = await sendChatMessage(
        settings.provider.baseUrl,
        settings.provider.model,
        apiKey,
        next,
        request.current.signal,
      );
      setMessages([...next, { role: 'assistant', content: answer }]);
      void playSound('success', normalizeSoundPreferences(settings.companion.sounds));
      if (isTauri())
        void emit('companion-state', {
          type: 'activity',
          state: 'completed',
          message: 'Resposta recebida',
        });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setMessages(next);
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível concluir a solicitação.',
        );
        void playSound('error', normalizeSoundPreferences(settings.companion.sounds));
        if (isTauri())
          void emit('companion-state', {
            type: 'activity',
            state: 'error',
            message: 'Não foi possível concluir a solicitação',
          });
      }
    } finally {
      setBusy(false);
      request.current = null;
    }
  }

  function cancelRequest() {
    request.current?.abort();
    setBusy(false);
  }

  return (
    <div
      className={`app-shell ${settings.reduceMotion ? 'reduce-motion' : ''} ${chatMode ? 'chat-mode' : ''}`}
    >
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => {
            setSection('overview');
            setChatMode(false);
          }}
          aria-label="Ir para a visão geral"
        >
          <span className="brand-mark">O</span>
          <span>
            <strong>ODEKRAI</strong>
            <small>PERSONAL AI COMPANION</small>
          </span>
        </button>
        <div className="profile-card">
          <div className="avatar-small">
            O<span className="online-dot" />
          </div>
          <div className="profile-copy">
            <strong>Seu espaço</strong>
            <span>Local neste dispositivo</span>
          </div>
          <span className="chevron">⌄</span>
        </div>
        <nav className="nav-list" aria-label="Navegação principal">
          {(['ESPAÇO DE TRABALHO', 'INTELIGÊNCIA', 'PERSONALIZAÇÃO'] as const).map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-heading">{group}</span>
              {nav
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    className={`nav-item ${section === item.id ? 'active' : ''}`}
                    key={item.id}
                    onClick={() => {
                      setSection(item.id);
                      setChatMode(false);
                    }}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                    {item.id === 'providers' && (
                      <span
                        className="nav-status"
                        aria-label={
                          keySavedForSession
                            ? 'Chave disponível nesta sessão'
                            : 'Chave não configurada'
                        }
                      />
                    )}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span>◉</span> Seus dados ficam no dispositivo
          </div>
          <button
            className="user-row"
            onClick={() => {
              setSection('settings');
              setChatMode(false);
            }}
          >
            <span className="user-avatar">O</span>
            <span>
              <strong>Seu perfil</strong>
              <small>Espaço pessoal</small>
            </span>
            <span className="more">•••</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>ODEKRAI</span>
            <b>/</b>
            <strong>{chatMode ? 'Nova conversa' : currentNav?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="connection">
              <i /> LOCAL
            </span>
            <button
              className="icon-button"
              aria-label="Ajuda"
              onClick={() => setToast('A documentação do projeto está em docs/.')}
            >
              ?
            </button>
            <button
              className="help-button"
              onClick={() => setToast('Central de ajuda ainda em desenvolvimento.')}
            >
              Ajuda
            </button>
          </div>
        </header>
        {chatMode || section === 'chat' ? (
          <ChatView
            messages={messages}
            busy={busy}
            draft={draft}
            setDraft={setDraft}
            error={error}
            submit={submitMessage}
            cancel={cancelRequest}
            providerName={settings.provider.name}
          />
        ) : (
          <div className="content-scroll">
            {section === 'overview' && (
              <Overview
                onChat={() => setChatMode(true)}
                onOpen={(target) => setSection(target)}
                provider={settings.provider}
                keyReady={keySavedForSession}
              />
            )}
            {section === 'providers' && (
              <Providers
                settings={settings}
                updateProvider={updateProvider}
                apiKey={apiKey}
                setApiKey={setApiKey}
                keySaved={keySavedForSession}
                setKeySaved={setKeySavedForSession}
                onChat={() => setChatMode(true)}
              />
            )}
            {section === 'companion' && (
              <Companion settings={settings} update={setSettings} onError={setToast} />
            )}
            {section === 'settings' && (
              <Settings settings={settings} update={(next) => setSettings(next)} />
            )}
          </div>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Overview({
  onChat,
  onOpen,
  provider,
  keyReady,
}: {
  onChat: () => void;
  onOpen: (section: Section) => void;
  provider: AppSettings['provider'];
  keyReady: boolean;
}) {
  const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date())
    .toLocaleUpperCase('pt-BR');
  return (
    <div className="page overview-page">
      <div className="welcome-row">
        <div>
          <span className="eyebrow">{today}</span>
          <h1>
            Seu espaço, <em>suas ideias.</em>
          </h1>
          <p>Um lugar para pensar, criar e conversar com a IA que você escolher.</p>
        </div>
        <div className="welcome-mark">
          <span>O</span>
          <i />
        </div>
      </div>
      <section className="hero-card">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-content">
          <span className="pill-label">
            <i /> ODEKRAI HUB
          </span>
          <h2>
            Uma mente curiosa.
            <br />
            <em>Seu jeito de fazer.</em>
          </h2>
          <p>
            Conecte seu provedor de IA e comece uma conversa. Sua chave fica apenas nesta sessão
            nesta versão inicial.
          </p>
          <button className="primary-button" onClick={onChat}>
            Iniciar conversa <span>↗</span>
          </button>
        </div>
        <div className="hero-glyph">
          <div className="glyph-halo" />
          <div className="glyph-core">O</div>
          <span className="spark spark-a">✦</span>
          <span className="spark spark-b">✧</span>
          <span className="spark spark-c">·</span>
        </div>
        <div className="hero-footer">
          <span>
            <i /> AMBIENTE LOCAL
          </span>
          <span>FEITO PARA ACOMPANHAR</span>
        </div>
      </section>
      <div className="section-title">
        <div>
          <span className="eyebrow">PONTO DE PARTIDA</span>
          <h3>Seu Odekrai</h3>
        </div>
        <button className="text-button" onClick={() => onOpen('settings')}>
          Personalizar <span>↗</span>
        </button>
      </div>
      <div className="cards-grid">
        <button className="feature-card provider-card" onClick={() => onOpen('providers')}>
          <div className="card-icon red-icon">✳</div>
          <div className="feature-copy">
            <span className="eyebrow">INTELIGÊNCIA</span>
            <h4>{keyReady ? 'Provedor conectado' : 'Escolha sua IA'}</h4>
            <p>
              {provider.name} <span className="dot-sep">·</span> {provider.model}
            </p>
          </div>
          <span className="card-arrow">↗</span>
          <div className="mini-meter">
            <i style={{ width: keyReady ? '86%' : '28%' }} />
          </div>
        </button>
        <button className="feature-card companion-card" onClick={() => onOpen('companion')}>
          <div className="card-icon neutral-icon">◇</div>
          <div className="feature-copy">
            <span className="eyebrow">COMPANION</span>
            <h4>Seu espaço de presença</h4>
            <p>Conheça o personagem e a ilha.</p>
          </div>
          <span className="card-arrow">↗</span>
          <div className="companion-doodle">O</div>
        </button>
      </div>
      <div className="privacy-note">
        <span>◈</span>
        <p>
          <strong>Privacidade desde o primeiro passo.</strong> Preferências são salvas localmente. O
          conteúdo da conversa é enviado apenas ao provedor que você configurar.
        </p>
        <button onClick={() => onOpen('settings')}>
          Saiba mais <span>↗</span>
        </button>
      </div>
      <div className="home-footer">
        <span>
          ODEKRAI <b>·</b> VERSÃO 0.1.0
        </span>
        <span>UM COMPANHEIRO PARA O SEU DIA A DIA</span>
      </div>
    </div>
  );
}

function Providers({
  settings,
  updateProvider,
  apiKey,
  setApiKey,
  keySaved,
  setKeySaved,
  onChat,
}: {
  settings: AppSettings;
  updateProvider: (field: keyof AppSettings['provider'], value: string) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  keySaved: boolean;
  setKeySaved: (value: boolean) => void;
  onChat: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  return (
    <div className="page subpage">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INTELIGÊNCIA</span>
          <h1>Provedores de IA</h1>
          <p>Conecte uma API compatível com o formato OpenAI Chat Completions.</p>
        </div>
        <span className="heading-symbol">✳</span>
      </div>
      <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <h3>Conexão principal</h3>
            <p>As mensagens são enviadas diretamente ao endereço escolhido.</p>
          </div>
          <span className={`state-chip ${keySaved ? 'connected' : ''}`}>
            <i />
            {keySaved ? 'PRONTO NESTA SESSÃO' : 'NÃO CONFIGURADO'}
          </span>
        </div>
        <label className="field-label">
          Nome do provedor
          <input
            value={settings.provider.name}
            onChange={(e) => updateProvider('name', e.target.value)}
            placeholder="Ex.: OpenAI"
          />
        </label>
        <label className="field-label">
          URL base da API
          <input
            value={settings.provider.baseUrl}
            onChange={(e) => updateProvider('baseUrl', e.target.value)}
            placeholder="https://api.openai.com/v1"
            spellCheck={false}
          />
        </label>
        <label className="field-label">
          Modelo
          <input
            value={settings.provider.model}
            onChange={(e) => updateProvider('model', e.target.value)}
            placeholder="gpt-4o-mini"
            spellCheck={false}
          />
        </label>
        <label className="field-label">
          Chave de API
          <div className="secret-input">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeySaved(Boolean(e.target.value));
              }}
              placeholder={keySaved ? 'Chave disponível nesta sessão' : 'Cole sua chave de API'}
              autoComplete="off"
            />
            <button type="button" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Ocultar' : 'Exibir'}
            </button>
          </div>
        </label>
        <div className="security-callout">
          <span>◇</span>
          <p>
            A chave permanece apenas na memória desta sessão e não é gravada no disco. Ao fechar o
            aplicativo, será necessário inseri-la novamente. O armazenamento seguro do sistema
            operacional ainda será integrado.
          </p>
        </div>
        <div className="panel-actions">
          <button
            className="secondary-button"
            onClick={() => {
              setApiKey('');
              setKeySaved(false);
            }}
          >
            Limpar chave
          </button>
          <button className="primary-button" onClick={onChat} disabled={!keySaved}>
            Testar em uma conversa <span>↗</span>
          </button>
        </div>
      </section>
      <div className="provider-footnote">
        <span>ⓘ</span>
        <p>
          Use apenas um provedor em que você confia. Verifique os termos, a política de retenção e
          os custos da API escolhida. O Odekrai não controla a disponibilidade nem as cobranças do
          provedor.
        </p>
      </div>
    </div>
  );
}

function Companion({
  settings,
  update,
  onError,
}: {
  settings: AppSettings;
  update: (settings: AppSettings) => void;
  onError: (message: string) => void;
}) {
  const [soundEvent, setSoundEvent] = useState<SoundEvent>('notification');
  async function applyPosition(next: AppSettings['companion']) {
    if (!isTauri() || !next.enabled) return;
    const width = 280 * next.size;
    const height = 150 * next.size;
    const right = next.position.endsWith('right');
    const bottom = next.position.startsWith('bottom');
    const x = next.coordinates?.x ?? (right ? Math.max(0, screen.availWidth - width - 28) : 28);
    const y = next.coordinates?.y ?? (bottom ? Math.max(0, screen.availHeight - height - 58) : 28);
    try {
      await invoke('set_island_position', { x, y, size: next.size });
    } catch {
      throw new Error('Não foi possível atualizar a posição da ilha.');
    }
  }
  async function setEnabled(enabled: boolean) {
    update({ ...settings, companion: { ...settings.companion, enabled } });
    if (!isTauri()) return;
    try {
      if (enabled) {
        await applyPosition({ ...settings.companion, enabled: true });
        await invoke('set_island_topmost', { enabled: settings.companion.alwaysOnTop });
        await invoke('set_island_visible', { visible: true });
        await emit('companion-state', { type: 'reveal' });
        void playSound('wake', normalizeSoundPreferences(settings.companion.sounds));
      } else {
        await invoke('set_island_visible', { visible: false });
        void playSound('sleep', normalizeSoundPreferences(settings.companion.sounds));
      }
    } catch {
      update({ ...settings, companion: { ...settings.companion, enabled: !enabled } });
      onError('Não foi possível alterar a janela do Companion.');
    }
  }
  async function setFreeMode(freeMode: boolean) {
    const companion = { ...settings.companion, freeMode };
    update({ ...settings, companion });
    if (!isTauri()) return;
    try {
      if (freeMode) {
        const x =
          companion.desktopCoordinates?.x ??
          Math.max(0, (screen.availWidth - 104 * companion.size) / 2);
        const y =
          companion.desktopCoordinates?.y ??
          Math.max(0, (screen.availHeight - 104 * companion.size) / 2);
        await invoke('set_character_position', { x, y, size: companion.size });
        await invoke('set_character_visible', { visible: true });
        void playSound('drag_start', normalizeSoundPreferences(companion.sounds));
      } else {
        await invoke('set_character_visible', { visible: false });
        void playSound('return_home', normalizeSoundPreferences(companion.sounds));
      }
    } catch {
      update({ ...settings, companion: { ...settings.companion, freeMode: !freeMode } });
      onError('Não foi possível mover o marcador entre as janelas.');
    }
  }
  return (
    <div className="page subpage">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PERSONALIZAÇÃO</span>
          <h1>ODEKRAI Companion</h1>
          <p>Uma presença leve para acompanhar você na área de trabalho.</p>
        </div>
        <span className="heading-symbol">◇</span>
      </div>
      <div className="companion-preview">
        <div className="preview-grid" />
        <div className="preview-island">
          <span className="island-light" />
          <div className="placeholder-mascot">O</div>
          <span className="island-label">
            ILHA ODEKRAI <i />
          </span>
        </div>
        <div className="preview-caption">
          <span className="eyebrow">PRÉVIA DO COMPANION</span>
          <strong>Um espaço próprio para estar por perto.</strong>
          <p>
            O personagem definitivo será criado pelo proprietário. Esta forma geométrica é apenas um
            marcador técnico.
          </p>
        </div>
      </div>
      <section className="settings-panel compact-panel">
        <div className="panel-heading">
          <div>
            <h3>Ilha na área de trabalho</h3>
            <p>
              Abre uma janela transparente do Companion. Posição expressa em um dos cantos da tela
              principal.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={settings.companion.enabled}
            className={`toggle ${settings.companion.enabled ? 'on' : ''}`}
            onClick={() => void setEnabled(!settings.companion.enabled)}
            aria-label="Ativar ilha do Companion"
            disabled={!isTauri()}
          >
            <span />
          </button>
        </div>
        <div className="preference-row">
          <div>
            <strong>Posição</strong>
            <span>Arraste a janela para personalizar; a posição é salva.</span>
          </div>
          <select
            value={settings.companion.position}
            onChange={(event) => {
              const companion = {
                ...settings.companion,
                position: event.target.value as AppSettings['companion']['position'],
                coordinates: null,
              };
              update({ ...settings, companion });
              void applyPosition(companion).catch(() =>
                onError('Não foi possível atualizar a posição da ilha.'),
              );
            }}
          >
            <option value="bottom-right">Inferior direita</option>
            <option value="bottom-left">Inferior esquerda</option>
            <option value="top-right">Superior direita</option>
            <option value="top-left">Superior esquerda</option>
          </select>
        </div>
        <div className="preference-row">
          <div>
            <strong>Modo livre do marcador</strong>
            <span>Permite arrastar o marcador geométrico em uma janela separada.</span>
          </div>
          <button
            role="switch"
            aria-checked={settings.companion.freeMode}
            className={`toggle ${settings.companion.freeMode ? 'on' : ''}`}
            onClick={() => void setFreeMode(!settings.companion.freeMode)}
            disabled={!isTauri()}
          >
            <span />
          </button>
        </div>
        <div className="preference-row">
          <div>
            <strong>Tamanho</strong>
            <span>{Math.round(settings.companion.size * 100)}% da escala-base.</span>
          </div>
          <input
            aria-label="Tamanho da ilha"
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value={settings.companion.size}
            onChange={(event) => {
              const companion = { ...settings.companion, size: Number(event.target.value) };
              update({ ...settings, companion });
              void applyPosition(companion).catch(() =>
                onError('Não foi possível atualizar o tamanho da ilha.'),
              );
            }}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Manter sobre outras janelas</strong>
            <span>Define a prioridade de exibição da ilha.</span>
          </div>
          <button
            role="switch"
            aria-checked={settings.companion.alwaysOnTop}
            className={`toggle ${settings.companion.alwaysOnTop ? 'on' : ''}`}
            onClick={() => {
              const enabled = !settings.companion.alwaysOnTop;
              update({ ...settings, companion: { ...settings.companion, alwaysOnTop: enabled } });
              if (isTauri()) void invoke('set_island_topmost', { enabled });
            }}
            disabled={!isTauri()}
          >
            <span />
          </button>
        </div>
        <div className="preference-row">
          <div>
            <strong>Abrir ao passar o mouse</strong>
            <span>Expande a ilha quando o ponteiro entra nela.</span>
          </div>
          <button
            role="switch"
            aria-checked={settings.companion.openOnHover}
            className={`toggle ${settings.companion.openOnHover ? 'on' : ''}`}
            onClick={() =>
              update({
                ...settings,
                companion: { ...settings.companion, openOnHover: !settings.companion.openOnHover },
              })
            }
            disabled={!isTauri()}
          >
            <span />
          </button>
        </div>
        <div className="preference-row">
          <div>
            <strong>Recolher após</strong>
            <span>Tempo sem interação enquanto expandida.</span>
          </div>
          <select
            value={settings.companion.collapseSeconds}
            onChange={(event) =>
              update({
                ...settings,
                companion: { ...settings.companion, collapseSeconds: Number(event.target.value) },
              })
            }
            disabled={!isTauri()}
          >
            <option value={8}>8 segundos</option>
            <option value={15}>15 segundos</option>
            <option value={30}>30 segundos</option>
            <option value={60}>1 minuto</option>
          </select>
        </div>
        <div className="preference-row">
          <div>
            <strong>Efeitos sonoros</strong>
            <span>Sem arquivos de áudio, a interface permanece silenciosa.</span>
          </div>
          <button
            role="switch"
            aria-checked={settings.companion.sounds.enabled}
            className={`toggle ${settings.companion.sounds.enabled ? 'on' : ''}`}
            onClick={() =>
              update({
                ...settings,
                companion: {
                  ...settings.companion,
                  sounds: {
                    ...settings.companion.sounds,
                    enabled: !settings.companion.sounds.enabled,
                  },
                },
              })
            }
          >
            <span />
          </button>
        </div>
        <div className="preference-row">
          <div>
            <strong>Volume</strong>
            <span>{Math.round(settings.companion.sounds.volume * 100)}%</span>
          </div>
          <input
            aria-label="Volume dos efeitos sonoros"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.companion.sounds.volume}
            onChange={(event) =>
              update({
                ...settings,
                companion: {
                  ...settings.companion,
                  sounds: { ...settings.companion.sounds, volume: Number(event.target.value) },
                },
              })
            }
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Substituir um efeito</strong>
            <span>Informe um arquivo local empacotado em public/sounds/.</span>
          </div>
          <div className="sound-replacement">
            <select
              aria-label="Efeito a substituir"
              value={soundEvent}
              onChange={(event) => setSoundEvent(event.target.value as SoundEvent)}
            >
              {SOUND_EVENTS.map((event) => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </select>
            <input
              aria-label="Caminho do arquivo de áudio"
              value={settings.companion.sounds.replacements[soundEvent] ?? ''}
              placeholder={`/sounds/${soundEvent}.wav`}
              onChange={(event) => {
                const path = event.target.value;
                update({
                  ...settings,
                  companion: {
                    ...settings.companion,
                    sounds: {
                      ...settings.companion.sounds,
                      replacements: {
                        ...settings.companion.sounds.replacements,
                        [soundEvent]: path,
                      },
                    },
                  },
                });
              }}
            />
          </div>
        </div>
      </section>
      <section className="settings-panel compact-panel">
        <div className="panel-heading">
          <div>
            <h3>Imagens e animações</h3>
            <p>
              A arquitetura está preparada para receber os assets oficiais quando estiverem
              disponíveis.
            </p>
          </div>
          <span className="state-chip">EM PREPARAÇÃO</span>
        </div>
        <div className="inline-link">
          Leia o guia de assets <span>↗</span>
        </div>
      </section>
    </div>
  );
}

function Settings({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (next: AppSettings) => void;
}) {
  return (
    <div className="page subpage">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PERSONALIZAÇÃO</span>
          <h1>Configurações</h1>
          <p>Ajuste a experiência do Odekrai neste dispositivo.</p>
        </div>
        <span className="heading-symbol">⚙</span>
      </div>
      <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <h3>Preferências gerais</h3>
            <p>Estas opções são armazenadas no navegador local do aplicativo.</p>
          </div>
          <span className="state-chip connected">
            <i /> SALVO LOCALMENTE
          </span>
        </div>
        <div className="preference-row">
          <div>
            <strong>Idioma da interface</strong>
            <span>Mais idiomas serão adicionados em uma próxima etapa.</span>
          </div>
          <select value="pt-BR" disabled aria-label="Idioma disponível">
            <option value="pt-BR">Português (Brasil)</option>
          </select>
        </div>
        <div className="preference-row">
          <div>
            <strong>Reduzir animações</strong>
            <span>Respeita a preferência de movimento reduzido.</span>
          </div>
          <button
            role="switch"
            aria-checked={settings.reduceMotion}
            className={`toggle ${settings.reduceMotion ? 'on' : ''}`}
            onClick={() => update({ ...settings, reduceMotion: !settings.reduceMotion })}
          >
            <span />
          </button>
        </div>
        <div className="preference-row">
          <div>
            <strong>Restaurar preferências</strong>
            <span>Voltar aos valores iniciais deste dispositivo.</span>
          </div>
          <button className="secondary-button small-button" onClick={() => update(defaultSettings)}>
            Restaurar
          </button>
        </div>
      </section>
      <div className="provider-footnote">
        <span>◈</span>
        <p>
          As preferências podem ser removidas limpando os dados locais do aplicativo. A chave de API
          não é incluída nelas.
        </p>
      </div>
    </div>
  );
}

function ChatView({
  messages,
  busy,
  draft,
  setDraft,
  error,
  submit,
  cancel,
  providerName,
}: {
  messages: ChatMessage[];
  busy: boolean;
  draft: string;
  setDraft: (value: string) => void;
  error: string;
  submit: (event: FormEvent) => void;
  cancel: () => void;
  providerName: string;
}) {
  return (
    <div className="chat-view">
      <div className="chat-header">
        <div>
          <span className="eyebrow">CONVERSA COM IA</span>
          <h2>Uma nova ideia começa aqui.</h2>
        </div>
        <span className="chat-provider">
          <i /> {providerName}
        </span>
      </div>
      <div className="messages-area">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-orb">O</div>
            <strong>O que você gostaria de explorar?</strong>
            <p>Escreva uma pergunta, uma ideia ou algo que queira organizar.</p>
            <div className="prompt-chips">
              <button onClick={() => setDraft('Ajude-me a organizar minhas prioridades de hoje.')}>
                Organizar meu dia <span>↗</span>
              </button>
              <button onClick={() => setDraft('Quero explorar uma ideia nova: ')}>
                Explorar uma ideia <span>↗</span>
              </button>
              <button onClick={() => setDraft('Explique de forma simples: ')}>
                Entender algo novo <span>↗</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${index}-${message.role}`}>
                <span className="message-avatar">{message.role === 'user' ? 'D' : 'O'}</span>
                <div>
                  <span className="message-role">
                    {message.role === 'user' ? 'VOCÊ' : 'ODEKRAI'}
                  </span>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
            {busy && (
              <div className="thinking-row">
                <span className="thinking-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>Odekrai está pensando</span>
              </div>
            )}
          </div>
        )}
      </div>
      {error && (
        <div className="chat-error" role="alert">
          <span>!</span>
          {error}
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Escreva sua mensagem..."
          rows={2}
          aria-label="Mensagem"
        />
        <div className="composer-bottom">
          <span>
            ENTER envia <b>·</b> SHIFT + ENTER quebra linha
          </span>
          <button
            className="send-button"
            type={busy ? 'button' : 'submit'}
            onClick={busy ? cancel : undefined}
            disabled={!busy && !draft.trim()}
            aria-label={busy ? 'Cancelar resposta' : 'Enviar mensagem'}
          >
            {busy ? '■' : '↑'}
          </button>
        </div>
      </form>
      <p className="chat-disclaimer">
        As respostas podem conter imprecisões. As mensagens são enviadas ao provedor configurado.
      </p>
    </div>
  );
}

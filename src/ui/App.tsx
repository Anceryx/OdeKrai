import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage } from '../core/provider-messages';
import {
  activeProviderSettings,
  defaultSettings,
  loadSettings,
  loadSettingsWithWarnings,
  saveSettings,
  type AppSettings,
  type ProviderSettings,
} from '../core/settings';
import { emit, listen } from '@tauri-apps/api/event';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import {
  normalizeSoundPreferences,
  playSound,
  SOUND_EVENTS,
  type SoundEvent,
} from '../core/sounds';
import {
  MASCOT_EXPRESSIONS,
  MASCOT_EXPRESSION_LABELS,
  MASCOT_MOTIONS,
  type MascotExpression,
  type MascotMotion,
} from '../core/mascot';
import { OdekraiMascot, type MascotMetrics, type MascotMotionRequest } from './OdekraiMascot';
import { AI_PROVIDERS, type AiProvider } from '../core/providers';
import { ProviderCatalog } from './ProviderCatalog';
import { AgentHome } from './AgentHome';
import { Profile, initials, type ProfileData } from './Profile';
import { ApprovalWindow, isApprovalWindow, SecurityCenter } from './SecurityCenter';

type Section =
  | 'overview'
  | 'chat'
  | 'providers'
  | 'companion'
  | 'settings'
  | 'permissions'
  | 'activity'
  | 'agent'
  | 'profile';
type Conversation = { id: string; title: string };

const nav: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'overview', label: 'Visão geral', icon: '⌂', group: 'ESPAÇO DE TRABALHO' },
  { id: 'chat', label: 'Conversas', icon: '◌', group: 'ESPAÇO DE TRABALHO' },
  { id: 'agent', label: 'Identidade e memória', icon: '◇', group: 'ESPAÇO DE TRABALHO' },
  { id: 'providers', label: 'Conectores de IA', icon: '✳', group: 'INTELIGÊNCIA' },
  { id: 'companion', label: 'Assistente do OdeKrai', icon: '◇', group: 'PERSONALIZAÇÃO' },
  { id: 'settings', label: 'Configurações', icon: '⚙', group: 'PERSONALIZAÇÃO' },
  { id: 'permissions', label: 'Permissões', icon: '⛨', group: 'PERSONALIZAÇÃO' },
  { id: 'activity', label: 'Atividade', icon: '≡', group: 'PERSONALIZAÇÃO' },
];

export function App() {
  return isApprovalWindow() ? <ApprovalWindow /> : <MainApp />;
}

function MainApp() {
  const [initialSettingsLoad] = useState(loadSettingsWithWarnings);
  const [section, setSection] = useState<Section>('overview');
  const [settings, setSettings] = useState<AppSettings>(initialSettingsLoad.settings);
  const [permissionIndicator, setPermissionIndicator] = useState<{
    mode: string;
    halted: boolean;
  } | null>(null);
  const [profile, setProfile] = useState<ProfileData>({
    displayName: '',
    nickname: '',
    avatarDataUrl: null,
  });
  const [keySavedForSession, setKeySavedForSession] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState(settings.activeProviderId);
  const activeProvider = activeProviderSettings(settings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(initialSettingsLoad.warnings.join(' '));
  const [chatMode, setChatMode] = useState(false);
  const request = useRef<string | null>(null);
  const companionStateTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isTauri()) return;
    const refreshPermissionIndicator = () => {
      void invoke<{ mode: string; halted: boolean }>('get_permission_settings')
        .then(setPermissionIndicator)
        .catch(() => setPermissionIndicator(null));
    };
    refreshPermissionIndicator();
    let unlisten: (() => void)[] = [];
    void Promise.all([
      listen('security-halted', () => {
        setToast('O OdeKrai foi parado. Ações e respostas em andamento foram canceladas.');
        refreshPermissionIndicator();
      }),
      listen('security-resumed', () => {
        setToast('O OdeKrai foi retomado.');
        refreshPermissionIndicator();
      }),
      listen('permission-settings-updated', refreshPermissionIndicator),
      listen<string>('security-error', ({ payload }) => setToast(payload)),
    ]).then((off) => {
      unlisten = off;
    });
    return () => unlisten.forEach((off) => off());
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<ProfileData>('get_profile')
      .then(setProfile)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<{ configured: boolean }>('agent_home_status')
      .then((home) => {
        if (!home.configured) setSection('agent');
      })
      .catch(() => setError('Não foi possível verificar a pasta do agente.'));
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<Conversation[]>('list_conversations')
      .then((items) => {
        setConversations(items);
        if (items[0]) {
          setConversationId(items[0].id);
          void invoke<ChatMessage[]>('load_conversation', { conversationId: items[0].id })
            .then(setMessages)
            .catch(() => setError('Não foi possível abrir a conversa anterior.'));
        }
      })
      .catch(() => setError('Não foi possível abrir o histórico local.'));
  }, []);
  useEffect(() => {
    const provider = AI_PROVIDERS.find((item) => item.id === settings.activeProviderId);
    if (!provider || !isTauri()) {
      setKeySavedForSession(false);
      return;
    }
    void invoke<boolean>('has_provider_credential', { providerId: provider.id })
      .then(setKeySavedForSession)
      .catch(() => setKeySavedForSession(false));
  }, [settings.activeProviderId]);
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
      .catch(() => setToast('Não foi possível restaurar a ilha do assistente.'));
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
      .catch(() => setToast('Não foi possível restaurar o OdeKrai no desktop.'));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(
    () => () => {
      if (request.current) void invoke('cancel_provider_request', { requestId: request.current });
      window.clearTimeout(companionStateTimer.current);
    },
    [],
  );

  const currentNav = useMemo(() => nav.find((item) => item.id === section), [section]);

  function selectProvider(provider: AiProvider) {
    if (provider.id !== selectedProviderId) {
      setKeySavedForSession(false);
    }
    setSelectedProviderId(provider.id);
    setSettings((current) => ({ ...current, activeProviderId: provider.id }));
  }

  function beginChat() {
    if (!keySavedForSession || !isTauri()) {
      setSection('providers');
      setChatMode(false);
      return;
    }
    setChatMode(true);
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (!keySavedForSession || !isTauri()) {
      setError('Configure uma credencial no Gerenciador de Credenciais do Windows.');
      setChatMode(false);
      setSection('providers');
      return;
    }
    const activeId = conversationId ?? crypto.randomUUID();
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
    const requestId = crypto.randomUUID();
    request.current = requestId;
    try {
      const provider = AI_PROVIDERS.find((item) => item.id === settings.activeProviderId);
      if (!provider) throw new Error('O provedor selecionado não possui adaptador conhecido.');
      await invoke('append_conversation_message', {
        conversationId: activeId,
        role: 'user',
        content: text,
      });
      setConversationId(activeId);
      if (!conversationId)
        setConversations((items) => [{ id: activeId, title: text.slice(0, 80) }, ...items]);
      const onChunk = new Channel<string>();
      let streamed = '';
      onChunk.onmessage = (chunk) => {
        streamed += chunk;
        setMessages([...next, { role: 'assistant', content: streamed }]);
      };
      const answer = await invoke<{ content: string; citations: { title: string; url: string }[] }>(
        'stream_provider_message',
        {
          providerId: provider.id,
          baseUrl: activeProvider.baseUrl,
          model: activeProvider.model,
          messages: next,
          requestId,
          onChunk,
        },
      );
      await invoke('append_conversation_message', {
        conversationId: activeId,
        role: 'assistant',
        content: answer.content,
      });
      setMessages([
        ...next,
        { role: 'assistant', content: answer.content, citations: answer.citations },
      ]);
      void playSound('success', normalizeSoundPreferences(settings.companion.sounds));
      window.clearTimeout(companionStateTimer.current);
      if (isTauri()) {
        void emit('companion-state', {
          type: 'activity',
          state: 'responding',
          message: 'Resposta pronta',
        });
        companionStateTimer.current = window.setTimeout(
          () =>
            void emit('companion-state', {
              type: 'activity',
              state: 'completed',
              message: 'Resposta recebida',
            }),
          1100,
        );
      }
    } catch (cause) {
      if (!(typeof cause === 'string' && cause.includes('cancelada'))) {
        setMessages(next);
        setError(
          typeof cause === 'string'
            ? cause
            : cause instanceof Error
              ? cause.message
              : 'Não foi possível concluir a solicitação.',
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
    if (request.current) void invoke('cancel_provider_request', { requestId: request.current });
  }

  async function deleteConversation(id: string) {
    if (busy || !window.confirm('Apagar esta conversa e suas mensagens?')) return;
    try {
      await invoke('delete_conversation', { conversationId: id });
      setConversations((items) => items.filter((item) => item.id !== id));
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch {
      setError('Não foi possível apagar a conversa.');
    }
  }

  async function deleteAllConversations() {
    if (
      busy ||
      !window.confirm('Apagar todo o histórico de conversas? Esta ação não pode ser desfeita.')
    )
      return;
    try {
      await invoke('delete_all_conversations');
      setConversations([]);
      setConversationId(null);
      setMessages([]);
    } catch {
      setError('Não foi possível apagar o histórico.');
    }
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
            <strong>OdeKrai</strong>
          </span>
        </button>
        <button
          className="profile-card"
          onClick={() => {
            setSection('profile');
            setChatMode(false);
          }}
        >
          <div className="avatar-small">
            {profile.avatarDataUrl ? (
              <img src={profile.avatarDataUrl} alt="" />
            ) : (
              initials(profile.displayName)
            )}
            <span className="online-dot" />
          </div>
          <div className="profile-copy">
            <strong>{profile.displayName || 'Seu perfil'}</strong>
            <span>{profile.nickname || 'Local neste dispositivo'}</span>
          </div>
        </button>
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
            <span>◉</span> Dados locais neste dispositivo
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
            <span>OdeKrai</span>
            <b>/</b>
            <strong>{chatMode ? 'Nova conversa' : currentNav?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="connection">
              <i /> LOCAL
            </span>
            {permissionIndicator?.halted && (
              <button
                className="security-state halted"
                onClick={() => {
                  setSection('permissions');
                  setChatMode(false);
                }}
              >
                PARADO · PERMISSÕES
              </button>
            )}
            {!permissionIndicator?.halted && permissionIndicator?.mode === 'controle_total' && (
              <button
                className="security-state total"
                onClick={() => {
                  setSection('permissions');
                  setChatMode(false);
                }}
              >
                CONTROLE TOTAL
              </button>
            )}
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
            conversations={conversations}
            conversationId={conversationId}
            onConversation={(id) => {
              if (busy) return;
              setConversationId(id);
              void invoke<ChatMessage[]>('load_conversation', { conversationId: id })
                .then(setMessages)
                .catch(() => setError('Não foi possível abrir a conversa.'));
            }}
            onNewConversation={() => {
              if (!busy) {
                setConversationId(null);
                setMessages([]);
                setError('');
              }
            }}
            onDeleteConversation={(id) => void deleteConversation(id)}
            onDeleteAll={() => void deleteAllConversations()}
            busy={busy}
            draft={draft}
            setDraft={setDraft}
            error={error}
            submit={submitMessage}
            cancel={cancelRequest}
            providerName={activeProvider.name}
            profile={profile}
          />
        ) : (
          <div className="content-scroll">
            {section === 'overview' && (
              <Overview
                onChat={beginChat}
                onOpen={(target) => setSection(target)}
                provider={activeProvider}
                keyReady={keySavedForSession}
                profile={profile}
              />
            )}
            {section === 'providers' && (
              <ProviderCatalog
                settings={settings}
                keySaved={keySavedForSession}
                selectedId={selectedProviderId}
                onSelect={selectProvider}
                onSave={(provider) => {
                  setSettings((current) => ({
                    ...current,
                    activeProviderId: provider.providerId,
                    providers: { ...current.providers, [provider.providerId]: provider },
                  }));
                  setKeySavedForSession(true);
                }}
                onChat={beginChat}
                onCredentialRemoved={() => setKeySavedForSession(false)}
              />
            )}
            {section === 'companion' && (
              <Companion settings={settings} update={setSettings} onError={setToast} />
            )}
            {section === 'settings' && (
              <Settings settings={settings} update={(next) => setSettings(next)} />
            )}
            {section === 'permissions' && <SecurityCenter page="permissions" />}
            {section === 'activity' && <SecurityCenter page="activity" />}
            {section === 'agent' && (
              <AgentHome initialName={profile.displayName} initialNickname={profile.nickname} />
            )}
            {section === 'profile' && <Profile value={profile} onChange={setProfile} />}
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
  profile,
}: {
  onChat: () => void;
  onOpen: (section: Section) => void;
  provider: ProviderSettings;
  keyReady: boolean;
  profile: ProfileData;
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
            {profile.displayName ? `Olá, ${profile.displayName}.` : 'Seu espaço,'}{' '}
            <em>suas ideias.</em>
          </h1>
          <p>Um lugar para pensar, criar e conversar com a IA que você escolher.</p>
        </div>
        <div className="welcome-mark">
          {profile.avatarDataUrl ? (
            <img src={profile.avatarDataUrl} alt="Avatar do perfil" />
          ) : (
            <span>{initials(profile.displayName)}</span>
          )}
          <i />
        </div>
      </div>
      <section className="hero-card">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-content">
          <span className="pill-label">
            <i /> OdeKrai
          </span>
          <h2>
            Uma mente curiosa.
            <br />
            <em>Seu jeito de fazer.</em>
          </h2>
          <p>
            Conecte seu provedor de IA e comece uma conversa. Sua chave fica no Gerenciador de
            Credenciais do Windows.
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
          <h3>Conheça o OdeKrai</h3>
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
            <h4>{keyReady ? 'Provedor configurado' : 'Escolha sua IA'}</h4>
            <p>
              {keyReady
                ? `${provider.name} · ${provider.model}`
                : 'Conecte uma IA para habilitar conversas.'}
            </p>
          </div>
          <span className="card-arrow">↗</span>
        </button>
        <button className="feature-card companion-card" onClick={() => onOpen('companion')}>
          <div className="card-icon neutral-icon">◇</div>
          <div className="feature-copy">
            <span className="eyebrow">COMPANION</span>
            <h4>Seu espaço de presença</h4>
            <p>Conheça o OdeKrai e configure sua ilha.</p>
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
          OdeKrai <b>·</b> VERSÃO 0.1.0
        </span>
        <span>UM COMPANHEIRO PARA O SEU DIA A DIA</span>
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
  const [previewExpression, setPreviewExpression] = useState<MascotExpression>('happy');
  const [previewMotion, setPreviewMotion] = useState<MascotMotionRequest>();
  const [previewMetrics, setPreviewMetrics] = useState<MascotMetrics>({
    fps: 0,
    triangles: 0,
    drawCalls: 0,
  });
  const [previewAnimations, setPreviewAnimations] = useState(true);
  const [previewLight, setPreviewLight] = useState(1);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const [previewCamera, setPreviewCamera] = useState({ yaw: 0, pitch: 0, zoom: 1 });
  const previewMotionId = useRef(0);
  function triggerPreviewMotion(type: MascotMotion) {
    setPreviewMotion({ type, startedAt: performance.now(), id: ++previewMotionId.current });
  }
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
      onError('Não foi possível alterar a janela do assistente.');
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
      onError('Não foi possível mover o OdeKrai entre as janelas.');
    }
  }
  return (
    <div className="page subpage">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PERSONALIZAÇÃO</span>
          <h1>Assistente do OdeKrai</h1>
          <p>Uma presença leve para acompanhar você na área de trabalho.</p>
        </div>
        <span className="heading-symbol">◇</span>
      </div>
      <div className="companion-preview">
        <div className="preview-grid" />
        <div className="preview-island">
          <span className="island-light" />
          <OdekraiMascot
            className="preview-mascot"
            expression={previewExpression}
            reduceMotion={settings.reduceMotion}
            motionRequest={previewMotion}
            animationsEnabled={previewAnimations}
            lightIntensity={previewLight}
            modelScale={previewScale}
            modelOffset={previewOffset}
            cameraYaw={previewCamera.yaw}
            cameraPitch={previewCamera.pitch}
            cameraZoom={previewCamera.zoom}
            onMetrics={setPreviewMetrics}
          />
          <span className="island-label">
            ILHA OdeKrai <i />
          </span>
        </div>
        <div className="preview-caption">
          <span className="eyebrow">ILHA DO OdeKrai</span>
          <strong>{MASCOT_EXPRESSION_LABELS[previewExpression]}</strong>
          <p>OdeKrai pronto para acompanhar sua área de trabalho.</p>
        </div>
      </div>
      <details className="mascot-preview-tools">
        <summary>Ajustes avançados da prévia</summary>
        <div className="mascot-preview-notice">
          Estes ajustes afetam somente a prévia desta tela. As configurações da ilha ficam abaixo.
        </div>
        <div className="mascot-preview-controls">
          <label className="mascot-expression-control">
            <span>Expressão facial</span>
            <select
              value={previewExpression}
              onChange={(event) => setPreviewExpression(event.target.value as MascotExpression)}
            >
              {MASCOT_EXPRESSIONS.map((expression) => (
                <option key={expression} value={expression}>
                  {MASCOT_EXPRESSION_LABELS[expression]}
                </option>
              ))}
            </select>
          </label>
          <label className="mascot-animation-toggle">
            <input
              type="checkbox"
              checked={previewAnimations}
              onChange={(event) => setPreviewAnimations(event.target.checked)}
            />
            Ativar movimentos
          </label>
          <div className="mascot-motion-tools">
            <strong>Testar movimento</strong>
            <div>
              {MASCOT_MOTIONS.map((motion) => (
                <button key={motion.id} onClick={() => triggerPreviewMotion(motion.id)}>
                  {motion.label}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span>Iluminação: {previewLight.toFixed(1)}×</span>
            <input
              type="range"
              min="0.4"
              max="1.6"
              step="0.05"
              value={previewLight}
              onChange={(event) => setPreviewLight(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Escala: {Math.round(previewScale * 100)}%</span>
            <input
              type="range"
              min="0.75"
              max="1.25"
              step="0.05"
              value={previewScale}
              onChange={(event) => setPreviewScale(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Posição horizontal: {previewOffset.x.toFixed(2)}</span>
            <input
              type="range"
              min="-0.45"
              max="0.45"
              step="0.03"
              value={previewOffset.x}
              onChange={(event) =>
                setPreviewOffset((current) => ({ ...current, x: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            <span>Posição vertical: {previewOffset.y.toFixed(2)}</span>
            <input
              type="range"
              min="-0.45"
              max="0.45"
              step="0.03"
              value={previewOffset.y}
              onChange={(event) =>
                setPreviewOffset((current) => ({ ...current, y: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            <span>Órbita horizontal: {previewCamera.yaw}°</span>
            <input
              type="range"
              min="-35"
              max="35"
              step="1"
              value={previewCamera.yaw}
              onChange={(event) =>
                setPreviewCamera((current) => ({ ...current, yaw: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            <span>Órbita vertical: {previewCamera.pitch}°</span>
            <input
              type="range"
              min="-18"
              max="18"
              step="1"
              value={previewCamera.pitch}
              onChange={(event) =>
                setPreviewCamera((current) => ({ ...current, pitch: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            <span>Zoom: {previewCamera.zoom.toFixed(2)}×</span>
            <input
              type="range"
              min="0.8"
              max="1.3"
              step="0.05"
              value={previewCamera.zoom}
              onChange={(event) =>
                setPreviewCamera((current) => ({ ...current, zoom: Number(event.target.value) }))
              }
            />
          </label>
          <div className="mascot-preview-metrics" aria-live="polite">
            <strong>Renderização</strong>
            <span>{previewMetrics.fps} FPS</span>
            <span>{previewMetrics.triangles.toLocaleString('pt-BR')} triângulos</span>
            <span>{previewMetrics.drawCalls} chamadas</span>
          </div>
        </div>
      </details>
      <section className="settings-panel compact-panel">
        <div className="panel-heading">
          <div>
            <h3>Ilha na área de trabalho</h3>
            <p>
              Abre uma janela transparente do assistente. A posição pode ficar em qualquer canto da
              tela principal.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={settings.companion.enabled}
            className={`toggle ${settings.companion.enabled ? 'on' : ''}`}
            onClick={() => void setEnabled(!settings.companion.enabled)}
            aria-label="Ativar ilha do assistente"
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
            <strong>Modo livre do OdeKrai</strong>
            <span>Permite mover o OdeKrai em uma janela separada.</span>
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
            <h3>Modelo 3D e expressões</h3>
            <p>
              O modelo oficial é um asset local e não é incluído automaticamente em publicações do
              código-fonte.
            </p>
          </div>
          <span className="state-chip connected">ATIVO NESTE CHECKOUT</span>
        </div>
        <div className="inline-link">
          Leia o guia de assets e direitos <span>↗</span>
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
          <p>Ajuste a experiência do OdeKrai neste dispositivo.</p>
        </div>
        <span className="heading-symbol">⚙</span>
      </div>
      <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <h3>Preferências gerais</h3>
            <p>
              Preferências de aparência ficam no armazenamento local do aplicativo. Perfil e
              histórico são salvos no banco SQLite local; credenciais ficam no Gerenciador do
              Windows.
            </p>
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
  conversations,
  conversationId,
  onConversation,
  onNewConversation,
  onDeleteConversation,
  onDeleteAll,
  busy,
  draft,
  setDraft,
  error,
  submit,
  cancel,
  providerName,
  profile,
}: {
  messages: ChatMessage[];
  conversations: Conversation[];
  conversationId: string | null;
  onConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onDeleteAll: () => void;
  busy: boolean;
  draft: string;
  setDraft: (value: string) => void;
  error: string;
  submit: (event: FormEvent) => void;
  cancel: () => void;
  providerName: string;
  profile: ProfileData;
}) {
  return (
    <div className="chat-view">
      <div className="chat-header">
        <div>
          <span className="eyebrow">CONVERSA COM IA</span>
          <h2>Uma nova ideia começa aqui.</h2>
        </div>
        <span className="chat-provider">
          <i /> Provedor selecionado: {providerName}
        </span>
      </div>
      <div className="chat-history" aria-label="Histórico de conversas">
        <button type="button" onClick={onNewConversation} disabled={busy}>
          Nova conversa
        </button>
        {conversations.map((item) => (
          <span key={item.id}>
            <button
              type="button"
              onClick={() => onConversation(item.id)}
              disabled={busy}
              aria-current={conversationId === item.id ? 'page' : undefined}
            >
              {item.title}
            </button>
            <button
              type="button"
              onClick={() => onDeleteConversation(item.id)}
              disabled={busy}
              aria-label={`Apagar conversa ${item.title}`}
            >
              Apagar
            </button>
          </span>
        ))}
        {conversations.length > 0 && (
          <button type="button" onClick={onDeleteAll} disabled={busy}>
            Apagar todo o histórico
          </button>
        )}
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
                <span className="message-avatar">
                  {message.role === 'user' && profile.avatarDataUrl ? (
                    <img src={profile.avatarDataUrl} alt="" />
                  ) : message.role === 'user' ? (
                    initials(profile.displayName)
                  ) : (
                    'O'
                  )}
                </span>
                <div>
                  <span className="message-role">
                    {message.role === 'user' ? profile.displayName || 'Você' : 'OdeKrai'}
                  </span>
                  <p>{message.content}</p>
                  {message.citations?.length ? (
                    <div className="message-citations">
                      {message.citations.map((citation) => (
                        <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">
                          {citation.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
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
                <span>OdeKrai está pensando</span>
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

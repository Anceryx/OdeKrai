import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage } from '../core/provider-messages';
import {
  filterConversations,
  presentMessages,
  resolveConversationSelection,
  type ConversationSummary,
} from '../core/chat';
import { safeMarkdownUrl } from '../core/markdown';
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
import { AI_PROVIDERS, type AiProvider } from '../core/providers';
import { ProviderCatalog } from './ProviderCatalog';
import { AgentHome } from './AgentHome';
import { initials, type ProfileData } from './Profile';
import { ApprovalWindow, isApprovalWindow, SecurityCenter } from './SecurityCenter';
import { Button, PageHeader, Toggle } from './DesignSystem';
import { DEFAULT_PET_ID, PETS, PET_ANIMATION_LABELS, type PetAnimationState } from '../core/pets';
import { PetSprite } from './PetSprite';
import appIcon from '../assets/odekrai-app-icon.png';
import { MessageMarkdown } from './MessageMarkdown';
import { HistoryDeletionSettings } from './HistoryDeletionSettings';
import { Icon, type IconName } from './Icon';
import { setPrimaryProviderSettings, toggleProviderSettings } from '../core/provider-directory';
import { profileFromApprovedCore } from '../core/identity';

type Section =
  | 'overview'
  | 'chat'
  | 'providers'
  | 'companion'
  | 'settings'
  | 'permissions'
  | 'activity'
  | 'agent';
type Conversation = ConversationSummary;

const nav: { id: Section; label: string; icon: IconName; group: string }[] = [
  { id: 'overview', label: 'Visão geral', icon: 'home', group: 'ESPAÇO DE TRABALHO' },
  { id: 'chat', label: 'Conversas', icon: 'chat', group: 'ESPAÇO DE TRABALHO' },
  { id: 'agent', label: 'Identidade e memória', icon: 'memory', group: 'ESPAÇO DE TRABALHO' },
  { id: 'providers', label: 'Conectores de IA', icon: 'connectors', group: 'INTELIGÊNCIA' },
  { id: 'companion', label: 'Assistente do OdeKrai', icon: 'pet', group: 'PERSONALIZAÇÃO' },
  { id: 'settings', label: 'Configurações', icon: 'settings', group: 'PERSONALIZAÇÃO' },
  { id: 'permissions', label: 'Permissões', icon: 'shield', group: 'PERSONALIZAÇÃO' },
  { id: 'activity', label: 'Atividade', icon: 'activity', group: 'PERSONALIZAÇÃO' },
];

export function App() {
  return isApprovalWindow() ? <ApprovalWindow /> : <MainApp />;
}

function MainApp() {
  const [initialSettingsLoad] = useState(loadSettingsWithWarnings);
  const [section, setSection] = useState<Section>('overview');
  const [settings, setSettings] = useState<AppSettings>(initialSettingsLoad.settings);
  const [identityConfigured, setIdentityConfigured] = useState<boolean | null>(null);
  const [identityCardDismissed, setIdentityCardDismissed] = useState(false);
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
  const [selectedPet, setSelectedPet] = useState(DEFAULT_PET_ID);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastFailedPrompt, setLastFailedPrompt] = useState('');
  const [toast, setToast] = useState(initialSettingsLoad.warnings.join(' '));
  const [chatMode, setChatMode] = useState(false);
  const request = useRef<string | null>(null);
  const companionStateTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<string>('get_selected_pet')
      .then(setSelectedPet)
      .catch(() => undefined);
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

  async function choosePet(petId: string) {
    if (!PETS.some((pet) => pet.id === petId)) return;
    try {
      await invoke('set_selected_pet', { petId });
      setSelectedPet(petId);
      await emit('selected-pet-updated', petId);
    } catch {
      setToast('Não foi possível salvar o personagem selecionado.');
    }
  }

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    if (!isTauri()) return;
    void invoke('set_close_behavior', {
      minimizeToTray: settings.closeBehavior === 'minimize_to_tray',
    }).catch(() => setToast('Não foi possível atualizar o comportamento ao fechar.'));
  }, [settings.closeBehavior]);
  useEffect(() => {
    if (!isTauri()) return;
    let current = true;
    void (async () => {
      const [savedProfile, home] = await Promise.allSettled([
        invoke<ProfileData>('get_profile'),
        invoke<{ configured: boolean }>('agent_home_status'),
      ]);
      if (!current) return;
      const stored = savedProfile.status === 'fulfilled' ? savedProfile.value : null;
      if (stored) setProfile(stored);
      else setToast('Não foi possível ler o perfil local.');
      if (home.status === 'rejected') {
        setToast('Não foi possível verificar a pasta do OdeKrai.');
        return;
      }
      setIdentityConfigured(home.value.configured);
      if (home.value.configured && !stored?.displayName) {
        try {
          const document = await invoke<{ approved_content: string }>('agent_home_read_core');
          if (!current) return;
          const recovered = profileFromApprovedCore(document.approved_content);
          if (recovered) {
            setProfile((profile) => ({ ...profile, ...recovered }));
            setToast('Perfil recuperado do arquivo base aprovado.');
          }
        } catch {
          if (current) setToast('Não foi possível recuperar o perfil do arquivo base.');
        }
      }
    })();
    return () => {
      current = false;
    };
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
      .catch(() => setToast('Não foi possível restaurar o pet do assistente.'));
  }, []);
  useEffect(() => {
    const companion = settings.companion;
    if (!isTauri() || !companion.freeMode) return;
    const x =
      companion.desktopCoordinates?.x ??
      Math.max(0, (screen.availWidth - 176 * companion.size) / 2);
    const y =
      companion.desktopCoordinates?.y ??
      Math.max(0, (screen.availHeight - 176 * companion.size) / 2);
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
    setSelectedProviderId(provider.id);
  }

  function setPrimaryProvider(providerId: string) {
    setSettings((current) => setPrimaryProviderSettings(current, providerId));
    setSelectedProviderId(providerId);
  }

  function setProviderEnabled(providerId: string, enabled: boolean) {
    setSettings((current) => toggleProviderSettings(current, providerId, enabled));
    if (!enabled && settings.activeProviderId === providerId) setKeySavedForSession(false);
  }

  function beginChat() {
    if (!keySavedForSession || !isTauri()) {
      setSection('providers');
      setChatMode(false);
      return;
    }
    setChatMode(true);
  }

  async function sendMessage(rawText: string, reuseLastUserMessage = false) {
    const text = rawText.trim();
    if (!text || busy) return;
    if (!keySavedForSession || !isTauri()) {
      setError('Configure um provedor de IA em Conectores para enviar mensagens.');
      setLastFailedPrompt('');
      return;
    }
    const activeId = conversationId ?? crypto.randomUUID();
    const sentAt = Math.floor(Date.now() / 1000);
    const next = reuseLastUserMessage
      ? messages
      : [...messages, { role: 'user' as const, content: text, created_at: sentAt }];
    setMessages(next);
    setDraft('');
    setError('');
    setLastFailedPrompt('');
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
      if (!reuseLastUserMessage) {
        await invoke('append_conversation_message', {
          conversationId: activeId,
          role: 'user',
          content: text,
        });
        setConversations((items) =>
          items.map((item) => (item.id === activeId ? { ...item, preview: text } : item)),
        );
      }
      setConversationId(activeId);
      if (!conversationId)
        setConversations((items) => [
          {
            id: activeId,
            title: text.slice(0, 80),
            preview: text,
            created_at: sentAt,
          },
          ...items,
        ]);
      const onChunk = new Channel<string>();
      let streamed = '';
      onChunk.onmessage = (chunk) => {
        streamed += chunk;
        setMessages([
          ...next,
          { role: 'assistant', content: streamed, created_at: Math.floor(Date.now() / 1000) },
        ]);
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
      setConversations((items) =>
        items.map((item) => (item.id === activeId ? { ...item, preview: answer.content } : item)),
      );
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: answer.content,
          citations: answer.citations,
          created_at: Math.floor(Date.now() / 1000),
        },
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
        setLastFailedPrompt(text);
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
      } else {
        setMessages(next);
      }
    } finally {
      setBusy(false);
      request.current = null;
    }
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    void sendMessage(draft);
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

  async function deleteAllConversations(): Promise<boolean> {
    if (busy) {
      setToast('Aguarde a conclusão da resposta antes de apagar o histórico.');
      return false;
    }
    try {
      await invoke('delete_all_conversations');
      setConversations([]);
      setConversationId(null);
      setMessages([]);
      setDraft('');
      setError('');
      setLastFailedPrompt('');
      setToast('Todo o histórico foi apagado.');
      return true;
    } catch {
      setToast('Não foi possível apagar o histórico.');
      return false;
    }
  }

  async function renameConversation(id: string, rawTitle: string) {
    const title = rawTitle.trim();
    if (!title || title.length > 120) return;
    try {
      await invoke('rename_conversation', { conversationId: id, title });
      setConversations((items) =>
        items.map((item) => (item.id === id ? { ...item, title } : item)),
      );
    } catch {
      setToast('Não foi possível renomear a conversa.');
    }
  }

  return (
    <div
      className={`app-shell ${settings.reduceMotion ? 'reduce-motion' : ''} ${chatMode ? 'chat-mode' : ''}`}
    >
      <aside className="sidebar">
        <button
          className="profile-card"
          onClick={() => {
            setSection('agent');
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
                    <span className="nav-icon">
                      <Icon name={item.icon} size={20} />
                    </span>
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
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>OdeKrai</span>
            <b>/</b>
            <strong>
              {chatMode
                ? (conversations.find((item) => item.id === conversationId)?.title ??
                  'Nova conversa')
                : currentNav?.label}
            </strong>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="provider-chip"
              onClick={() => {
                setSection('providers');
                setChatMode(false);
              }}
              aria-label="Abrir conectores de IA"
            >
              {keySavedForSession
                ? `${activeProvider.name}${activeProvider.model ? ` · ${activeProvider.model}` : ''}`
                : 'Sem provedor'}
            </button>
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
              const selectedId = resolveConversationSelection(conversations, id);
              if (!selectedId) return;
              setConversationId(selectedId);
              setError('');
              void invoke<ChatMessage[]>('load_conversation', { conversationId: selectedId })
                .then((loaded) => setMessages(loaded))
                .catch(() => setError('Não foi possível abrir a conversa.'));
            }}
            onNewConversation={() => {
              if (!busy) {
                setConversationId(null);
                setMessages([]);
                setError('');
                setLastFailedPrompt('');
              }
            }}
            onDeleteConversation={(id) => void deleteConversation(id)}
            onRenameConversation={(id, title) => void renameConversation(id, title)}
            busy={busy}
            draft={draft}
            setDraft={setDraft}
            error={error}
            submit={submitMessage}
            cancel={cancelRequest}
            providerName={activeProvider.name}
            providerModel={activeProvider.model}
            providerConfigured={keySavedForSession}
            assistantUsesMascot={settings.useMascotAsAssistantAvatar}
            onFixConfiguration={() => {
              setSection('providers');
              setChatMode(false);
            }}
            onRetry={() => void sendMessage(lastFailedPrompt, true)}
            canRetry={Boolean(lastFailedPrompt)}
            profile={profile}
            selectedPet={selectedPet}
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
                selectedPet={selectedPet}
                needsIdentity={identityConfigured === false && !identityCardDismissed}
                onConfigureIdentity={() => setSection('agent')}
                onDismissIdentity={() => setIdentityCardDismissed(true)}
              />
            )}
            {section === 'providers' && (
              <ProviderCatalog
                settings={settings}
                keySaved={keySavedForSession}
                selectedId={selectedProviderId}
                onSelect={selectProvider}
                onSetPrimary={setPrimaryProvider}
                onToggleEnabled={setProviderEnabled}
                onSave={(provider) => {
                  setSettings((current) => ({
                    ...current,
                    providers: { ...current.providers, [provider.providerId]: provider },
                  }));
                  if (provider.providerId === settings.activeProviderId)
                    setKeySavedForSession(true);
                }}
                onChat={beginChat}
                onCredentialRemoved={(providerId) => {
                  if (settings.activeProviderId === providerId) {
                    setSettings((current) => ({ ...current, activeProviderId: '' }));
                    setKeySavedForSession(false);
                  }
                }}
              />
            )}
            {section === 'companion' && (
              <Companion
                settings={settings}
                update={setSettings}
                onError={setToast}
                selectedPet={selectedPet}
                onSelectPet={(petId) => void choosePet(petId)}
              />
            )}
            {section === 'settings' && (
              <Settings
                settings={settings}
                update={setSettings}
                onDeleteAllHistory={deleteAllConversations}
              />
            )}
            {section === 'permissions' && <SecurityCenter page="permissions" />}
            {section === 'activity' && <SecurityCenter page="activity" />}
            {section === 'agent' && (
              <AgentHome
                initialName={profile.displayName}
                initialNickname={profile.nickname}
                profileValue={profile}
                onProfileChange={setProfile}
              />
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
  profile,
  selectedPet,
  needsIdentity,
  onConfigureIdentity,
  onDismissIdentity,
}: {
  onChat: () => void;
  onOpen: (section: Section) => void;
  provider: ProviderSettings;
  keyReady: boolean;
  profile: ProfileData;
  selectedPet: string;
  needsIdentity: boolean;
  onConfigureIdentity: () => void;
  onDismissIdentity: () => void;
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
            {profile.displayName
              ? `Olá, ${profile.displayName}. Vamos dar forma às suas ideias.`
              : 'Um espaço para dar forma às suas ideias.'}
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
      {needsIdentity && (
        <section className="identity-setup-card" aria-label="Configuração de identidade">
          <div>
            <strong>Configurar identidade</strong>
            <p>Defina seu nome e as preferências usadas pelo OdeKrai.</p>
          </div>
          <Button type="button" variant="secondary" onClick={onConfigureIdentity}>
            Configurar
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-label="Dispensar cartão de configuração de identidade"
            onClick={onDismissIdentity}
          >
            Dispensar
          </Button>
        </section>
      )}
      <section className="hero-card">
        <div className="hero-pet-space">
          <PetSprite estado="idle" petId={selectedPet} />
        </div>
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
            Iniciar conversa <Icon name="external-link" />
          </button>
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
          Personalizar <Icon name="external-link" />
        </button>
      </div>
      <div className="cards-grid">
        <button className="feature-card provider-card" onClick={() => onOpen('providers')}>
          <div className="card-icon red-icon">
            <Icon name="connectors" />
          </div>
          <div className="feature-copy">
            <span className="eyebrow">INTELIGÊNCIA</span>
            <h4>{keyReady ? 'Provedor configurado' : 'Escolha sua IA'}</h4>
            <p>
              {keyReady
                ? `${provider.name} · ${provider.model}`
                : 'Conecte uma IA para habilitar conversas.'}
            </p>
          </div>
          <span className="card-arrow">
            <Icon name="external-link" />
          </span>
        </button>
        <button className="feature-card companion-card" onClick={() => onOpen('companion')}>
          <div className="card-icon neutral-icon">
            <Icon name="pet" />
          </div>
          <div className="feature-copy">
            <span className="eyebrow">PERSONALIZAÇÃO</span>
            <h4>Seu espaço de presença</h4>
            <p>Conheça o OdeKrai e configure seu pet.</p>
          </div>
          <span className="card-arrow">
            <Icon name="external-link" />
          </span>
        </button>
      </div>
      <div className="privacy-note">
        <Icon name="shield" />
        <p>
          <strong>Privacidade desde o primeiro passo.</strong> Preferências são salvas localmente. O
          conteúdo da conversa é enviado apenas ao provedor que você configurar.
        </p>
        <button onClick={() => onOpen('settings')}>
          Saiba mais <Icon name="external-link" />
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
  selectedPet,
  onSelectPet,
}: {
  settings: AppSettings;
  update: (settings: AppSettings) => void;
  onError: (message: string) => void;
  selectedPet: string;
  onSelectPet: (petId: string) => void;
}) {
  const [soundEvent, setSoundEvent] = useState<SoundEvent>('notification');
  const [petState, setPetState] = useState<PetAnimationState>('idle');
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
      throw new Error('Não foi possível atualizar a posição do pet.');
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
          Math.max(0, (screen.availWidth - 176 * companion.size) / 2);
        const y =
          companion.desktopCoordinates?.y ??
          Math.max(0, (screen.availHeight - 176 * companion.size) / 2);
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
      <PageHeader
        eyebrow="PERSONALIZAÇÃO"
        title="Assistente do OdeKrai"
        subtitle="Uma presença leve para acompanhar você na área de trabalho."
      />
      <section className="settings-panel pet-picker-panel">
        <div className="panel-heading">
          <div>
            <h3>Escolha seu mascote</h3>
            <p>
              {'Escolha qual mascote aparece na área de trabalho, nas conversas e na tela inicial.'}
            </p>
          </div>
        </div>
        <div className="pet-picker-grid" role="group" aria-label="Mascote do OdeKrai">
          {PETS.map((pet) => (
            <button
              type="button"
              aria-pressed={selectedPet === pet.id}
              className={`pet-choice ${selectedPet === pet.id ? 'selected' : ''}`}
              key={pet.id}
              onClick={() => onSelectPet(pet.id)}
            >
              <PetSprite estado="idle" petId={pet.id} reduceMotion={settings.reduceMotion} />
              <span>{pet.name}</span>
              {selectedPet === pet.id && <small>Selecionado</small>}
            </button>
          ))}
        </div>
        <label className="pet-state-select">
          <span>Prévia de estado</span>
          <select
            value={petState}
            onChange={(event) => setPetState(event.target.value as PetAnimationState)}
          >
            <option value="idle">Em espera</option>
            <option value="thinking">Pensando</option>
            <option value="working">Trabalhando</option>
            <option value="awaiting_approval">Aguardando aprovação</option>
            <option value="success">Concluído</option>
            <option value="error">Erro</option>
            <option value="paused">Pausado</option>
          </select>
        </label>
      </section>
      <div className="companion-preview">
        <div className="preview-grid" />
        <div className="preview-island">
          <span className="island-light" />
          <PetSprite
            className="preview-mascot"
            estado={petState}
            petId={selectedPet}
            reduceMotion={settings.reduceMotion}
          />
          <span className="island-label">
            PET OdeKrai <i />
          </span>
        </div>
        <div className="preview-caption">
          <span className="eyebrow">PET DO OdeKrai</span>
          <strong>{PET_ANIMATION_LABELS[petState]}</strong>
          <p>OdeKrai pronto para acompanhar sua área de trabalho.</p>
        </div>
      </div>
      <section className="settings-panel compact-panel">
        <div className="panel-heading">
          <div>
            <h3>Pet na área de trabalho</h3>
            <p>
              Abre uma janela transparente do assistente. A posição pode ficar em qualquer canto da
              tela principal.
            </p>
          </div>
          <Toggle
            checked={settings.companion.enabled}
            label="Ativar pet do assistente"
            onClick={() => void setEnabled(!settings.companion.enabled)}
            disabled={!isTauri()}
          />
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
                onError('Não foi possível atualizar a posição do pet.'),
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
          <Toggle
            checked={settings.companion.freeMode}
            label="Ativar modo livre do pet"
            onClick={() => void setFreeMode(!settings.companion.freeMode)}
            disabled={!isTauri()}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Tamanho</strong>
            <span>{Math.round(settings.companion.size * 100)}% da escala-base.</span>
          </div>
          <input
            aria-label="Tamanho do pet"
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value={settings.companion.size}
            onChange={(event) => {
              const companion = { ...settings.companion, size: Number(event.target.value) };
              update({ ...settings, companion });
              void applyPosition(companion).catch(() =>
                onError('Não foi possível atualizar o tamanho do pet.'),
              );
            }}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Manter sobre outras janelas</strong>
            <span>Define a prioridade de exibição do pet.</span>
          </div>
          <Toggle
            checked={settings.companion.alwaysOnTop}
            label="Manter o pet sobre outras janelas"
            onClick={() => {
              const enabled = !settings.companion.alwaysOnTop;
              update({ ...settings, companion: { ...settings.companion, alwaysOnTop: enabled } });
              if (isTauri()) void invoke('set_island_topmost', { enabled });
            }}
            disabled={!isTauri()}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Abrir ao passar o mouse</strong>
            <span>Expande o pet quando o ponteiro passa sobre ele.</span>
          </div>
          <Toggle
            checked={settings.companion.openOnHover}
            label="Expandir o pet ao passar o mouse"
            onClick={() =>
              update({
                ...settings,
                companion: { ...settings.companion, openOnHover: !settings.companion.openOnHover },
              })
            }
            disabled={!isTauri()}
          />
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
          <Toggle
            checked={settings.companion.sounds.enabled}
            label="Ativar sons do pet"
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
          />
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
    </div>
  );
}

function Settings({
  settings,
  update,
  onDeleteAllHistory,
}: {
  settings: AppSettings;
  update: (next: AppSettings) => void;
  onDeleteAllHistory: () => Promise<boolean>;
}) {
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
  onRenameConversation,
  busy,
  draft,
  setDraft,
  error,
  submit,
  cancel,
  providerName,
  providerModel,
  providerConfigured,
  assistantUsesMascot,
  onFixConfiguration,
  onRetry,
  canRetry,
  profile,
  selectedPet,
}: {
  messages: ChatMessage[];
  conversations: Conversation[];
  conversationId: string | null;
  onConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  busy: boolean;
  draft: string;
  setDraft: (value: string) => void;
  error: string;
  submit: (event: FormEvent) => void;
  cancel: () => void;
  providerName: string;
  providerModel: string;
  providerConfigured: boolean;
  assistantUsesMascot: boolean;
  onFixConfiguration: () => void;
  onRetry: () => void;
  canRetry: boolean;
  profile: ProfileData;
  selectedPet: string;
}) {
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find((item) => item.id === conversationId);
  const filteredConversations = filterConversations(conversations, search);
  const presentedMessages = presentMessages(
    messages.filter((message) => message.role !== 'system'),
  );
  useEffect(
    () => setTitleDraft(activeConversation?.title ?? ''),
    [conversationId, activeConversation?.title],
  );
  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [draft]);
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area) return;
    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
    if (nearBottom) area.scrollTop = area.scrollHeight;
  }, [messages, busy]);

  return (
    <div className="chat-view">
      <aside className="conversation-sidebar" aria-label="Lista de conversas">
        <Button type="button" variant="primary" onClick={onNewConversation} disabled={busy}>
          Nova conversa
        </Button>
        <label className="conversation-search">
          <span className="sr-only">Buscar conversas</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar conversas"
          />
        </label>
        <div className="conversation-list">
          {filteredConversations.map((item) => (
            <div
              className={`conversation-item ${conversationId === item.id ? 'selected' : ''}`}
              key={item.id}
            >
              <button
                type="button"
                className="conversation-select"
                onClick={() => onConversation(item.id)}
                disabled={busy}
                aria-current={conversationId === item.id ? 'page' : undefined}
              >
                <strong>{item.title}</strong>
                <time dateTime={new Date(item.created_at * 1000).toISOString()}>
                  {new Date(item.created_at * 1000).toLocaleDateString('pt-BR')}
                </time>
                <span>{item.preview}</span>
              </button>
              <button
                type="button"
                className="conversation-menu-trigger"
                aria-label={`Opções da conversa ${item.title}`}
                aria-expanded={openMenuId === item.id}
                onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                disabled={busy}
              >
                <Icon name="more" />
              </button>
              {openMenuId === item.id && (
                <div className="conversation-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      const title = window.prompt('Novo título da conversa:', item.title);
                      if (title !== null) onRenameConversation(item.id, title);
                    }}
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      onDeleteConversation(item.id);
                    }}
                  >
                    Apagar
                  </button>
                </div>
              )}
            </div>
          ))}
          {filteredConversations.length === 0 && (
            <p className="conversation-list-empty">
              {search ? 'Nenhuma conversa encontrada.' : 'Suas conversas aparecerão aqui.'}
            </p>
          )}
        </div>
      </aside>
      <section className="chat-thread" aria-label="Conversa atual">
        <header className="chat-header">
          <div className="chat-title-wrap">
            <span className="eyebrow">CONVERSA</span>
            {activeConversation ? (
              <input
                className="chat-title-input"
                value={titleDraft}
                maxLength={120}
                aria-label="Título da conversa"
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  if (titleDraft.trim() && titleDraft.trim() !== activeConversation.title)
                    onRenameConversation(activeConversation.id, titleDraft);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setTitleDraft(activeConversation.title);
                }}
              />
            ) : (
              <h2>Nova conversa</h2>
            )}
          </div>
          <span className="chat-model-chip">
            {providerConfigured ? providerModel || providerName : 'Sem provedor'}
          </span>
        </header>
        {!providerConfigured && (
          <div className="chat-provider-needed" role="status">
            <span>Configure um provedor de IA para começar a conversar.</span>
            <Button type="button" variant="secondary" onClick={onFixConfiguration}>
              Abrir Conectores
            </Button>
          </div>
        )}
        <div className="messages-area" aria-live="polite" ref={messagesAreaRef}>
          {messages.length === 0 ? (
            <div className="empty-chat">
              <img className="empty-chat-icon" src={appIcon} alt="" />
              <strong>O que você gostaria de explorar?</strong>
              <p>Escreva uma pergunta, uma ideia ou algo que queira organizar.</p>
              <div className="prompt-chips">
                <button
                  type="button"
                  onClick={() => setDraft('Ajude-me a organizar minhas prioridades de hoje.')}
                >
                  Organizar meu dia <Icon name="external-link" />
                </button>
                <button type="button" onClick={() => setDraft('Quero explorar uma ideia nova: ')}>
                  Explorar uma ideia <Icon name="external-link" />
                </button>
                <button type="button" onClick={() => setDraft('Explique de forma simples: ')}>
                  Entender algo novo <Icon name="external-link" />
                </button>
              </div>
            </div>
          ) : (
            <div className="message-list">
              {presentedMessages.map(({ message, side }, index) => (
                <article className={`message message--${side}`} key={`${index}-${message.role}`}>
                  {message.role === 'assistant' && (
                    <span className="message-avatar">
                      {assistantUsesMascot ? (
                        <PetSprite estado="idle" petId={selectedPet} avatar />
                      ) : (
                        <img src={appIcon} alt="" />
                      )}
                    </span>
                  )}
                  <div className="message-content">
                    <span className="message-role">
                      {message.role === 'user' ? profile.displayName || 'Você' : 'OdeKrai'}
                    </span>
                    {message.role === 'assistant' ? (
                      <MessageMarkdown text={message.content} />
                    ) : (
                      <p className="message-plain">{message.content}</p>
                    )}
                    {message.citations?.length ? (
                      <div className="message-citations">
                        {message.citations.map((citation) =>
                          safeMarkdownUrl(citation.url) ? (
                            <a
                              key={citation.url}
                              href={safeMarkdownUrl(citation.url) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {citation.title}
                            </a>
                          ) : (
                            <span key={citation.url}>{citation.title}</span>
                          ),
                        )}
                      </div>
                    ) : null}
                    <time className="message-time">
                      {new Date(
                        (message.created_at ?? Math.floor(Date.now() / 1000)) * 1000,
                      ).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  {message.role === 'user' && (
                    <span className="message-avatar message-avatar-user">
                      {profile.avatarDataUrl ? (
                        <img src={profile.avatarDataUrl} alt="" />
                      ) : (
                        initials(profile.displayName)
                      )}
                    </span>
                  )}
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
            <p>{error}</p>
            <div>
              {canRetry && (
                <Button type="button" variant="secondary" onClick={onRetry} disabled={busy}>
                  Tentar novamente
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onFixConfiguration}>
                Corrigir configuração
              </Button>
            </div>
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Escreva sua mensagem..."
            rows={1}
            aria-label="Mensagem"
          />
          <div className="composer-bottom">
            <span>Enter envia · Shift + Enter quebra linha</span>
            <button
              className={`send-button ${busy ? 'stop-button' : ''}`}
              type={busy ? 'button' : 'submit'}
              onClick={busy ? cancel : undefined}
              disabled={!busy && !draft.trim()}
              aria-label={busy ? 'Parar resposta' : 'Enviar mensagem'}
            >
              {busy ? 'Parar' : 'Enviar'}
            </button>
          </div>
        </form>
        <p className="chat-disclaimer">
          As respostas podem conter imprecisões. As mensagens são enviadas ao provedor configurado.
        </p>
      </section>
    </div>
  );
}

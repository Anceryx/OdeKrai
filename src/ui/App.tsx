import { lazy, Suspense, useEffect, useMemo, type FormEvent } from 'react';
import { resolveConversationSelection } from '../core/chat';
import type { ChatMessage } from '../core/provider-messages';
import { emit, listen } from '@tauri-apps/api/event';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { normalizeSoundPreferences, playSound } from '../core/sounds';
import { AI_PROVIDERS, type AiProvider } from '../core/providers';
const Overview = lazy(() =>
  import('./screens/Overview').then((module) => ({ default: module.Overview })),
);
const AssistantScreen = lazy(() =>
  import('./screens/Assistant').then((module) => ({ default: module.AssistantScreen })),
);
const SettingsScreen = lazy(() =>
  import('./screens/Settings').then((module) => ({ default: module.SettingsScreen })),
);
const ConversationsScreen = lazy(() =>
  import('./screens/Conversations').then((module) => ({ default: module.ConversationsScreen })),
);
const ProvidersScreen = lazy(() =>
  import('./screens/Providers').then((module) => ({ default: module.ProvidersScreen })),
);
const IdentityScreen = lazy(() =>
  import('./screens/Identity').then((module) => ({ default: module.IdentityScreen })),
);
const PermissionsScreen = lazy(() =>
  import('./screens/Permissions').then((module) => ({ default: module.PermissionsScreen })),
);
const ActivityScreen = lazy(() =>
  import('./screens/Activity').then((module) => ({ default: module.ActivityScreen })),
);
import { initials, type ProfileData } from './Profile';
import { ApprovalWindow, isApprovalWindow } from './SecurityCenter';
import { PETS } from '../core/pets';
import { Icon, type IconName } from './Icon';
import { setPrimaryProviderSettings, toggleProviderSettings } from '../core/provider-directory';
import { profileFromApprovedCore } from '../core/identity';

import type { Section } from './screens/types';

import type { Conversation } from './screens/types';
import { useAppState } from './hooks/useAppState';

const nav: { id: Section; label: string; icon: IconName; group: string }[] = [
  { id: 'overview', label: 'VisÃ£o geral', icon: 'home', group: 'ESPAÃ‡O DE TRABALHO' },
  { id: 'chat', label: 'Conversas', icon: 'chat', group: 'ESPAÃ‡O DE TRABALHO' },
  { id: 'agent', label: 'Identidade e memÃ³ria', icon: 'memory', group: 'ESPAÃ‡O DE TRABALHO' },
  { id: 'providers', label: 'Conectores de IA', icon: 'connectors', group: 'INTELIGÃŠNCIA' },
  { id: 'companion', label: 'Assistente do OdeKrai', icon: 'pet', group: 'PERSONALIZAÃ‡ÃƒO' },
  { id: 'settings', label: 'ConfiguraÃ§Ãµes', icon: 'settings', group: 'PERSONALIZAÃ‡ÃƒO' },
  { id: 'permissions', label: 'PermissÃµes', icon: 'shield', group: 'PERSONALIZAÃ‡ÃƒO' },
  { id: 'activity', label: 'Atividade', icon: 'activity', group: 'PERSONALIZAÃ‡ÃƒO' },
];

export function App() {
  return isApprovalWindow() ? <ApprovalWindow /> : <MainApp />;
}

function MainApp() {
  const {
    section,
    setSection,
    settings,
    setSettings,
    identityConfigured,
    setIdentityConfigured,
    identityCardDismissed,
    setIdentityCardDismissed,
    permissionIndicator,
    setPermissionIndicator,
    profile,
    setProfile,
    keySavedForSession,
    setKeySavedForSession,
    selectedProviderId,
    setSelectedProviderId,
    activeProvider,
    messages,
    setMessages,
    selectedPet,
    setSelectedPet,
    conversations,
    setConversations,
    conversationId,
    setConversationId,
    draft,
    setDraft,
    busy,
    setBusy,
    error,
    setError,
    lastFailedPrompt,
    setLastFailedPrompt,
    toast,
    setToast,
    chatMode,
    setChatMode,
    request,
    companionStateTimer,
  } = useAppState();

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
        setToast('O OdeKrai foi parado. AÃ§Ãµes e respostas em andamento foram canceladas.');
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
      setToast('NÃ£o foi possÃ­vel salvar o personagem selecionado.');
    }
  }

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
      else setToast('NÃ£o foi possÃ­vel ler o perfil local.');
      if (home.status === 'rejected') {
        setToast('NÃ£o foi possÃ­vel verificar a pasta do OdeKrai.');
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
          if (current) setToast('NÃ£o foi possÃ­vel recuperar o perfil do arquivo base.');
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
            .catch(() => setError('NÃ£o foi possÃ­vel abrir a conversa anterior.'));
        }
      })
      .catch(() => setError('NÃ£o foi possÃ­vel abrir o histÃ³rico local.'));
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
      .catch(() => setToast('NÃ£o foi possÃ­vel restaurar o pet do assistente.'));
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
      .catch(() => setToast('NÃ£o foi possÃ­vel restaurar o OdeKrai no desktop.'));
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
      if (!provider) throw new Error('O provedor selecionado nÃ£o possui adaptador conhecido.');
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
      const onChunk = new Channel<
        | { type: 'textDelta'; text: string }
        | { type: 'toolCallComplete'; id: string; name: string; args: unknown }
        | { type: 'usage'; input: number; output: number }
        | { type: 'done'; stopReason: string | null }
        | { type: 'error'; kind: string; status: number | null; message: string }
      >();
      let streamed = '';
      onChunk.onmessage = (event) => {
        if (event.type !== 'textDelta') return;
        streamed += event.text;
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
          messages: next.map((message) => ({
            role: message.role,
            blocks: [{ type: 'text' as const, text: message.content }],
          })),
          tools: [],
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
              : 'NÃ£o foi possÃ­vel concluir a solicitaÃ§Ã£o.',
        );
        void playSound('error', normalizeSoundPreferences(settings.companion.sounds));
        if (isTauri())
          void emit('companion-state', {
            type: 'activity',
            state: 'error',
            message: 'NÃ£o foi possÃ­vel concluir a solicitaÃ§Ã£o',
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
      setError('NÃ£o foi possÃ­vel apagar a conversa.');
    }
  }

  async function deleteAllConversations(): Promise<boolean> {
    if (busy) {
      setToast('Aguarde a conclusÃ£o da resposta antes de apagar o histÃ³rico.');
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
      setToast('Todo o histÃ³rico foi apagado.');
      return true;
    } catch {
      setToast('NÃ£o foi possÃ­vel apagar o histÃ³rico.');
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
      setToast('NÃ£o foi possÃ­vel renomear a conversa.');
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
        <nav className="nav-list" aria-label="NavegaÃ§Ã£o principal">
          {(['ESPAÃ‡O DE TRABALHO', 'INTELIGÃŠNCIA', 'PERSONALIZAÃ‡ÃƒO'] as const).map((group) => (
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
                            ? 'Chave disponÃ­vel nesta sessÃ£o'
                            : 'Chave nÃ£o configurada'
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
                ? `${activeProvider.name}${activeProvider.model ? ` Â· ${activeProvider.model}` : ''}`
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
                PARADO Â· PERMISSÃ•ES
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
              onClick={() => setToast('A documentaÃ§Ã£o do projeto estÃ¡ em docs/.')}
            >
              <Icon name="help" />
            </button>
            <button
              className="help-button"
              onClick={() => setToast('Central de ajuda ainda em desenvolvimento.')}
            >
              Ajuda
            </button>
          </div>
        </header>
        <Suspense fallback={null}>
          {chatMode || section === 'chat' ? (
            <ConversationsScreen
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
                  .catch(() => setError('NÃ£o foi possÃ­vel abrir a conversa.'));
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
                <ProvidersScreen
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
                <AssistantScreen
                  settings={settings}
                  update={setSettings}
                  onError={setToast}
                  selectedPet={selectedPet}
                  onSelectPet={(petId) => void choosePet(petId)}
                />
              )}
              {section === 'settings' && (
                <SettingsScreen
                  settings={settings}
                  update={setSettings}
                  onDeleteAllHistory={deleteAllConversations}
                />
              )}
              {section === 'permissions' && <PermissionsScreen />}
              {section === 'activity' && <ActivityScreen />}
              {section === 'agent' && (
                <IdentityScreen
                  initialName={profile.displayName}
                  initialNickname={profile.nickname}
                  profileValue={profile}
                  onProfileChange={setProfile}
                />
              )}
            </div>
          )}
        </Suspense>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
} from 'react';
import { resolveConversationSelection } from '../core/chat';
import type { ChatMessage } from '../core/provider-messages';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  normalizeSoundPreferences,
  playSound,
  SOUND_EVENTS,
  SoundTriggerGate,
  type SoundEvent,
} from '../core/sounds';
import { AI_PROVIDERS, type AiProvider } from '../core/providers';
const Overview = lazy(() =>
  import('./screens/Overview').then((module) => ({ default: withScreenBoundary(module.Overview) })),
);
const AssistantScreen = lazy(() =>
  import('./screens/Assistant').then((module) => ({
    default: withScreenBoundary(module.AssistantScreen),
  })),
);
const SettingsScreen = lazy(() =>
  import('./screens/Settings').then((module) => ({
    default: withScreenBoundary(module.SettingsScreen),
  })),
);
const ConversationsScreen = lazy(() =>
  import('./screens/Conversations').then((module) => ({
    default: withScreenBoundary(module.ConversationsScreen),
  })),
);
const ProvidersScreen = lazy(() =>
  import('./screens/Providers').then((module) => ({
    default: withScreenBoundary(module.ProvidersScreen),
  })),
);
const ComputerScreen = lazy(() =>
  import('./screens/Computer').then((module) => ({
    default: withScreenBoundary(module.ComputerScreen),
  })),
);
const IdentityScreen = lazy(() =>
  import('./screens/Identity').then((module) => ({
    default: withScreenBoundary(module.IdentityScreen),
  })),
);
const PermissionsScreen = lazy(() =>
  import('./screens/Permissions').then((module) => ({
    default: withScreenBoundary(module.PermissionsScreen),
  })),
);
const ActivityScreen = lazy(() =>
  import('./screens/Activity').then((module) => ({
    default: withScreenBoundary(module.ActivityScreen),
  })),
);
import { initials } from './Profile';
import { ApprovalWindow, isApprovalWindow } from './SecurityCenter';
import { PETS } from '../core/pets';
import { navigationItems, SidebarNavigation } from './SidebarNavigation';
import {
  loadConnectedProviderIds,
  setPrimaryProviderSettings,
  toggleProviderSettings,
} from '../core/provider-directory';
import { loadSettings } from '../core/settings';
import { useAppEffects } from './hooks/useAppEffects';
import { externalLinkDomain, safeMarkdownUrl } from '../core/markdown';

import { useAppState } from './hooks/useAppState';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';
import { ResizeHandle } from './ResizeHandle';
const screenLoading = (
  <div className="screen-loading" role="status">
    Carregando tela…
  </div>
);
const withScreenBoundary = <Props extends object>(
  Screen: ComponentType<Props>,
): ComponentType<Props> => {
  function BoundedScreen(props: Props) {
    return (
      <ScreenErrorBoundary>
        <Screen {...props} />
      </ScreenErrorBoundary>
    );
  }
  return BoundedScreen;
};

export function App() {
  return isApprovalWindow() ? <ApprovalWindow /> : <MainApp />;
}

function MainApp() {
  useEffect(() => {
    if (!isTauri()) return;
    const started = performance.now();
    void invoke('record_diagnostic_event', {
      event: 'startup_command_start',
      command: 'get_build_info',
      outcome: 'ok',
      durationMs: 0,
    }).catch((error: unknown) => console.warn('[OdeKrai diagnóstico] Falha no log local.', error));
    void invoke<{
      version: string;
      commit: string;
      build_date: string;
      webview_version: string;
    }>('get_build_info')
      .then((info) => {
        console.info('[OdeKrai diagnóstico]', info);
        void invoke('record_diagnostic_event', {
          event: 'startup_command_finish',
          command: 'get_build_info',
          outcome: 'ok',
          durationMs: Math.max(0, Math.round(performance.now() - started)),
        }).catch((error: unknown) =>
          console.warn('[OdeKrai diagnóstico] Falha no log local.', error),
        );
      })
      .catch((error: unknown) => {
        console.error('[OdeKrai diagnóstico] Falha ao obter cabeçalho:', error);
        void invoke('record_diagnostic_event', {
          event: 'startup_command_finish',
          command: 'get_build_info',
          outcome: 'error',
          durationMs: Math.max(0, Math.round(performance.now() - started)),
        }).catch((logError: unknown) =>
          console.warn('[OdeKrai diagnóstico] Falha no log local.', logError),
        );
      });
  }, []);

  const appState = useAppState();
  const [usedProviderId, setUsedProviderId] = useState<string | null>(null);
  const thinkingSoundGate = useRef(new SoundTriggerGate());
  const lastThinkingSoundKey = useRef<string | null>(null);
  const diagnosticsSoundPlayed = useRef(false);
  const {
    section,
    setSection,
    settings,
    setSettings,
    petVisible,
    setPetVisible,
    identityConfigured,
    identityCardDismissed,
    setIdentityCardDismissed,
    permissionIndicator,
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
    diagnostics,
    chatMode,
    setChatMode,
    request,
    companionStateTimer,
  } = appState;
  const usedProvider = usedProviderId
    ? AI_PROVIDERS.find((item) => item.id === usedProviderId)
    : undefined;
  const shownProviderSettings = usedProviderId ? settings.providers[usedProviderId] : undefined;
  const shownProviderName = usedProvider?.name ?? activeProvider.name;
  const shownProviderModel = shownProviderSettings?.model ?? activeProvider.model;

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      event.preventDefault();
      setSettings((current) => ({
        ...current,
        layout: { ...current.layout, sidebarCollapsed: !current.layout.sidebarCollapsed },
      }));
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [setSettings]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<string>('pet-action', ({ payload }) => {
      if (payload === 'open') {
        void getCurrentWindow()
          .show()
          .then(() => getCurrentWindow().setFocus());
      } else if (payload === 'new-chat') {
        setSection('chat');
        setConversationId(null);
        setMessages([]);
        setDraft('');
      } else if (payload === 'stop') {
        void invoke('halt_all').catch(() => setToast('Não foi possível parar as ações.'));
      } else if (payload === 'mute') {
        setSettings((current) => ({
          ...current,
          companion: {
            ...current.companion,
            sounds: { ...current.companion.sounds, enabled: false },
          },
        }));
        setToast('O pet foi silenciado.');
      }
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, [setDraft, setMessages, setSection, setSettings, setConversationId, setToast]);

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

  useAppEffects(appState);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ event: string; petVisible?: boolean }>('sound-request', ({ payload }) => {
      if (!SOUND_EVENTS.includes(payload.event as SoundEvent)) return;
      void playSound(
        payload.event as SoundEvent,
        normalizeSoundPreferences(loadSettings().companion.sounds),
        { petVisible: payload.petVisible },
      );
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, []);
  useEffect(() => {
    if (diagnostics.length === 0) {
      diagnosticsSoundPlayed.current = false;
      return;
    }
    if (diagnosticsSoundPlayed.current) return;
    diagnosticsSoundPlayed.current = true;
    void playSound('notification', normalizeSoundPreferences(settings.companion.sounds));
  }, [diagnostics.length, settings.companion.sounds]);
  const currentNav = useMemo(() => navigationItems.find((item) => item.id === section), [section]);

  function selectProvider(provider: AiProvider) {
    setSelectedProviderId(provider.id);
  }

  function setPrimaryProvider(providerId: string) {
    setSettings((current) => setPrimaryProviderSettings(current, providerId));
    setSelectedProviderId(providerId);
    setUsedProviderId(null);
  }

  function setProviderEnabled(providerId: string, enabled: boolean) {
    setSettings((current) => toggleProviderSettings(current, providerId, enabled));
    if (!enabled && settings.activeProviderId === providerId) setKeySavedForSession(false);
  }

  async function hasConfiguredChatProvider() {
    const candidates = [settings.activeProviderId, ...settings.fallbackProviderIds].filter(
      (providerId, index, all) =>
        all.indexOf(providerId) === index && Boolean(settings.providers[providerId]?.model),
    );
    const { connectedIds } = await loadConnectedProviderIds(candidates, (providerId) =>
      invoke<boolean>('has_provider_credential', { providerId }),
    );
    const available = candidates.find(
      (providerId) => providerId === 'local' || connectedIds.has(providerId),
    );
    if (available) setUsedProviderId(available);
    setKeySavedForSession(Boolean(available));
    return Boolean(available);
  }

  async function beginChat() {
    if (!isTauri() || !(await hasConfiguredChatProvider())) {
      setSection('providers');
      setChatMode(false);
      return;
    }
    setChatMode(true);
  }

  async function sendMessage(rawText: string, reuseLastUserMessage = false) {
    const text = rawText.trim();
    if (!text || busy) return;
    if (!isTauri() || !(await hasConfiguredChatProvider())) {
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
    const thinkingSoundKey = reuseLastUserMessage
      ? lastThinkingSoundKey.current
      : crypto.randomUUID();
    if (!reuseLastUserMessage) lastThinkingSoundKey.current = thinkingSoundKey;
    if (thinkingSoundKey && thinkingSoundGate.current.claim(thinkingSoundKey)) {
      void playSound('thinking', normalizeSoundPreferences(settings.companion.sounds));
    }
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
      setUsedProviderId(provider.id);
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
        | { type: 'providerSelected'; providerId: string }
        | { type: 'done'; stopReason: string | null }
        | { type: 'error'; kind: string; status: number | null; message: string }
      >();
      let streamed = '';
      onChunk.onmessage = (event) => {
        if (event.type === 'providerSelected') {
          setUsedProviderId(event.providerId);
          return;
        }
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
          fallbacks: settings.fallbackProviderIds.flatMap((fallbackId) => {
            const config = settings.providers[fallbackId];
            return config?.model
              ? [{ providerId: fallbackId, baseUrl: config.baseUrl, model: config.model }]
              : [];
          }),
          dailyTokenLimit: settings.dailyTokenLimit,
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
      lastThinkingSoundKey.current = null;
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

  async function openResponseLink(rawUrl: string) {
    const url = safeMarkdownUrl(rawUrl);
    const domain = url ? externalLinkDomain(url) : null;
    if (!url || !domain) return;
    if (!settings.trustedLinkDomains.includes(domain)) {
      const accepted = window.confirm(
        `Este link abrirá ${domain} no navegador padrão.\n\n${url}\n\nAbrir e lembrar este domínio?`,
      );
      if (!accepted) return;
      setSettings((current) => ({
        ...current,
        trustedLinkDomains: [...new Set([...current.trustedLinkDomains, domain])].slice(0, 100),
      }));
    }
    try {
      if (!isTauri()) throw new Error('Abra links nas respostas pelo aplicativo OdeKrai.');
      await invoke('open_external_link', { url });
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : 'Não foi possível abrir este link.');
    }
  }

  return (
    <div
      className={`app-shell ${settings.reduceMotion ? 'reduce-motion' : ''} ${chatMode ? 'chat-mode' : ''}`}
    >
      <aside
        className={`sidebar ${settings.layout.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
        style={{ width: settings.layout.sidebarCollapsed ? 72 : settings.layout.sidebarWidth }}
      >
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
            <span>
              {profile.nickname ||
                (profile.displayName ? 'Editar perfil' : 'Local neste dispositivo')}
            </span>
          </div>
        </button>
        <SidebarNavigation
          section={section}
          onSelectSection={setSection}
          onSetChatMode={setChatMode}
          keySavedForSession={keySavedForSession}
          compact={settings.layout.sidebarCollapsed}
        />
        {!settings.layout.sidebarCollapsed && (
          <ResizeHandle
            label="Redimensionar barra lateral"
            value={settings.layout.sidebarWidth}
            min={190}
            max={340}
            onResize={(sidebarWidth) =>
              setSettings((current) => ({
                ...current,
                layout: { ...current.layout, sidebarWidth },
              }))
            }
          />
        )}
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={
              settings.layout.sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'
            }
            title="Alternar barra lateral (Ctrl+B)"
            onClick={() =>
              setSettings((current) => ({
                ...current,
                layout: { ...current.layout, sidebarCollapsed: !current.layout.sidebarCollapsed },
              }))
            }
          >
            {settings.layout.sidebarCollapsed ? '»' : '«'}
          </button>
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
                ? `${shownProviderName}${shownProviderModel ? ` · ${shownProviderModel}` : ''}`
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
              className="help-button"
              onClick={() => setToast('Central de ajuda ainda em desenvolvimento.')}
            >
              Ajuda
            </button>
          </div>
        </header>
        {diagnostics.length > 0 && (
          <aside className="diagnostic-banner" aria-label="Diagnóstico" role="status">
            <strong>Diagnóstico</strong>
            {diagnostics.map((item, index) => (
              <p key={`${item.command}-${index}`}>
                <code>{item.command}</code>: {item.message}
              </p>
            ))}
          </aside>
        )}
        <Suspense fallback={screenLoading}>
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
              providerName={shownProviderName}
              providerModel={shownProviderModel}
              conversationSidebarCollapsed={settings.layout.conversationSidebarCollapsed}
              conversationSidebarWidth={settings.layout.conversationSidebarWidth}
              onToggleConversationSidebar={() =>
                setSettings((current) => ({
                  ...current,
                  layout: {
                    ...current.layout,
                    conversationSidebarCollapsed: !current.layout.conversationSidebarCollapsed,
                  },
                }))
              }
              onResizeConversationSidebar={(conversationSidebarWidth) =>
                setSettings((current) => ({
                  ...current,
                  layout: { ...current.layout, conversationSidebarWidth },
                }))
              }
              onOpenLink={(url) => void openResponseLink(url)}
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
              {section === 'computer' && <ComputerScreen />}
              {section === 'companion' && (
                <AssistantScreen
                  settings={settings}
                  update={setSettings}
                  petVisible={petVisible}
                  onPetVisibilityChange={setPetVisible}
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

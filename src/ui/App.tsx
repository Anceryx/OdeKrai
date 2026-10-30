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
import type { AgentActionCardData } from './AgentControls';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import {
  normalizeSoundPreferences,
  playSound,
  SOUND_EVENTS,
  SoundTriggerGate,
  type SoundEvent,
} from '../core/sounds';
import { AI_PROVIDERS, type AiProvider } from '../core/providers';
import { stopLocalSpeech } from '../core/speech';
import {
  createHomeChecklist,
  createHomeSuggestions,
  getTodayBounds,
  type HomeEvent,
} from '../core/home';
import type { CatalogSkill } from '../core/skills-catalog';
const Overview = lazy(() =>
  import('./screens/Overview').then((module) => ({ default: withScreenBoundary(module.Overview) })),
);
const DevDesignSystemGallery = import.meta.env.DEV
  ? lazy(() =>
      import('./DesignSystemGallery').then((module) => ({ default: module.DesignSystemGallery })),
    )
  : null;
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
const CalendarScreen = lazy(() =>
  import('./screens/Calendar').then((module) => ({
    default: withScreenBoundary(module.CalendarScreen),
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
import { ApprovalWindow, isApprovalWindow } from './SecurityCenter';
import { SkillsScreen } from './SkillsScreen';
import { PETS } from '../core/pets';
import {
  navigationItems,
  PendingApprovalIndicator,
  SidebarNavigation,
  SidebarProfileMenu,
  shouldShowStopAll,
} from './SidebarNavigation';
import {
  loadSavedCredentialProviderIds,
  setPrimaryProviderSettings,
  toggleProviderSettings,
} from '../core/provider-directory';
import { loadSettings } from '../core/settings';
import { useAppEffects } from './hooks/useAppEffects';
import { externalLinkDomain, safeMarkdownUrl } from '../core/markdown';

import { useAppState } from './hooks/useAppState';
import { useNavigation } from './hooks/useNavigation';
import { SettingsModal } from './SettingsModal';
import { resolveAgentReason, resolveConfigurationReason } from '../core/navigation';
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
  if (isApprovalWindow()) return <ApprovalWindow />;
  if (
    import.meta.env.DEV &&
    location.pathname === '/__dev/design-system' &&
    DevDesignSystemGallery
  ) {
    return (
      <Suspense fallback={screenLoading}>
        <DevDesignSystemGallery />
      </Suspense>
    );
  }
  return <MainApp />;
}

function MainApp() {
  const appState = useAppState();
  const {
    section,
    route,
    navigate,
    openLegacyScreen,
    settingsOpen,
    closeSettings,
    selectSettingsSection,
  } = useNavigation();
  const [usedProviderId, setUsedProviderId] = useState<string | null>(null);
  const [agentAvailability, setAgentAvailability] = useState<{
    available: boolean;
    reason: string | null;
    workspacePath: string | null;
  }>({ available: false, reason: 'Verificando requisitos do agente…', workspacePath: null });
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentErrorDetails, setAgentErrorDetails] = useState('');
  const [agentAwaitingApproval, setAgentAwaitingApproval] = useState(false);
  const [agentActionCards, setAgentActionCards] = useState<AgentActionCardData[]>([]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [homeSkills, setHomeSkills] = useState<CatalogSkill[] | null>(null);
  const [todayEvents, setTodayEvents] = useState<HomeEvent[]>([]);
  const [reminderCount, setReminderCount] = useState(0);
  const agentRunConversation = useRef<string | null>(null);
  const thinkingSoundGate = useRef(new SoundTriggerGate());
  const lastThinkingSoundKey = useRef<string | null>(null);
  const diagnosticsSoundPlayed = useRef(false);
  const {
    settings,
    setSettings,
    petVisible,
    setPetVisible,
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
    dismissDiagnostics,
    reportDiagnostic,
    chatMode,
    setChatMode,
    request,
    companionStateTimer,
  } = appState;
  const emitCompanionState = (payload: { type: 'activity'; state: string; message: string }) => {
    void emit('companion-state', payload).catch(() =>
      reportDiagnostic('companion-state', 'Não foi possível atualizar o estado visual do pet.'),
    );
  };
  const usedProvider = usedProviderId
    ? AI_PROVIDERS.find((item) => item.id === usedProviderId)
    : undefined;
  const shownProviderSettings = usedProviderId ? settings.providers[usedProviderId] : undefined;
  const shownProviderName = usedProvider?.name ?? activeProvider.name;
  const shownProviderId = usedProviderId ?? settings.activeProviderId;
  const shownProviderModel = shownProviderSettings?.model ?? activeProvider.model;
  const activeHomeSkills = useMemo(
    () =>
      (homeSkills ?? [])
        .filter((skill) => skill.enabled && skill.status === 'installed')
        .map(({ id, family, name }) => ({ id, family, name })),
    [homeSkills],
  );
  const homeSuggestions = useMemo(
    () =>
      createHomeSuggestions({
        activeSkills: activeHomeSkills,
        agentAvailable: agentAvailability.available,
        todayEvents,
        reminderCount,
        pendingApprovalCount,
        recentConversations: conversations.slice(0, 5),
      }),
    [
      activeHomeSkills,
      agentAvailability.available,
      todayEvents,
      reminderCount,
      pendingApprovalCount,
      conversations,
    ],
  );
  const homeChecklist = useMemo(
    () =>
      createHomeChecklist({
        providerReady: keySavedForSession,
        workspaceAvailable: Boolean(agentAvailability.workspacePath),
        agentAvailable: agentAvailability.available,
        agentReason: agentAvailability.reason,
      }),
    [
      keySavedForSession,
      agentAvailability.available,
      agentAvailability.reason,
      agentAvailability.workspacePath,
    ],
  );
  useEffect(() => {
    if (isTauri())
      void invoke('set_microphone_opt_in', { enabled: settings.microphoneEnabled }).catch(() =>
        setToast('Não foi possível atualizar a permissão do microfone.'),
      );
  }, [settings.microphoneEnabled]);

  useEffect(() => {
    if (permissionIndicator?.halted) stopLocalSpeech();
  }, [permissionIndicator?.halted]);

  useEffect(() => {
    if (!settings.companion.sounds.enabled) stopLocalSpeech();
  }, [settings.companion.sounds.enabled]);

  useEffect(() => {
    if (!isTauri()) {
      setAgentAvailability({
        available: false,
        reason: 'O modo agente está disponível somente no aplicativo do OdeKrai.',
        workspacePath: null,
      });
      return;
    }
    const checkAvailability = () =>
      invoke<{ available: boolean; reason: string | null; workspacePath: string | null }>(
        'agent_availability',
        { providerId: activeProvider.providerId, model: activeProvider.model },
      )
        .then((availability) => {
          setAgentAvailability(availability);
          if (!availability.available) setAgentEnabled(false);
          else if (!conversationId) setAgentEnabled(true);
        })
        .catch(() =>
          setAgentAvailability({
            available: false,
            reason: 'Não foi possível verificar a pasta, o provedor e as habilidades do agente.',
            workspacePath: null,
          }),
        );
    void checkAvailability();
    let disposed = false;
    let stopSkillsUpdated: (() => void) | undefined;
    void listen('skills-updated', () => void checkAvailability())
      .then((stop) => {
        if (disposed) stop();
        else stopSkillsUpdated = stop;
      })
      .catch(() => setToast('Não foi possível acompanhar as alterações das habilidades.'));
    const onFocus = () => {
      void checkAvailability();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      disposed = true;
      stopSkillsUpdated?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [
    activeProvider.providerId,
    activeProvider.model,
    conversationId,
    permissionIndicator?.halted,
  ]);

  useEffect(() => {
    if (section !== 'overview') return;
    let disposed = false;
    let stopSkillsUpdated: (() => void) | undefined;

    const refreshHomeContext = async () => {
      setHomeSkills(null);
      setTodayEvents([]);
      setReminderCount(0);
      if (!isTauri()) {
        setHomeSkills([]);
        return;
      }
      try {
        const skills = await invoke<CatalogSkill[]>('get_skills');
        if (disposed) return;
        setHomeSkills(skills);
        const active = skills.filter((skill) => skill.enabled && skill.status === 'installed');
        const canReadCalendar = active.some(
          (skill) => skill.id === 'calendar.list_events' && skill.family === 'agenda_lembretes',
        );
        const canReadReminders = active.some(
          (skill) => skill.id === 'reminder.list' && skill.family === 'agenda_lembretes',
        );
        const bounds = getTodayBounds(new Date());
        const [events, reminders] = await Promise.allSettled([
          canReadCalendar
            ? invoke<HomeEvent[]>('calendar_list_events', bounds)
            : Promise.resolve([] as HomeEvent[]),
          canReadReminders ? invoke<number>('get_home_reminder_count') : Promise.resolve(0),
        ]);
        if (disposed) return;
        setTodayEvents(events.status === 'fulfilled' ? events.value : []);
        setReminderCount(reminders.status === 'fulfilled' ? reminders.value : 0);
      } catch {
        if (!disposed) setHomeSkills([]);
      }
    };

    void refreshHomeContext();
    void listen('skills-updated', () => void refreshHomeContext())
      .then((stop) => {
        if (disposed) stop();
        else stopSkillsUpdated = stop;
      })
      .catch(() => setToast('Não foi possível atualizar o contexto do Início.'));
    window.addEventListener('focus', refreshHomeContext);
    return () => {
      disposed = true;
      stopSkillsUpdated?.();
      window.removeEventListener('focus', refreshHomeContext);
    };
  }, [section]);

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
    let disposed = false;
    void listen<string>('pet-action', ({ payload }) => {
      if (payload === 'open') {
        void invoke('show_main_window').catch((error: unknown) =>
          setToast(`Não foi possível abrir a janela principal: ${String(error)}`),
        );
      } else if (payload === 'new-chat') {
        navigate('chat');
        setConversationId(null);
        setMessages([]);
        setDraft('');
      } else if (payload === 'stop') {
        void invoke('halt_all').catch(() => setToast('Não foi possível parar as ações.'));
      } else if (payload === 'mute') {
        stopLocalSpeech();
        setSettings((current) => ({
          ...current,
          companion: {
            ...current.companion,
            sounds: { ...current.companion.sounds, enabled: false },
          },
        }));
        setToast('O pet foi silenciado.');
      }
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => setToast('Não foi possível iniciar os comandos do pet.'));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setDraft, setMessages, navigate, setSettings, setConversationId, setToast]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = () => {
      void invoke<number>('get_pending_approval_count')
        .then((count) => {
          if (!disposed) setPendingApprovalCount(count);
        })
        .catch(() =>
          reportDiagnostic(
            'get_pending_approval_count',
            'Não foi possível atualizar a contagem de aprovações pendentes.',
          ),
        );
    };
    void listen('approval-updated', refresh)
      .then((stop) => {
        if (disposed) stop();
        else {
          unlisten = stop;
          refresh();
        }
      })
      .catch(() => setToast('Não foi possível acompanhar as aprovações pendentes.'));
    return () => {
      disposed = true;
      unlisten?.();
    };
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

  useAppEffects(appState);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<{ event: string; petVisible?: boolean }>('sound-request', ({ payload }) => {
      if (!SOUND_EVENTS.includes(payload.event as SoundEvent)) return;
      void playSound(
        payload.event as SoundEvent,
        normalizeSoundPreferences(loadSettings().companion.sounds),
        { petVisible: payload.petVisible },
      );
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => setToast('Não foi possível iniciar os avisos de áudio.'));
    return () => {
      disposed = true;
      unlisten?.();
    };
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

  async function setConversationAgentMode(enabled: boolean) {
    if (enabled && !agentAvailability.available) return;
    if (conversationId) {
      try {
        await invoke('set_conversation_agent_mode', { conversationId, enabled });
        setConversations((items) =>
          items.map((item) =>
            item.id === conversationId ? { ...item, agent_enabled: enabled } : item,
          ),
        );
      } catch (cause) {
        setToast(
          cause instanceof Error ? cause.message : 'Não foi possível alterar o modo agente.',
        );
        return;
      }
    }
    setAgentEnabled(enabled);
  }

  async function hasConfiguredChatProvider() {
    const candidates = [settings.activeProviderId, ...settings.fallbackProviderIds].filter(
      (providerId, index, all) =>
        all.indexOf(providerId) === index &&
        settings.providers[providerId]?.enabled !== false &&
        Boolean(settings.providers[providerId]?.model),
    );
    const { credentialIds } = await loadSavedCredentialProviderIds(candidates, (providerId) =>
      invoke<boolean>('has_provider_credential', { providerId }),
    );
    const available = candidates.find(
      (providerId) => providerId === 'local' || credentialIds.has(providerId),
    );
    if (available) setUsedProviderId(available);
    setKeySavedForSession(Boolean(available));
    return Boolean(available);
  }

  useEffect(() => {
    void hasConfiguredChatProvider().catch(() => setKeySavedForSession(false));
  }, [settings.activeProviderId, settings.fallbackProviderIds, settings.providers]);

  async function beginChat() {
    if (!isTauri() || !(await hasConfiguredChatProvider())) {
      navigate('providers');
      setChatMode(false);
      return;
    }
    setChatMode(true);
  }

  function startHomeConversation() {
    setConversationId(null);
    setMessages([]);
    setAgentActionCards([]);
    setAgentEnabled(agentAvailability.available);
    setError('');
    setAgentErrorDetails('');
    setLastFailedPrompt('');
    setChatMode(true);
    navigate('chat');
  }

  function sendHomeFirstMessage(text: string) {
    return sendMessage(text, false, undefined, {
      newConversation: true,
      agentEnabled: agentAvailability.available,
    });
  }

  async function sendMessage(
    rawText: string,
    reuseLastUserMessage = false,
    imageBase64?: string,
    options: { newConversation?: boolean; agentEnabled?: boolean } = {},
  ): Promise<boolean> {
    const text = rawText.trim();
    if (!text || busy) return false;
    const isNewConversation = options.newConversation ?? !conversationId;
    const useAgent = options.agentEnabled ?? agentEnabled;
    if (useAgent && !agentAvailability.available) {
      setError(
        `Modo agente indisponível: ${agentAvailability.reason ?? 'verifique as configurações do agente.'}`,
      );
      setLastFailedPrompt('');
      return false;
    }
    if (imageBase64 && (!useAgent || !agentAvailability.available)) {
      setError('Ative o agente antes de enviar uma imagem para análise.');
      return false;
    }
    if (!isTauri()) {
      setError('Configure um provedor de IA em Conectores para enviar mensagens.');
      setLastFailedPrompt('');
      return false;
    }
    let hasProvider = false;
    try {
      hasProvider = await hasConfiguredChatProvider();
    } catch {
      setError('Não foi possível verificar a credencial do provedor.');
      setLastFailedPrompt('');
      return false;
    }
    if (!hasProvider) {
      setError('Configure um provedor de IA em Conectores para enviar mensagens.');
      setLastFailedPrompt('');
      return false;
    }
    const activeId = isNewConversation ? crypto.randomUUID() : conversationId!;
    const sentAt = Math.floor(Date.now() / 1000);
    const next = reuseLastUserMessage
      ? messages
      : [
          ...(isNewConversation ? [] : messages),
          { role: 'user' as const, content: text, created_at: sentAt },
        ];
    setMessages(next);
    setDraft('');
    setError('');
    setAgentErrorDetails('');
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
      emitCompanionState({
        type: 'activity',
        state: 'thinking',
        message: 'Aguardando resposta do provedor',
      });
    const requestId = crypto.randomUUID();
    request.current = requestId;
    try {
      const provider = AI_PROVIDERS.find((item) => item.id === settings.activeProviderId);
      if (!provider) throw new Error('O provedor selecionado não possui adaptador conhecido.');
      const agentProviderTargets = [
        { providerId: provider.id, baseUrl: activeProvider.baseUrl, model: activeProvider.model },
        ...settings.fallbackProviderIds.flatMap((fallbackId) => {
          const config = settings.providers[fallbackId];
          return config?.enabled !== false && config?.model
            ? [{ providerId: fallbackId, baseUrl: config.baseUrl, model: config.model }]
            : [];
        }),
      ];
      setUsedProviderId(provider.id);
      if (!reuseLastUserMessage) {
        await invoke('append_conversation_message', {
          conversationId: activeId,
          role: 'user',
          content: text,
          providerId: provider.id,
          model: activeProvider.model,
          providerTargets: agentProviderTargets,
        });
        if (isNewConversation && !useAgent && agentAvailability.available) {
          await invoke('set_conversation_agent_mode', {
            conversationId: activeId,
            enabled: false,
          });
        }
        setConversations((items) => {
          const existing = items.find((item) => item.id === activeId);
          if (!existing) return items;
          return [{ ...existing, preview: text }, ...items.filter((item) => item.id !== activeId)];
        });
      }
      setConversationId(activeId);
      if (isNewConversation)
        setConversations((items) => [
          {
            id: activeId,
            title: text.slice(0, 80),
            preview: text,
            created_at: sentAt,
            provider_id: provider.id,
            model: activeProvider.model,
            agent_enabled: useAgent && agentAvailability.available,
          },
          ...items,
        ]);
      if (useAgent && agentAvailability.available) {
        const onEvent = new Channel<{
          type:
            | 'step'
            | 'toolCall'
            | 'awaitingApproval'
            | 'toolResult'
            | 'finalResponse'
            | 'error'
            | 'stopped'
            | 'actionCard';
          turn?: number;
          id?: string;
          name?: string;
          auditId?: string | null;
          isError?: boolean;
          content?: string;
          kind?: string;
          message?: string;
          technicalDetails?: string | null;
          card?: AgentActionCardData & { createdAt: number };
        }>();
        agentRunConversation.current = activeId;
        setAgentRunning(true);
        setAgentAwaitingApproval(false);
        onEvent.onmessage = (event) => {
          if (event.type === 'actionCard' && event.card) {
            setAgentActionCards((items) => {
              const next = items.filter((item) => item.id !== event.card!.id);
              return [...next, event.card!].slice(-100);
            });
            setAgentAwaitingApproval(event.card.status === 'Aguardando aprovação');
          } else if (event.type === 'awaitingApproval') {
            setAgentAwaitingApproval(true);
            void playSound('approval_needed', normalizeSoundPreferences(settings.companion.sounds));
            emitCompanionState({
              type: 'activity',
              state: 'awaiting_approval',
              message: 'Aguardando aprovação na janela nativa',
            });
          } else if (event.type === 'toolCall' || event.type === 'step') {
            setAgentAwaitingApproval(false);
            emitCompanionState({
              type: 'activity',
              state: event.type === 'toolCall' ? 'task' : 'thinking',
              message: event.type === 'toolCall' ? 'Executando habilidade' : 'Pensando',
            });
          } else if (event.type === 'toolResult') {
            setAgentAwaitingApproval(false);
            if (event.isError) {
              void playSound('error', normalizeSoundPreferences(settings.companion.sounds));
            } else {
              void playSound('action_done', normalizeSoundPreferences(settings.companion.sounds));
            }
            emitCompanionState({
              type: 'activity',
              state: event.isError ? 'error' : 'task',
              message: event.isError ? 'A ação não foi concluída' : 'Ação concluída',
            });
          } else if (event.type === 'finalResponse') {
            const content = event.content ?? '';
            setMessages([
              ...next,
              { role: 'assistant', content, created_at: Math.floor(Date.now() / 1000) },
            ]);
            void playSound('success', normalizeSoundPreferences(settings.companion.sounds));
            emitCompanionState({
              type: 'activity',
              state: 'completed',
              message: 'Resposta pronta',
            });
          } else if (event.type === 'error') {
            setError(event.message ?? 'O agente não conseguiu concluir a execução.');
            setAgentErrorDetails(event.technicalDetails ?? '');
            void playSound('error', normalizeSoundPreferences(settings.companion.sounds));
            emitCompanionState({
              type: 'activity',
              state: 'error',
              message: 'Falha no agente',
            });
          } else if (event.type === 'stopped') {
            setAgentAwaitingApproval(false);
            void playSound('halted', normalizeSoundPreferences(settings.companion.sounds));
            emitCompanionState({
              type: 'activity',
              state: 'paused',
              message: 'Agente parado',
            });
          }
        };
        const answer = await invoke<string>('agent_run', {
          conversationId: activeId,
          message: text,
          imageBase64: imageBase64 ?? null,
          dailyTokenLimit: settings.dailyTokenLimit,
          onEvent,
        });
        setMessages([
          ...next,
          { role: 'assistant', content: answer, created_at: Math.floor(Date.now() / 1000) },
        ]);
        setConversations((items) =>
          items.map((item) => (item.id === activeId ? { ...item, preview: answer } : item)),
        );
        void invoke<AgentActionCardData[]>('load_agent_action_cards', {
          conversationId: activeId,
        })
          .then(setAgentActionCards)
          .catch(() => setAgentActionCards([]));
        return true;
      }
      const onChunk = new Channel<
        | { type: 'textDelta'; text: string }
        | { type: 'toolCallComplete'; id: string; name: string; args: unknown }
        | { type: 'usage'; input: number; output: number }
        | { type: 'providerSelected'; providerId: string }
        | { type: 'done'; stopReason: string | null }
        | { type: 'error'; kind: string; status: number | null; message: string }
      >();
      let responseProviderId = provider.id;
      let streamed = '';
      onChunk.onmessage = (event) => {
        if (event.type === 'providerSelected') {
          responseProviderId = event.providerId;
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
            return config?.enabled !== false && config?.model
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
        providerId: responseProviderId,
        model:
          settings.providers[responseProviderId]?.model ??
          (responseProviderId === provider.id ? activeProvider.model : ''),
        providerTargets: agentProviderTargets,
      });
      const responseModel =
        settings.providers[responseProviderId]?.model ??
        (responseProviderId === provider.id ? activeProvider.model : '');
      setConversations((items) =>
        items.map((item) =>
          item.id === activeId
            ? {
                ...item,
                preview: answer.content,
                provider_id: responseProviderId,
                model: responseModel,
              }
            : item,
        ),
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
        emitCompanionState({
          type: 'activity',
          state: 'responding',
          message: 'Resposta pronta',
        });
        companionStateTimer.current = window.setTimeout(
          () =>
            emitCompanionState({
              type: 'activity',
              state: 'completed',
              message: 'Resposta recebida',
            }),
          1100,
        );
      }
      return true;
    } catch (cause) {
      const stopped =
        typeof cause === 'string' &&
        (cause.toLocaleLowerCase('pt-BR').includes('parad') ||
          cause.toLocaleLowerCase('pt-BR').includes('cancel'));
      if (!stopped) {
        setMessages(next);
        setLastFailedPrompt(imageBase64 ? '' : text);
        setError(
          typeof cause === 'string'
            ? cause
            : cause instanceof Error
              ? cause.message
              : 'Não foi possível concluir a solicitação.',
        );
        void playSound('error', normalizeSoundPreferences(settings.companion.sounds));
        if (isTauri())
          emitCompanionState({
            type: 'activity',
            state: 'error',
            message: 'Não foi possível concluir a solicitação',
          });
      } else {
        setMessages(next);
        setLastFailedPrompt('');
      }
      return false;
    } finally {
      setBusy(false);
      request.current = null;
      setAgentRunning(false);
      setAgentAwaitingApproval(false);
      agentRunConversation.current = null;
    }
  }

  function submitMessage(event: FormEvent): Promise<boolean> {
    event.preventDefault();
    return sendMessage(draft);
  }

  function openConversation(id: string) {
    if (busy) return;
    const selectedId = resolveConversationSelection(conversations, id);
    if (!selectedId) return;
    setConversationId(selectedId);
    setConversations((items) => {
      const selected = items.find((item) => item.id === selectedId);
      return selected ? [selected, ...items.filter((item) => item.id !== selectedId)] : items;
    });
    setError('');
    setChatMode(true);
    navigate('chat');
    void Promise.all([
      invoke<ChatMessage[]>('load_conversation', { conversationId: selectedId }),
      invoke<boolean>('get_conversation_agent_mode', { conversationId: selectedId }),
      invoke<AgentActionCardData[]>('load_agent_action_cards', { conversationId: selectedId }),
    ])
      .then(([loaded, enabled, cards]) => {
        setMessages(loaded);
        setAgentEnabled(enabled);
        setAgentActionCards(cards);
      })
      .catch(() => setError('Não foi possível abrir a conversa.'));
  }

  function cancelRequest() {
    if (agentRunConversation.current) {
      void invoke('agent_cancel', { conversationId: agentRunConversation.current }).catch(() =>
        setError('Não foi possível parar a execução do agente.'),
      );
      return;
    }
    if (request.current)
      void invoke('cancel_provider_request', { requestId: request.current }).catch(() =>
        console.warn('[OdeKrai diagnóstico] Não foi possível cancelar a solicitação do provedor.'),
      );
  }

  async function stopAll() {
    stopLocalSpeech();
    try {
      await invoke('halt_all');
    } catch {
      setToast('Não foi possível parar as ações.');
    }
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
    const needsConfirmation = !settings.trustedLinkDomains.includes(domain);
    if (needsConfirmation) {
      const accepted = window.confirm(
        `Este link abrirá ${domain} no navegador padrão.\n\n${url}\n\nAbrir e lembrar este domínio?`,
      );
      if (!accepted) return;
    }
    try {
      if (!isTauri()) throw new Error('Abra links nas respostas pelo aplicativo OdeKrai.');
      await invoke('trust_external_domain', { domain });
      if (needsConfirmation) {
        setSettings((current) => ({
          ...current,
          trustedLinkDomains: [...new Set([...current.trustedLinkDomains, domain])].slice(0, 100),
        }));
      }
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
        <SidebarNavigation
          section={section}
          onSelectSection={navigate}
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
        <SidebarProfileMenu
          profile={profile}
          compact={settings.layout.sidebarCollapsed}
          section={section}
          onMyProfile={() => navigate('agent')}
          onSettings={() => navigate('settings')}
          onPermissions={() => navigate('permissions')}
          onHelp={() => void openResponseLink('https://github.com/Anceryx/OdeKrai/tree/main/docs')}
          onAbout={() => selectSettingsSection('sobre')}
        />
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
            <PendingApprovalIndicator
              count={pendingApprovalCount}
              onOpen={() => navigate('activity')}
            />
            {shouldShowStopAll(busy, agentRunning) && (
              <button type="button" className="stop-all-button" onClick={() => void stopAll()}>
                Parar tudo
              </button>
            )}
            <button
              type="button"
              className="provider-chip"
              onClick={() => {
                navigate('providers');
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
                  navigate('permissions');
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
                  navigate('permissions');
                  setChatMode(false);
                }}
              >
                CONTROLE TOTAL
              </button>
            )}
          </div>
        </header>
        {diagnostics.length > 0 && (
          <aside className="diagnostic-banner" aria-label="Diagnóstico" role="status">
            <div className="diagnostic-banner-heading">
              <strong>Diagnóstico</strong>
              <button type="button" aria-label="Fechar diagnóstico" onClick={dismissDiagnostics}>
                ×
              </button>
            </div>
            {diagnostics.map((item) => (
              <div className="diagnostic-item" key={`${item.command}-${item.message}`}>
                <p>
                  <code>{item.command}</code>: {item.message}
                  {item.count > 1 ? ` (${item.count} ocorrências)` : ''}
                </p>
                {item.details && (
                  <details>
                    <summary>Detalhes</summary>
                    <code>{item.details}</code>
                  </details>
                )}
                {item.command === 'agent_home_status' && (
                  <button
                    type="button"
                    className="secondary-button small-button"
                    onClick={() => {
                      navigate('agent');
                      setChatMode(false);
                    }}
                  >
                    Resolver pasta do agente
                  </button>
                )}
              </div>
            ))}
          </aside>
        )}
        <Suspense fallback={screenLoading}>
          {chatMode || section === 'chat' ? (
            <ConversationsScreen
              messages={messages}
              conversations={conversations}
              conversationId={conversationId}
              onConversation={openConversation}
              onNewConversation={() => {
                if (!busy) {
                  setConversationId(null);
                  setMessages([]);
                  setAgentActionCards([]);
                  setAgentEnabled(agentAvailability.available);
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
              errorDetails={agentErrorDetails}
              canFixConfiguration={
                !/rede|conexão|limitou as solicitações|tempo limite|demorou para responder|serviço do provedor está indisponível/i.test(
                  error,
                )
              }
              submit={submitMessage}
              cancel={cancelRequest}
              providerModel={shownProviderModel}
              providerId={shownProviderId}
              microphoneEnabled={settings.microphoneEnabled}
              readRepliesAutomatically={settings.readRepliesAutomatically}
              speechVoiceURI={settings.speechVoiceURI}
              speechRate={settings.speechRate}
              speechVolume={settings.speechVolume}
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
                navigate(resolveConfigurationReason(error));
                setChatMode(false);
              }}
              onRetry={() => void sendMessage(lastFailedPrompt, true)}
              canRetry={
                Boolean(lastFailedPrompt) &&
                /rede|conexão|limitou as solicitações|tempo limite|demorou para responder|serviço do provedor está indisponível/i.test(
                  error,
                )
              }
              profile={profile}
              selectedPet={selectedPet}
              agentEnabled={agentEnabled}
              agentUnavailableReason={agentAvailability.available ? null : agentAvailability.reason}
              agentWorkspacePath={agentAvailability.workspacePath}
              agentRunning={agentRunning}
              agentAwaitingApproval={agentAwaitingApproval}
              agentActionCards={agentActionCards}
              onAnalyzeCapture={(prompt, imageBase64) => sendMessage(prompt, false, imageBase64)}
              onToggleAgent={(enabled) => void setConversationAgentMode(enabled)}
              onStopAgent={cancelRequest}
              onConfigureAgent={() => {
                const reason = agentAvailability.reason ?? '';
                setChatMode(false);
                navigate(resolveAgentReason(reason));
              }}
            />
          ) : (
            <div className="content-scroll">
              {section === 'overview' && (
                <Overview
                  draft={draft}
                  setDraft={setDraft}
                  busy={busy}
                  keyReady={keySavedForSession}
                  profile={profile}
                  selectedPet={selectedPet}
                  suggestions={homeSuggestions}
                  conversations={conversations.slice(0, 3)}
                  checklist={homeChecklist}
                  pendingApprovalCount={pendingApprovalCount}
                  onStartConversation={startHomeConversation}
                  onSendMessage={sendHomeFirstMessage}
                  onResumeConversation={openConversation}
                  onResolveChecklistItem={(item) => navigate(item.destination)}
                  onOpenApprovals={() =>
                    void invoke('show_pending_approval_window').catch(() =>
                      setToast('Não foi possível abrir a janela de aprovação.'),
                    )
                  }
                />
              )}
              {section === 'providers' && (
                <ProvidersScreen
                  settings={settings}
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
                      setKeySavedForSession(provider.providerId !== 'local');
                  }}
                  onChat={beginChat}
                  onCredentialRemoved={(providerId) => {
                    if (settings.activeProviderId === providerId) setKeySavedForSession(false);
                  }}
                />
              )}
              {section === 'computer' && <ComputerScreen />}
              {section === 'calendar' && <CalendarScreen />}
              {section === 'skills' && (
                <SkillsScreen
                  onOpenPrivacy={() => navigate('permissions')}
                  agentRuntime={{
                    modeEnabled: agentEnabled,
                    available: agentAvailability.available,
                    reason: agentAvailability.reason,
                  }}
                />
              )}
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
                  onOpenPermissions={() => navigate('permissions')}
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
                  onStatus={() => reportDiagnostic('agent_home_status', '')}
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
      <SettingsModal
        open={settingsOpen}
        section={route.settingsSection ?? 'geral'}
        onClose={closeSettings}
        onSelectSection={selectSettingsSection}
        settings={settings}
        update={setSettings}
        profile={profile}
        setProfile={setProfile}
        petVisible={petVisible}
        setPetVisible={setPetVisible}
        selectedPet={selectedPet}
        onSelectPet={(petId) => void choosePet(petId)}
        onError={setToast}
        onDeleteAllHistory={deleteAllConversations}
        onOpenPage={(page) => navigate(page)}
        onOpenActivityFullPage={() => openLegacyScreen('activity')}
        onAgentStatus={() => reportDiagnostic('agent_home_status', '')}
      />
    </div>
  );
}

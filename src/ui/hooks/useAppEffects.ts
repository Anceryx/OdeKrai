import { useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { AI_PROVIDERS } from '../../core/providers';
import type { ChatMessage } from '../../core/provider-messages';
import { profileFromApprovedCore } from '../../core/identity';
import type { useAppState } from './useAppState';
import type { Conversation } from '../screens/types';
import type { ProfileData } from '../Profile';

export function useAppEffects(state: ReturnType<typeof useAppState>) {
  const {
    settings,
    setSelectedPet,
    setPermissionIndicator,
    setToast,
    setProfile,
    setIdentityConfigured,
    setConversations,
    setConversationId,
    setMessages,
    setError,
    toast,
    setKeySavedForSession,
    request,
    companionStateTimer,
  } = state;
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
}

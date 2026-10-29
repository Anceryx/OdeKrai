import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activeProviderSettings,
  loadSettings,
  loadSettingsWithWarnings,
  saveSettings,
  type AppSettings,
} from '../../core/settings';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ChatMessage } from '../../core/provider-messages';
import { DEFAULT_PET_ID } from '../../core/pets';
import type { ProfileData } from '../Profile';
import type { Conversation } from '../screens/types';

export function useAppState() {
  const [initialSettingsLoad] = useState(loadSettingsWithWarnings);
  const [settings, setSettings] = useState<AppSettings>(initialSettingsLoad.settings);
  const [petVisible, setPetVisible] = useState(!isTauri());
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
  const [diagnostics, setDiagnostics] = useState<
    { command: string; message: string; details: string; count: number }[]
  >([]);
  const [chatMode, setChatMode] = useState(false);
  const request = useRef<string | null>(null);
  const companionStateTimer = useRef<number | undefined>(undefined);
  const appliedCloseBehavior = useRef<string | null>(null);
  const reportDiagnostic = useCallback((command: string, message: string, details = '') => {
    setDiagnostics((items) => {
      if (!message) return items.filter((item) => item.command !== command);
      const existing = items.find((item) => item.command === command && item.message === message);
      if (existing) {
        return items.map((item) =>
          item === existing
            ? { ...item, count: item.count + 1, details: details || item.details }
            : item,
        );
      }
      return [...items.slice(-7), { command, message, details, count: 1 }];
    });
  }, []);
  const dismissDiagnostics = useCallback(() => setDiagnostics([]), []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!isTauri()) return;
    if (appliedCloseBehavior.current === settings.closeBehavior) return;
    appliedCloseBehavior.current = settings.closeBehavior;
    const started = performance.now();
    void invoke('record_diagnostic_event', {
      event: 'startup_command_start',
      command: 'set_close_behavior',
      outcome: 'ok',
      durationMs: 0,
    }).catch((error: unknown) => console.warn('[OdeKrai diagnóstico] Falha no log local.', error));
    void invoke('set_close_behavior', {
      minimizeToTray: settings.closeBehavior === 'minimize_to_tray',
    })
      .then(() => {
        void invoke('record_diagnostic_event', {
          event: 'startup_command_finish',
          command: 'set_close_behavior',
          outcome: 'ok',
          durationMs: Math.max(0, Math.round(performance.now() - started)),
        }).catch((error: unknown) =>
          console.warn('[OdeKrai diagnóstico] Falha no log local.', error),
        );
      })
      .catch(() => {
        reportDiagnostic(
          'set_close_behavior',
          'Não foi possível atualizar o comportamento ao fechar.',
        );
        void invoke('record_diagnostic_event', {
          event: 'startup_command_finish',
          command: 'set_close_behavior',
          outcome: 'error',
          durationMs: Math.max(0, Math.round(performance.now() - started)),
        }).catch((error: unknown) =>
          console.warn('[OdeKrai diagnóstico] Falha no log local.', error),
        );
      });
  }, [settings.closeBehavior, reportDiagnostic]);

  useEffect(() => {
    const refreshSettings = () => setSettings(loadSettings());
    window.addEventListener('storage', refreshSettings);
    return () => window.removeEventListener('storage', refreshSettings);
  }, []);

  return {
    initialSettingsLoad,
    settings,
    setSettings,
    petVisible,
    setPetVisible,
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
    diagnostics,
    reportDiagnostic,
    dismissDiagnostics,
    chatMode,
    setChatMode,
    request,
    companionStateTimer,
  };
}

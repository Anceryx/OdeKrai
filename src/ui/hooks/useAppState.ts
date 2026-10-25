import { useEffect, useRef, useState } from 'react';
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
import type { Conversation, Section } from '../screens/types';

export function useAppState() {
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
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke('set_close_behavior', {
      minimizeToTray: settings.closeBehavior === 'minimize_to_tray',
    }).catch(() => setToast('N?o foi poss?vel atualizar o comportamento ao fechar.'));
  }, [settings.closeBehavior]);

  useEffect(() => {
    const refreshSettings = () => setSettings(loadSettings());
    window.addEventListener('storage', refreshSettings);
    return () => window.removeEventListener('storage', refreshSettings);
  }, []);

  return {
    initialSettingsLoad,
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
  };
}

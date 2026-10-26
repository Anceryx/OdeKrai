import soundManifest from './sound-manifest.generated.json';
import { emit } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const SOUND_EVENT_GROUPS = [
  {
    label: 'Pet',
    events: [
      'island_open',
      'island_close',
      'hover',
      'click',
      'wake',
      'sleep',
      'happy',
      'drag_start',
      'drag_end',
      'return_home',
    ],
  },
  {
    label: 'Chat',
    events: ['notification', 'listening_start', 'listening_stop', 'thinking', 'success', 'error'],
  },
  {
    label: 'Segurança',
    events: ['approval_needed', 'action_done', 'halted'],
  },
] as const;
export type SoundEvent = (typeof SOUND_EVENT_GROUPS)[number]['events'][number];
export const SOUND_EVENTS: readonly SoundEvent[] = SOUND_EVENT_GROUPS.flatMap(
  ({ events }) => events,
);
export const RESERVED_SOUND_EVENTS = ['listening_start', 'listening_stop'] as const;
const PET_SOUND_EVENTS = new Set<SoundEvent>(SOUND_EVENT_GROUPS[0].events);
export const SOUND_EVENT_LABELS: Record<SoundEvent, string> = {
  island_open: 'Abertura do pet',
  island_close: 'Fechamento do pet',
  hover: 'Ponteiro sobre o pet',
  click: 'Clique',
  notification: 'Notificação',
  listening_start: 'Início da escuta (reservado)',
  listening_stop: 'Fim da escuta (reservado)',
  thinking: 'Pensando',
  success: 'Sucesso',
  error: 'Erro',
  wake: 'Acordar',
  sleep: 'Pausar',
  happy: 'Alegria',
  drag_start: 'Início do arrasto',
  drag_end: 'Fim do arrasto',
  return_home: 'Voltar ao pet',
  approval_needed: 'Aprovação necessária',
  action_done: 'Ação concluída',
  halted: 'Parada de emergência',
};
export type SoundPreferences = {
  enabled: boolean;
  volume: number;
  replacements: Partial<Record<SoundEvent, string>>;
};

const SOUND_PATH = /^\/sounds\/[a-z0-9_-]+\.(wav|ogg|mp3)$/i;
export const SOUND_MANIFEST = soundManifest.filter((file) => SOUND_PATH.test(file));
const SOUND_FILES = new Set(SOUND_MANIFEST);
const FORMATS = ['wav', 'ogg', 'mp3'] as const;
const EVENT_COOLDOWN_MS: Partial<Record<SoundEvent, number>> = {
  hover: 700,
  click: 120,
  notification: 800,
  thinking: 250,
  approval_needed: 500,
  action_done: 250,
  halted: 1000,
};
const GLOBAL_COOLDOWN_MS = 1000;
const MAX_SOUNDS_PER_WINDOW = 4;
const cache = new Map<string, Promise<AudioBuffer | null>>();
let context: AudioContext | undefined;

export class SoundTriggerGate {
  private readonly claimed = new Set<string>();

  claim(key: string): boolean {
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    if (this.claimed.size > 128) {
      const oldest = this.claimed.values().next().value;
      if (oldest !== undefined) this.claimed.delete(oldest);
    }
    return true;
  }
}

export class SoundLimiter {
  private readonly lastEventAt = new Map<SoundEvent, number>();
  private readonly recentStarts: number[] = [];

  allowEvent(event: SoundEvent, now: number): boolean {
    const cooldownMs = EVENT_COOLDOWN_MS[event] ?? 100;
    const last = this.lastEventAt.get(event);
    if (last !== undefined && now - last < cooldownMs) return false;
    this.lastEventAt.set(event, now);
    return true;
  }

  allowStart(now: number): boolean {
    while (this.recentStarts.length && now - this.recentStarts[0] >= GLOBAL_COOLDOWN_MS) {
      this.recentStarts.shift();
    }
    if (this.recentStarts.length >= MAX_SOUNDS_PER_WINDOW) return false;
    this.recentStarts.push(now);
    return true;
  }
}

const limiter = new SoundLimiter();

export function soundSources(
  event: SoundEvent,
  replacement?: string,
  manifest: readonly string[] = [...SOUND_FILES],
): string[] {
  const available = new Set(manifest.filter((file) => SOUND_PATH.test(file)));
  const defaults = FORMATS.map((extension) => `/sounds/${event}.${extension}`).filter((file) =>
    available.has(file),
  );
  if (replacement && SOUND_PATH.test(replacement) && available.has(replacement)) {
    return [replacement, ...defaults.filter((file) => file !== replacement)];
  }
  return defaults;
}

export async function loadFirstAvailableSound<T>(
  sources: readonly string[],
  load: (source: string) => Promise<T | null>,
): Promise<T | null> {
  for (const source of sources) {
    const result = await load(source);
    if (result) return result;
  }
  return null;
}

export function normalizeSoundPreferences(
  value: Partial<SoundPreferences> | undefined,
): SoundPreferences {
  const replacements: SoundPreferences['replacements'] = {};
  for (const [event, path] of Object.entries(value?.replacements ?? {})) {
    if (
      SOUND_EVENTS.includes(event as SoundEvent) &&
      typeof path === 'string' &&
      SOUND_PATH.test(path) &&
      SOUND_FILES.has(path)
    ) {
      replacements[event as SoundEvent] = path;
    }
  }
  return {
    enabled: value?.enabled !== false,
    volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value!.volume!)) : 0.2,
    replacements,
  };
}

async function loadBuffer(source: string): Promise<AudioBuffer | null> {
  let loading = cache.get(source);
  if (!loading) {
    loading = fetch(source)
      .then(async (response) =>
        response.ok ? context!.decodeAudioData(await response.arrayBuffer()) : null,
      )
      .catch(() => null);
    cache.set(source, loading);
  }
  return loading;
}

export async function playSound(
  event: SoundEvent,
  prefs: SoundPreferences,
  options: { manifest?: readonly string[]; petVisible?: boolean } = {},
): Promise<void> {
  if (!prefs.enabled || prefs.volume <= 0 || typeof window === 'undefined') return;
  if (PET_SOUND_EVENTS.has(event) && options.petVisible === false) return;
  try {
    if (isTauri() && getCurrentWindow().label !== 'main') {
      await emit('sound-request', { event, petVisible: options.petVisible });
      return;
    }
    const sources = soundSources(
      event,
      prefs.replacements[event],
      options.manifest ?? [...SOUND_FILES],
    );
    if (!sources.length) return;
    if (!limiter.allowEvent(event, Date.now())) return;
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
    const buffer = await loadFirstAvailableSound(sources, loadBuffer);
    if (!buffer || !limiter.allowStart(Date.now())) return;
    const node = context.createBufferSource();
    const gain = context.createGain();
    node.buffer = buffer;
    gain.gain.value = prefs.volume;
    node.connect(gain).connect(context.destination);
    node.start();
  } catch {
    // Som indisponível ou bloqueado pelo WebView: a interface continua funcionando em silêncio.
  }
}

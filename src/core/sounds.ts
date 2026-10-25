import soundManifest from './sound-manifest.generated.json';

export const SOUND_EVENTS = [
  'island_open',
  'island_close',
  'hover',
  'click',
  'notification',
  'listening_start',
  'listening_stop',
  'thinking',
  'success',
  'error',
  'wake',
  'sleep',
  'happy',
  'drag_start',
  'drag_end',
  'return_home',
] as const;
export type SoundEvent = (typeof SOUND_EVENTS)[number];
export const SOUND_EVENT_LABELS: Record<SoundEvent, string> = {
  island_open: 'Abertura do pet',
  island_close: 'Fechamento do pet',
  hover: 'Ponteiro sobre o pet',
  click: 'Clique',
  notification: 'Notificação',
  listening_start: 'Início da escuta',
  listening_stop: 'Fim da escuta',
  thinking: 'Pensando',
  success: 'Sucesso',
  error: 'Erro',
  wake: 'Acordar',
  sleep: 'Pausar',
  happy: 'Alegria',
  drag_start: 'Início do arrasto',
  drag_end: 'Fim do arrasto',
  return_home: 'Voltar ao pet',
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
const cooldown = new Map<SoundEvent, number>();
const cache = new Map<string, Promise<AudioBuffer | null>>();
let context: AudioContext | undefined;

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

export async function playSound(event: SoundEvent, prefs: SoundPreferences): Promise<void> {
  if (!prefs.enabled || prefs.volume <= 0 || typeof window === 'undefined') return;
  const now = Date.now();
  const limit = event === 'hover' ? 700 : event === 'thinking' ? 5000 : 100;
  if (now - (cooldown.get(event) ?? 0) < limit) return;
  cooldown.set(event, now);
  try {
    const sources = soundSources(event, prefs.replacements[event]);
    if (!sources.length) return;
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
    const buffer = await loadFirstAvailableSound(sources, loadBuffer);
    if (!buffer) return;
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

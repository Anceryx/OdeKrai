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
export type SoundPreferences = {
  enabled: boolean;
  volume: number;
  replacements: Partial<Record<SoundEvent, string>>;
};
const cooldown = new Map<SoundEvent, number>();
const cache = new Map<string, Promise<AudioBuffer | null>>();
let context: AudioContext | undefined;

export function normalizeSoundPreferences(
  value: Partial<SoundPreferences> | undefined,
): SoundPreferences {
  const replacements: SoundPreferences['replacements'] = {};
  for (const [event, path] of Object.entries(value?.replacements ?? {})) {
    if (
      SOUND_EVENTS.includes(event as SoundEvent) &&
      typeof path === 'string' &&
      /^\/sounds\/[a-z0-9_-]+\.(wav|mp3|ogg)$/i.test(path)
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

export async function playSound(event: SoundEvent, prefs: SoundPreferences): Promise<void> {
  if (!prefs.enabled || prefs.volume <= 0 || typeof window === 'undefined') return;
  const now = Date.now();
  const limit = event === 'hover' ? 700 : event === 'thinking' ? 5000 : 100;
  if (now - (cooldown.get(event) ?? 0) < limit) return;
  cooldown.set(event, now);
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
    const candidate = prefs.replacements[event];
    const source =
      candidate && /^\/sounds\/[a-z0-9_-]+\.(wav|mp3|ogg)$/i.test(candidate)
        ? candidate
        : `/sounds/${event}.wav`;
    let loading = cache.get(source);
    if (!loading) {
      loading = fetch(source)
        .then(async (response) =>
          response.ok ? context!.decodeAudioData(await response.arrayBuffer()) : null,
        )
        .catch(() => null);
      cache.set(source, loading);
    }
    const buffer = await loading;
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

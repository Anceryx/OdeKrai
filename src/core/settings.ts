import { normalizeSoundPreferences } from './sounds';
import { AI_PROVIDERS, type ProviderAuthMode } from './providers';

export type ProviderSettings = {
  providerId: string;
  name: string;
  baseUrl: string;
  model: string;
  authMode: ProviderAuthMode;
  region?: string;
};

export type AppSettings = {
  language: 'pt-BR' | 'en';
  reduceMotion: boolean;
  provider: ProviderSettings;
  companion: {
    enabled: boolean;
    position: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
    size: number;
    alwaysOnTop: boolean;
    openOnHover: boolean;
    collapseSeconds: number;
    coordinates: { x: number; y: number } | null;
    freeMode: boolean;
    desktopCoordinates: { x: number; y: number } | null;
    sounds: {
      enabled: boolean;
      volume: number;
      replacements: Partial<Record<import('./sounds').SoundEvent, string>>;
    };
  };
};

const STORAGE_KEY = 'odekrai.settings.v1';

export const defaultSettings: AppSettings = {
  language: 'pt-BR',
  reduceMotion: false,
  provider: {
    providerId: 'openai',
    name: 'OpenAI compatível',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    authMode: 'bearer',
  },
  companion: {
    enabled: false,
    position: 'bottom-right',
    size: 1,
    alwaysOnTop: true,
    openOnHover: false,
    collapseSeconds: 15,
    coordinates: null,
    freeMode: false,
    desktopCoordinates: null,
    sounds: { enabled: true, volume: 0.2, replacements: {} },
  },
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const value: unknown = JSON.parse(raw);
    if (!isAppSettings(value)) return defaultSettings;
    const companion =
      value.companion && typeof value.companion === 'object'
        ? (value.companion as Partial<AppSettings['companion']>)
        : {};
    const position = ['top-right', 'bottom-right', 'top-left', 'bottom-left'].includes(
      String(companion.position),
    )
      ? companion.position!
      : defaultSettings.companion.position;
    const coordinates =
      companion.coordinates &&
      Number.isFinite(companion.coordinates.x) &&
      Number.isFinite(companion.coordinates.y) &&
      Math.abs(companion.coordinates.x) <= 100_000 &&
      Math.abs(companion.coordinates.y) <= 100_000
        ? { x: companion.coordinates.x, y: companion.coordinates.y }
        : null;
    const desktopCoordinates =
      companion.desktopCoordinates &&
      Number.isFinite(companion.desktopCoordinates.x) &&
      Number.isFinite(companion.desktopCoordinates.y) &&
      Math.abs(companion.desktopCoordinates.x) <= 100_000 &&
      Math.abs(companion.desktopCoordinates.y) <= 100_000
        ? { x: companion.desktopCoordinates.x, y: companion.desktopCoordinates.y }
        : null;
    return {
      ...defaultSettings,
      ...value,
      provider: {
        ...defaultSettings.provider,
        ...value.provider,
        providerId: AI_PROVIDERS.some((provider) => provider.id === value.provider.providerId)
          ? value.provider.providerId
          : (AI_PROVIDERS.find((provider) => provider.name === value.provider.name)?.id ??
            'openai'),
        authMode: value.provider.authMode === 'api-key' ? 'api-key' : 'bearer',
      },
      companion: {
        ...defaultSettings.companion,
        ...value.companion,
        enabled: typeof companion.enabled === 'boolean' ? companion.enabled : false,
        position,
        size: Number.isFinite(companion.size) ? Math.max(0.75, Math.min(1.5, companion.size!)) : 1,
        alwaysOnTop: typeof companion.alwaysOnTop === 'boolean' ? companion.alwaysOnTop : true,
        openOnHover: typeof companion.openOnHover === 'boolean' ? companion.openOnHover : false,
        collapseSeconds: [8, 15, 30, 60].includes(Number(companion.collapseSeconds))
          ? Number(companion.collapseSeconds)
          : 15,
        coordinates,
        freeMode: typeof companion.freeMode === 'boolean' ? companion.freeMode : false,
        desktopCoordinates,
        sounds: normalizeSoundPreferences(companion.sounds),
      },
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): boolean {
  // Deliberately persist preferences only. API keys must never enter localStorage.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

function isAppSettings(value: unknown): value is AppSettings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppSettings>;
  return (
    (candidate.language === 'pt-BR' || candidate.language === 'en') &&
    typeof candidate.reduceMotion === 'boolean' &&
    !!candidate.provider &&
    typeof candidate.provider.baseUrl === 'string' &&
    typeof candidate.provider.model === 'string' &&
    typeof candidate.provider.name === 'string'
  );
}

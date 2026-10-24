import { normalizeSoundPreferences } from './sounds';
import { AI_PROVIDERS, providerById, type ProviderAuthMode } from './providers';

export type ProviderSettings = {
  providerId: string;
  name: string;
  baseUrl: string;
  model: string;
  authMode: ProviderAuthMode;
  region?: string;
  lastTest?: { status: 'passed' | 'failed' | 'partial'; at: string; message: string };
};

export type AppSettings = {
  language: 'pt-BR' | 'en';
  reduceMotion: boolean;
  activeProviderId: string;
  providers: Record<string, ProviderSettings>;
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

const STORAGE_KEY = 'odekrai.settings.v2';
const LEGACY_STORAGE_KEY = 'odekrai.settings.v1';

export function defaultProviderSettings(providerId: string): ProviderSettings {
  const provider = providerById(providerId) ?? AI_PROVIDERS[0];
  return {
    providerId: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl ?? '',
    model: '',
    authMode: provider.authMode,
    region: provider.region ? 'us-east-1' : undefined,
  };
}

export function activeProviderSettings(settings: AppSettings): ProviderSettings {
  return (
    settings.providers[settings.activeProviderId] ??
    defaultProviderSettings(settings.activeProviderId)
  );
}

export const defaultSettings: AppSettings = {
  language: 'pt-BR',
  reduceMotion: false,
  activeProviderId: 'openai',
  providers: {},
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
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
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
    const legacy = 'provider' in value ? (value.provider as Partial<ProviderSettings>) : undefined;
    const oldId =
      legacy && typeof legacy === 'object'
        ? typeof legacy.providerId === 'string' && providerById(legacy.providerId)
          ? legacy.providerId
          : (AI_PROVIDERS.find((provider) => provider.name === legacy.name)?.id ?? 'openai')
        : undefined;
    const rawProviders =
      'providers' in value && value.providers && typeof value.providers === 'object'
        ? (value.providers as Record<string, unknown>)
        : {};
    const providers: Record<string, ProviderSettings> = {};
    for (const provider of AI_PROVIDERS) {
      const candidate = rawProviders[provider.id];
      if (candidate && typeof candidate === 'object') {
        const saved = candidate as Partial<ProviderSettings>;
        providers[provider.id] = {
          ...defaultProviderSettings(provider.id),
          baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : (provider.baseUrl ?? ''),
          model: typeof saved.model === 'string' ? saved.model : '',
          region: typeof saved.region === 'string' ? saved.region : undefined,
          lastTest: validTest(saved.lastTest) ? saved.lastTest : undefined,
        };
      }
    }
    if (oldId && legacy && !providers[oldId]) {
      providers[oldId] = {
        ...defaultProviderSettings(oldId),
        baseUrl: typeof legacy.baseUrl === 'string' ? legacy.baseUrl : '',
        model: typeof legacy.model === 'string' ? legacy.model : '',
        region: typeof legacy.region === 'string' ? legacy.region : undefined,
      };
    }
    const activeProviderId =
      'activeProviderId' in value &&
      typeof value.activeProviderId === 'string' &&
      providerById(value.activeProviderId)
        ? value.activeProviderId
        : (oldId ?? 'openai');
    const migrated = { ...value } as Record<string, unknown>;
    delete migrated.provider;
    return {
      ...defaultSettings,
      ...migrated,
      activeProviderId,
      providers,
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
  const candidate = value as Partial<AppSettings> & { provider?: Partial<ProviderSettings> };
  return (
    (candidate.language === 'pt-BR' || candidate.language === 'en') &&
    typeof candidate.reduceMotion === 'boolean' &&
    ((!!candidate.providers && typeof candidate.providers === 'object') ||
      (!!candidate.provider &&
        typeof candidate.provider.baseUrl === 'string' &&
        typeof candidate.provider.model === 'string' &&
        typeof candidate.provider.name === 'string'))
  );
}

function validTest(value: unknown): value is ProviderSettings['lastTest'] {
  if (!value || typeof value !== 'object') return false;
  const test = value as ProviderSettings['lastTest'];
  return (
    ['passed', 'failed', 'partial'].includes(test?.status ?? '') &&
    typeof test?.at === 'string' &&
    typeof test?.message === 'string'
  );
}

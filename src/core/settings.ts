export type ProviderSettings = {
  name: string;
  baseUrl: string;
  model: string;
};

export type AppSettings = {
  language: 'pt-BR' | 'en';
  reduceMotion: boolean;
  provider: ProviderSettings;
};

const STORAGE_KEY = 'odekrai.settings.v1';

export const defaultSettings: AppSettings = {
  language: 'pt-BR',
  reduceMotion: false,
  provider: {
    name: 'OpenAI compatível',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const value: unknown = JSON.parse(raw);
    if (!isAppSettings(value)) return defaultSettings;
    return {
      ...defaultSettings,
      ...value,
      provider: { ...defaultSettings.provider, ...value.provider },
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

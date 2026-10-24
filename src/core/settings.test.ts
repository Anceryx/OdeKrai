import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from './settings';

describe('preferências persistidas', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('migra preferências antigas preenchendo valores padrão do Companion', () => {
    const storage = new Map<string, string>();
    storage.set(
      'odekrai.settings.v1',
      JSON.stringify({
        language: 'pt-BR',
        reduceMotion: true,
        provider: { name: 'Local', baseUrl: 'http://localhost:11434/v1', model: 'local' },
      }),
    );
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const migrated = loadSettings();
    expect(migrated.companion).toMatchObject({
      enabled: false,
      position: 'bottom-right',
      sounds: { enabled: true },
    });
    expect(migrated.providers.openai.authMode).toBe('bearer');
    expect(migrated.providers.openai.providerId).toBe('openai');
    expect(migrated.providers.openai.baseUrl).toBe('http://localhost:11434/v1');
    expect(migrated.providers.openai.model).toBe('local');
    saveSettings(migrated);
    expect(JSON.parse(storage.get('odekrai.settings.v2') ?? '{}')).not.toHaveProperty('provider');
  });

  it('salva somente preferências e recupera a posição da ilha', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const settings = loadSettings();
    settings.companion.coordinates = { x: 120, y: 240 };
    settings.companion.freeMode = true;
    settings.companion.desktopCoordinates = { x: 410, y: 80 };
    expect(saveSettings(settings)).toBe(true);
    expect(loadSettings().companion.coordinates).toEqual({ x: 120, y: 240 });
    expect(loadSettings().companion).toMatchObject({
      freeMode: true,
      desktopCoordinates: { x: 410, y: 80 },
    });
    expect(storage.get('odekrai.settings.v2')).not.toContain('apiKey');
    expect(storage.get('odekrai.settings.v2')).not.toContain('chave');
  });

  it('migra o ID pelo nome antigo e preserva um ID válido quando o nome muda', () => {
    let value = JSON.stringify({
      language: 'pt-BR',
      reduceMotion: false,
      provider: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude' },
    });
    vi.stubGlobal('localStorage', { getItem: () => value, setItem: () => undefined });
    expect(loadSettings().providers.anthropic.providerId).toBe('anthropic');
    expect(loadSettings().providers.anthropic.authMode).toBe('x-api-key');
    value = JSON.stringify({
      language: 'pt-BR',
      reduceMotion: false,
      provider: {
        providerId: 'anthropic',
        name: 'Nome alterado',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude',
      },
    });
    expect(loadSettings().providers.anthropic.providerId).toBe('anthropic');
  });

  it('mantém endpoints e modelos independentes ao trocar de provedor', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const settings = loadSettings();
    settings.providers.groq = {
      providerId: 'groq',
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      authMode: 'bearer',
    };
    settings.activeProviderId = 'groq';
    saveSettings(settings);
    const loaded = loadSettings();
    expect(loaded.activeProviderId).toBe('groq');
    expect(loaded.providers.groq.model).toBe('llama-3.3-70b-versatile');
    expect(loaded.providers.openai).toBeUndefined();
  });
});

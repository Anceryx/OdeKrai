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
    expect(loadSettings().companion).toMatchObject({
      enabled: false,
      position: 'bottom-right',
      sounds: { enabled: true },
    });
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
    expect(storage.get('odekrai.settings.v1')).not.toContain('apiKey');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('carregamento de sons', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mantém ausência de arquivo silenciosa e reutiliza o resultado em cache', async () => {
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    class FakeAudioContext {
      state = 'running';
      destination = {};
      createGain() {
        return { gain: { value: 1 }, connect: vi.fn() };
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Date, 'now').mockReturnValueOnce(10_000).mockReturnValueOnce(11_000);
    const { normalizeSoundPreferences, playSound } = await import('./sounds');
    const preferences = normalizeSoundPreferences({ enabled: true, volume: 0.2 });

    await expect(playSound('notification', preferences)).resolves.toBeUndefined();
    await expect(playSound('notification', preferences)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não carrega arquivos quando o som está desativado ou sem volume', async () => {
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', fetchMock);
    const { normalizeSoundPreferences, playSound } = await import('./sounds');
    await playSound('click', normalizeSoundPreferences({ enabled: false }));
    await playSound('click', normalizeSoundPreferences({ volume: 0 }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

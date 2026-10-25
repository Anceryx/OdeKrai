import { afterEach, describe, expect, it, vi } from 'vitest';

describe('carregamento de sons', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('memoriza falhas de carregamento e mantém a ausência de som silenciosa', async () => {
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

    await expect(playSound('error', preferences)).resolves.toBeUndefined();
    await expect(playSound('error', preferences)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolve os formatos existentes em ordem WAV, OGG e MP3', async () => {
    const { soundSources, loadFirstAvailableSound } = await import('./sounds');
    const attempted: string[] = [];
    const loaded = await loadFirstAvailableSound(
      ['/sounds/success.wav', '/sounds/success.ogg', '/sounds/success.mp3'],
      async (source) => {
        attempted.push(source);
        return source.endsWith('.ogg') ? 'decoded' : null;
      },
    );
    expect(loaded).toBe('decoded');
    expect(attempted).toEqual(['/sounds/success.wav', '/sounds/success.ogg']);
    expect(
      soundSources('success', undefined, [
        '/sounds/success.mp3',
        '/sounds/success.ogg',
        '/sounds/success.wav',
      ]),
    ).toEqual(['/sounds/success.wav', '/sounds/success.ogg', '/sounds/success.mp3']);
  });

  it('usa a substituição salva antes dos formatos padrão disponíveis', async () => {
    const { soundSources } = await import('./sounds');
    expect(
      soundSources('success', '/sounds/hover.ogg', ['/sounds/hover.ogg', '/sounds/success.wav']),
    ).toEqual(['/sounds/hover.ogg', '/sounds/success.wav']);
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

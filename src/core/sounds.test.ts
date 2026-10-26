import { afterEach, describe, expect, it, vi } from 'vitest';

describe('carregamento de sons', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lista todos os eventos por grupo e mantém a escuta reservada', async () => {
    const { RESERVED_SOUND_EVENTS, SOUND_EVENT_GROUPS, SOUND_EVENTS } = await import('./sounds');
    expect(SOUND_EVENTS).toHaveLength(19);
    expect(new Set(SOUND_EVENTS).size).toBe(SOUND_EVENTS.length);
    expect(SOUND_EVENT_GROUPS.map(({ label }) => label)).toEqual(['Pet', 'Chat', 'Segurança']);
    expect(RESERVED_SOUND_EVENTS).toEqual(['listening_start', 'listening_stop']);
    expect(SOUND_EVENTS).toEqual(
      expect.arrayContaining(['approval_needed', 'action_done', 'halted']),
    );
    expect(SOUND_EVENTS).toEqual(SOUND_EVENT_GROUPS.flatMap(({ events }) => events));
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

  it('não falha nem tenta carregar quando o evento não tem arquivo', async () => {
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', fetchMock);
    const { normalizeSoundPreferences, playSound } = await import('./sounds');
    await expect(
      playSound('action_done', normalizeSoundPreferences({}), { manifest: [] }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não carrega arquivos quando o som está desativado ou sem volume', async () => {
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', fetchMock);
    const { normalizeSoundPreferences, playSound } = await import('./sounds');
    await playSound('click', normalizeSoundPreferences({ enabled: false }));
    await playSound('click', normalizeSoundPreferences({ volume: 0 }));
    await playSound('click', normalizeSoundPreferences({}), {
      manifest: ['/sounds/click.ogg'],
      petVisible: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aplica cooldown por evento e limite global de quatro inícios por segundo', async () => {
    const { SoundLimiter } = await import('./sounds');
    const limiter = new SoundLimiter();
    expect(limiter.allowEvent('click', 1000)).toBe(true);
    expect(limiter.allowEvent('click', 1119)).toBe(false);
    expect(limiter.allowEvent('click', 1120)).toBe(true);

    for (let index = 0; index < 4; index += 1) {
      expect(limiter.allowStart(2000)).toBe(true);
    }
    expect(limiter.allowStart(2000)).toBe(false);
    expect(limiter.allowStart(2999)).toBe(false);
    expect(limiter.allowStart(3000)).toBe(true);
  });

  it('permite apenas um disparo por chave de mensagem ou aprovação', async () => {
    const { SoundTriggerGate } = await import('./sounds');
    const gate = new SoundTriggerGate();
    expect(gate.claim('message-1')).toBe(true);
    expect(gate.claim('message-1')).toBe(false);
    expect(gate.claim('message-2')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { initialIslandSnapshot, transitionIsland } from './island';
import { normalizeSoundPreferences } from './sounds';

describe('máquina de estados do Companion', () => {
  it('abre, recebe estados reais e fecha', () => {
    const open = transitionIsland(initialIslandSnapshot, { type: 'open' }, 10);
    expect(open.state).toBe('expanded');
    const busy = transitionIsland(
      open,
      { type: 'activity', state: 'thinking', message: 'Aguardando resposta' },
      20,
    );
    expect(busy).toMatchObject({ state: 'thinking', message: 'Aguardando resposta' });
    expect(transitionIsland(busy, { type: 'close' }, 30).state).toBe('retracted');
  });

  it('protege erros de uma interrupção de menor prioridade', () => {
    const error = transitionIsland(initialIslandSnapshot, { type: 'activity', state: 'error' }, 10);
    expect(transitionIsland(error, { type: 'activity', state: 'thinking' }, 20).state).toBe(
      'error',
    );
  });

  it('normaliza volume, mute e preferências incompletas', () => {
    expect(normalizeSoundPreferences({ volume: 4 })).toMatchObject({
      enabled: true,
      volume: 1,
      replacements: {},
    });
    expect(normalizeSoundPreferences({ enabled: false, volume: -1 }).enabled).toBe(false);
    expect(normalizeSoundPreferences({ volume: -1 }).volume).toBe(0);
  });

  it('aceita substituições locais e descarta URLs e caminhos fora da pasta de sons', () => {
    expect(
      normalizeSoundPreferences({
        replacements: {
          hover: '/sounds/hover.ogg',
          error: 'https://example.test/sound.wav',
          success: '/outside/ok.wav',
        },
      }).replacements,
    ).toEqual({ hover: '/sounds/hover.ogg' });
  });
});

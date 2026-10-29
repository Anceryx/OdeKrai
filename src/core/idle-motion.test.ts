import { describe, expect, it } from 'vitest';
import { canAnimateIdle, idleCue, idleCueDelay } from './idle-motion';

describe('animação ociosa da ilha', () => {
  it('só permite dicas quando habilitadas, visíveis e em repouso', () => {
    expect(canAnimateIdle({ enabled: true, visible: true, idle: true })).toBe(true);
    expect(canAnimateIdle({ enabled: false, visible: true, idle: true })).toBe(false);
    expect(canAnimateIdle({ enabled: true, visible: false, idle: true })).toBe(false);
    expect(canAnimateIdle({ enabled: true, visible: true, idle: false })).toBe(false);
  });

  it('espaça as dicas por 4,5 a 8,5 segundos e escolhe apenas movimentos sutis', () => {
    expect(idleCueDelay(0)).toBe(4500);
    expect(idleCueDelay(1)).toBe(8499);
    expect(idleCue(0.2)).toBe('blink');
    expect(idleCue(0.7)).toBe('gaze-left');
    expect(idleCue(0.9)).toBe('gaze-right');
  });
});

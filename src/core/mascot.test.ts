import { describe, expect, it } from 'vitest';
import { initialIslandSnapshot, transitionIsland } from './island';
import {
  MASCOT_EXPRESSIONS,
  evaluateMascotMotion,
  expressionForIslandState,
  getFacePose,
  interpolateFacePose,
  motionForExpression,
} from './mascot';

describe('expressões e movimentos do ODEKRAI', () => {
  it('registra dezesseis poses procedurais identificáveis', () => {
    expect(MASCOT_EXPRESSIONS).toHaveLength(16);
    const signatures = new Set(
      MASCOT_EXPRESSIONS.map((expression) => JSON.stringify(getFacePose(expression))),
    );
    expect(signatures.size).toBe(16);
  });

  it('mapeia os estados reais da ilha para expressões do mascote', () => {
    const thinking = transitionIsland(initialIslandSnapshot, {
      type: 'activity',
      state: 'thinking',
    });
    const responding = transitionIsland(thinking, {
      type: 'activity',
      state: 'responding',
    });
    const failed = transitionIsland(responding, { type: 'activity', state: 'error' });
    expect(expressionForIslandState(thinking.state)).toBe('thinking');
    expect(expressionForIslandState(responding.state)).toBe('talking');
    expect(expressionForIslandState(failed.state)).toBe('error');
    expect(expressionForIslandState('completed')).toBe('happy');
  });

  it('interpolate formas sem saltos numéricos', () => {
    const from = getFacePose('sleeping');
    const to = getFacePose('surprised');
    const middle = interpolateFacePose(from, to, 0.5);
    expect(middle.openness).toBeCloseTo((from.openness + to.openness) / 2);
    expect(interpolateFacePose(from, to, 0).openness).toBe(from.openness);
    expect(interpolateFacePose(from, to, 1).openness).toBe(to.openness);
  });

  it('mantém piscadas breves e aplica movimento reduzido', () => {
    expect(evaluateMascotMotion(0.12, 'idle', false, 'blink').blink).toBeLessThan(0.1);
    expect(evaluateMascotMotion(0.4, 'idle', false, 'blink').blink).toBeCloseTo(1);
    const reduced = evaluateMascotMotion(1, 'happy', true, 'happy');
    expect(reduced).toMatchObject({ bob: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1 });
    expect(motionForExpression('sleeping')).toBe('sleep');
    expect(evaluateMascotMotion(1, 'sleeping').blink).toBe(0);
  });
});

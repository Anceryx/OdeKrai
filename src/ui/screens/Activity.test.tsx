import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActivityScreen } from './Activity';

describe('ActivityScreen', () => {
  it('monta a tela de atividade', () => {
    expect(renderToStaticMarkup(<ActivityScreen />)).toContain('security-page');
  });
});

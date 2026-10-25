import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renderiza um ícone Phosphor decorativo com o tamanho solicitado', () => {
    const markup = renderToStaticMarkup(<Icon name="home" size={20} />);
    expect(markup).toContain('width="20"');
    expect(markup).toContain('height="20"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('fill="currentColor"');
  });

  it('usa uma alternativa segura para nomes desconhecidos', () => {
    const fallback = renderToStaticMarkup(<Icon name="desconhecido" />);
    const help = renderToStaticMarkup(<Icon name="help" />);
    expect(fallback).toBe(help);
    expect(fallback).toContain('width="16"');
  });
});

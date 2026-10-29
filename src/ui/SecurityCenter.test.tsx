import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SecurityCenter } from './SecurityCenter';

describe('SecurityCenter embutido', () => {
  it('oferece a rota legada de atividade em tela completa', () => {
    const markup = renderToStaticMarkup(
      <SecurityCenter page="activity" embedded onOpenFullPage={vi.fn()} />,
    );
    expect(markup).toContain('Abrir tela completa');
    expect(markup).not.toContain('SEGURANÇA LOCAL');
  });

  it('não mostra a ação de tela completa fora do modo embutido', () => {
    const markup = renderToStaticMarkup(
      <SecurityCenter page="activity" onOpenFullPage={vi.fn()} />,
    );
    expect(markup).not.toContain('Abrir tela completa');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessageMarkdown } from './MessageMarkdown';

describe('links nas respostas', () => {
  it('mostra o domínio real de links com rótulo diferente e o endereço no título', () => {
    const markup = renderToStaticMarkup(
      <MessageMarkdown
        text="[Entrar](https://trusted.example.evil.example/path)"
        onOpenLink={vi.fn()}
      />,
    );
    expect(markup).toContain('title="https://trusted.example.evil.example/path"');
    expect(markup).toContain('(trusted.example.evil.example)');
    expect(markup).toContain('role="link"');
  });

  it('não cria controles clicáveis para esquemas proibidos', () => {
    const markup = renderToStaticMarkup(
      <MessageMarkdown text="[abrir](javascript:alert(1))" onOpenLink={vi.fn()} />,
    );
    expect(markup).not.toContain('role="link"');
    expect(markup).toContain('javascript:alert(1)');
  });
});

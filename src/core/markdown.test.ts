import { describe, expect, it } from 'vitest';
import {
  externalLinkDomain,
  normalizeTrustedLinkDomain,
  parseMarkdown,
  safeMarkdownUrl,
} from './markdown';

describe('markdown de respostas', () => {
  it('renderiza negrito, listas, links e blocos de código como estruturas seguras', () => {
    expect(
      parseMarkdown(
        '**Olá**\n\n- um\n- dois\n\n1. três\n2. quatro\n\n[site](https://example.com)\n\n```ts\nconst n = 1\n```',
      ),
    ).toEqual([
      { type: 'paragraph', lines: [[{ type: 'strong', text: 'Olá' }]] },
      { type: 'list', items: [[{ type: 'text', text: 'um' }], [{ type: 'text', text: 'dois' }]] },
      {
        type: 'ordered-list',
        items: [[{ type: 'text', text: 'três' }], [{ type: 'text', text: 'quatro' }]],
      },
      {
        type: 'paragraph',
        lines: [[{ type: 'link', text: 'site', href: 'https://example.com/' }]],
      },
      { type: 'code', text: 'const n = 1' },
    ]);
  });

  it('mantém HTML bruto como texto e rejeita esquemas de link executáveis', () => {
    const raw = '<img src=x onerror=alert(1)> [abrir](javascript:alert(1))';
    const blocks = parseMarkdown(raw);
    const nodes = blocks.flatMap((block) => (block.type === 'paragraph' ? block.lines.flat() : []));
    expect(nodes.every((node) => node.type === 'text')).toBe(true);
    expect(nodes.map((node) => node.text).join('')).toBe(raw);
  });

  it('torna URLs soltas clicáveis e mantém pontuação fora do destino', () => {
    expect(parseMarkdown('Veja https://example.com/docs. e mailto:ana@example.com!')[0]).toEqual({
      type: 'paragraph',
      lines: [
        [
          { type: 'text', text: 'Veja ' },
          { type: 'link', text: 'https://example.com/docs', href: 'https://example.com/docs' },
          { type: 'text', text: '. e ' },
          { type: 'link', text: 'mailto:ana@example.com', href: 'mailto:ana@example.com' },
          { type: 'text', text: '!' },
        ],
      ],
    });
  });

  it('rejeita esquemas, credenciais de host, controles e revela o domínio real', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///C:/secret.txt',
      'https://trusted.example@evil.example',
      'https://exa\u0000mple.com',
      'https://exa\nmple.com',
      'https:\\\\evil.example',
      'mailto:me@example.com?subject=a%0d%0aBcc%3Dx%40evil.com',
    ])
      expect(safeMarkdownUrl(value)).toBeNull();

    expect(externalLinkDomain('https://trusted.example.evil.example')).toBe(
      'trusted.example.evil.example',
    );
    expect(normalizeTrustedLinkDomain('Example.com')).toBe('example.com');
    expect(normalizeTrustedLinkDomain('example.com/path')).toBeNull();
  });
});

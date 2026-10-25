import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

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
});

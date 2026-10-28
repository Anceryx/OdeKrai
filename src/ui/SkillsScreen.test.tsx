import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SkillsScreen } from './SkillsScreen';

describe('tela de habilidades', () => {
  it('mantém pesquisa acessível por teclado e anuncia resultado e estado vazio', () => {
    const markup = renderToStaticMarkup(<SkillsScreen />);
    expect(markup).toContain('type="search"');
    expect(markup).toContain('for="skills-search"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Nenhuma capacidade corresponde à pesquisa.');
    expect(markup).toContain('Captura de tela: indisponível');
  });

  it('expõe grupos, integração indisponível e detalhes nativos por teclado/leitor de tela', () => {
    const markup = renderToStaticMarkup(<SkillsScreen />);
    const source = readFileSync(new URL('./SkillsScreen.tsx', import.meta.url), 'utf8');
    expect(markup).toContain('Habilidades locais');
    expect(markup).toContain('Integrações');
    expect(markup).toContain('Servidores MCP: indisponíveis');
    expect(markup).toContain('aria-live="polite"');
    expect(source).toContain('<details className="skill-advanced">');
    expect(source).toContain('<summary>Detalhes avançados e permissões</summary>');
  });

  it('mantém uma coluna em telas estreitas', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /@media \(max-width: 850px\)[\s\S]*?\.skill-card\s*\{\s*grid-template-columns: 1fr;/,
    );
  });
});

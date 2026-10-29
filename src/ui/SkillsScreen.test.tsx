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

  it('expõe grupos, cadastro MCP confirmado e detalhes nativos por teclado/leitor de tela', () => {
    const markup = renderToStaticMarkup(<SkillsScreen />);
    const source = readFileSync(new URL('./SkillsScreen.tsx', import.meta.url), 'utf8');
    expect(markup).toContain('Habilidades locais');
    expect(markup).toContain('Integrações');
    expect(markup).toContain('Integrações (MCP)');
    expect(markup).toContain('este programa roda no seu computador com os seus privilégios');
    expect(markup).toContain('Comando completo que será executado');
    expect(source).toContain('mcp_test_connection');
    expect(source).toContain('mcp_set_secret');
    expect(source).not.toContain("invoke('tools_call'");
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

  it('apresenta a conexão OAuth Google sem fixar escopos de APIs', () => {
    const markup = renderToStaticMarkup(<SkillsScreen />);
    const source = readFileSync(new URL('./SkillsScreen.tsx', import.meta.url), 'utf8');
    expect(markup).toContain('Integração OAuth do Google');
    expect(markup).toContain('Client ID do cliente OAuth para computador');
    expect(markup).toContain('Client secret (opcional)');
    expect(markup).toContain('Escopos informados pela integração consumidora');
    expect(source).toContain("invoke<GoogleOAuthStatus>('google_oauth_connect'");
    expect(source).toContain("invoke('google_oauth_disconnect')");
    expect(source).toContain("setGoogleClientSecret('')");
  });
});

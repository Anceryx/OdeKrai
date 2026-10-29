import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SkillsScreen } from './SkillsScreen';

describe('tela de habilidades', () => {
  it('mantém pesquisa acessível por teclado e anuncia resultado e estado vazio', () => {
    const markup = renderToStaticMarkup(<SkillsScreen onOpenPrivacy={() => undefined} />);
    expect(markup).toContain('type="search"');
    expect(markup).toContain('for="skills-search"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Nenhuma capacidade corresponde à pesquisa.');
    expect(markup).toContain('Captura de tela: indisponível');
  });

  it('expõe grupos, resumo de acessos e detalhes nativos por teclado/leitor de tela', () => {
    const markup = renderToStaticMarkup(<SkillsScreen onOpenPrivacy={() => undefined} />);
    const source = readFileSync(new URL('./SkillsScreen.tsx', import.meta.url), 'utf8');
    expect(markup).toContain('Habilidades locais');
    expect(markup).toContain('Integrações');
    expect(markup).toContain('Acessos e integrações');
    expect(markup).toContain('Abrir Privacidade e permissões');
    expect(markup).not.toContain('Adicionar servidor local');
    expect(source).not.toContain('mcp_test_connection');
    expect(source).not.toContain('mcp_set_secret');
    expect(source).not.toContain("invoke('tools_call'");
    expect(markup).toContain('aria-live="polite"');
    expect(source).toContain('<details className="skill-advanced">');
    expect(source).toContain('<summary>Detalhes avançados e permissões</summary>');
    expect(source).toContain('<PrivacyConfigurationSummary onOpen={onOpenPrivacy} />');
  });

  it('mantém uma coluna em telas estreitas', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /@media \(max-width: 850px\)[\s\S]*?\.skill-card\s*\{\s*grid-template-columns: 1fr;/,
    );
  });

  it('apresenta a conexão Google sem fixar os acessos solicitados', () => {
    const markup = renderToStaticMarkup(<SkillsScreen onOpenPrivacy={() => undefined} />);
    const source = readFileSync(new URL('./SkillsScreen.tsx', import.meta.url), 'utf8');
    expect(markup).toContain('Conexão com o Google');
    expect(markup).toContain('Identificador do cliente Google');
    expect(markup).toContain('Chave opcional do cliente Google');
    expect(markup).toContain('Acessos solicitados pelo recurso que você vai usar');
    expect(source).toContain("invoke<GoogleOAuthStatus>('google_oauth_connect'");
    expect(source).toContain("invoke('google_oauth_disconnect')");
    expect(source).toContain("setGoogleClientSecret('')");
  });
});

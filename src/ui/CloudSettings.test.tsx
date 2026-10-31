import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CloudSettings } from './CloudSettings';

describe('seção informativa de nuvem', () => {
  const markup = renderToStaticMarkup(<CloudSettings />);

  it('explica que não há execução nem conexão de conta nesta versão e informa os controles futuros', () => {
    expect(markup).toContain('A execução na nuvem ainda não está disponível');
    expect(markup).toContain('nenhuma conta de serviço em nuvem é conectada');
    expect(markup).toContain('cada ação remota exigirá aprovação e terá limites de gasto');
  });

  it('apresenta as duas listas e marca todos os serviços apenas como planejados', () => {
    expect(markup).toContain('Nuvens brasileiras');
    expect(markup).toContain('Nuvens internacionais');
    expect(markup).toContain('Magalu Cloud');
    expect(markup).toContain('Locaweb');
    expect(markup).toContain('UOL Host');
    expect(markup).toContain('Amazon Web Services');
    expect(markup).toContain('Google Cloud');
    expect(markup).toContain('Microsoft Azure');
    expect(markup).toContain('Oracle Cloud');
    expect(markup.match(/Planejado/g)).toHaveLength(7);
    expect(markup).not.toMatch(/compatível|disponível como integração/i);
  });

  it('usa links oficiais sem parâmetros de rastreamento e não apresenta botão de conexão', () => {
    const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toHaveLength(7);
    for (const href of hrefs) {
      const url = new URL(href);
      expect(url.protocol).toBe('https:');
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
      expect(url.href).not.toContain('utm_source=');
    }
    expect(markup).not.toContain('<button');
    expect(markup).not.toMatch(/Conectar|Criar conta|Vincular/i);
  });
});

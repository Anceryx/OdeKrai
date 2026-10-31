import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CloudSettings } from './CloudSettings';

describe('seção informativa de nuvem', () => {
  const markup = renderToStaticMarkup(<CloudSettings />);
  const savedMarkup = renderToStaticMarkup(<CloudSettings initialTokenSaved />);
  const connectedMarkup = renderToStaticMarkup(
    <CloudSettings initialTokenSaved initialConnected />,
  );

  it('explica consultas e ações remotas limitadas da ShardCloud', () => {
    expect(markup).toContain('permite consultar suas VMs');
    expect(markup).toContain('iniciar ou parar uma VM da lista consultada');
    expect(markup).toContain('exige aprovação em qualquer modo');
    expect(markup).toContain('Configuração necessária');
    expect(savedMarkup).toContain('ShardCloud');
    expect(savedMarkup).toContain('Token salvo');
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

  it('não mostra de novo o token depois de salvo e oferece apenas teste e remoção', () => {
    expect(markup).toContain('type="password"');
    expect(savedMarkup).not.toContain('id="shardcloud-token"');
    expect(savedMarkup).toContain('Testar conexão');
    expect(savedMarkup).toContain('Remover');
    expect(savedMarkup).not.toContain('Salvar token');
    expect(connectedMarkup).toContain('Conectado');
  });

  it('marca consultas externas como não confiáveis sem inserir respostas como HTML', () => {
    expect(connectedMarkup).toContain('Dados externos da ShardCloud — não confiáveis');
    expect(connectedMarkup).not.toContain('dangerouslySetInnerHTML');
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
    expect(markup).not.toMatch(/<button[^>]*>\s*(?:Conectar|Criar conta|Vincular)/i);
    expect(markup).not.toMatch(/Conectar|Criar conta|Vincular/i);
  });
});

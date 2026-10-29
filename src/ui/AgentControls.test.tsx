import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentActionCard, AgentControls } from './AgentControls';

describe('controles e cartões do agente', () => {
  it('mostra estado indisponível acessível e interruptor desativado', () => {
    const markup = renderToStaticMarkup(
      <AgentControls
        enabled={false}
        disabledReason="Configure a pasta de trabalho."
        workspacePath={null}
        running={false}
        awaitingApproval={false}
        onToggle={() => undefined}
        onStop={() => undefined}
        onConfigure={() => undefined}
      />,
    );
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Configure a pasta de trabalho.');
    expect(markup).toContain('Configurar agente');
  });

  it('renderiza cartão, diferenças, espera de aprovação, pasta e botão Parar', () => {
    const markup = renderToStaticMarkup(
      <>
        <AgentControls
          enabled
          disabledReason={null}
          workspacePath="D:\OdeKrai"
          running
          awaitingApproval
          onToggle={() => undefined}
          onStop={() => undefined}
          onConfigure={() => undefined}
        />
        <AgentActionCard
          action={{
            id: 'call-1',
            skillId: 'workspace.write_file',
            title: 'Salvar arquivo',
            risk: 'escrita reversível',
            decision: 'aguardando',
            status: 'Aguardando aprovação',
            summary: 'Salvar arquivo local.',
            resultSummary: 'Aguardando aprovação na janela nativa.',
            diff: 'antes\nagora',
          }}
        />
      </>,
    );
    expect(markup).toContain('Pasta de trabalho: D:\\OdeKrai');
    expect(markup).toContain('Aguardando aprovação na janela nativa de aprovação.');
    expect(markup).toContain('Parar agente');
    expect(markup).toContain('aria-label="Risco: Escrita reversível"');
    expect(markup).toContain('Ver diferenças');
    expect(markup).toContain('antes');
  });

  it.each([
    ['aprovada', 'Concluída'],
    ['negada', 'Negada'],
    ['expirada', 'Expirada'],
  ])('renderiza decisão %s e estado %s', (decision, status) => {
    const markup = renderToStaticMarkup(
      <AgentActionCard
        action={{
          id: 'call-2',
          skillId: 'workspace.read_file',
          title: 'Ler arquivo',
          risk: 'leitura',
          decision: decision as 'aprovada' | 'negada' | 'expirada',
          status,
          summary: 'Ler arquivo local.',
          resultSummary: 'Resultado resumido.',
        }}
      />,
    );
    expect(markup).toContain(`>${decision}<`);
    expect(markup).toContain(`>${status}<`);
    expect(markup).toContain('Resultado resumido.');
  });
});

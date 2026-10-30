import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AgentActionCard, AgentControls, type AgentActionCardData } from './AgentControls';

const action = (status: string, patch: Partial<AgentActionCardData> = {}): AgentActionCardData => ({
  id: `card-${status.replaceAll(' ', '-')}`,
  skillId: 'workspace.write_file',
  title: 'Salvar arquivo',
  risk: 'escrita reversível',
  decision: 'aguardando',
  status,
  summary: 'Salvar arquivo local.',
  ...patch,
});

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
    expect(markup).toContain('Configure a pasta de trabalho.');
  });

  it.each([
    ['planejada', 'planejada'],
    ['Aguardando aprovação', 'aguardando aprovação'],
    ['Executando', 'executando'],
    ['Concluída', 'concluída'],
    ['Negada', 'negada'],
    ['Expirada', 'expirada'],
    ['Falhou', 'erro'],
  ])('renderiza estado %s', (status, expected) => {
    expect(renderToStaticMarkup(<AgentActionCard action={action(status)} />)).toContain(
      `Estado: ${expected}`,
    );
  });

  it('não oferece botões de decisão e encaminha revisão para janela nativa', () => {
    const onReview = vi.fn();
    const markup = renderToStaticMarkup(
      <AgentActionCard
        action={action('Aguardando aprovação', {
          approvalExpiresAt: Math.floor(Date.now() / 1000) + 60,
        })}
        onReviewApproval={onReview}
      />,
    );
    expect(markup).toContain('Revisar na janela de aprovação');
    expect(markup).not.toMatch(/aprovar|negar/i);
    expect(onReview).not.toHaveBeenCalled();
  });

  it('renderiza prévia como texto, detalhes, timeline e dado externo não confiável', () => {
    const markup = renderToStaticMarkup(
      <AgentActionCard
        action={action('Concluída', {
          preview: '<script>alert(1)</script>\n- arquivo.txt',
          resultSummary: 'Resultado externo.',
          untrustedResult: true,
          durationMs: 1250,
          timeline: [{ label: 'Gravar arquivo', status: 'concluída', durationMs: 1250, at: 1 }],
        })}
        running
        onStop={() => undefined}
      />,
    );
    expect(markup).toContain('&lt;script&gt;');
    expect(markup).toContain('dado não confiável');
    expect(markup).toContain('Gravar arquivo');
    expect(markup).toContain('Parar');
    expect(markup).toContain('1.3 s');
  });

  it('expõe controles de artefato somente para caminho de arquivo seguro', () => {
    const markup = renderToStaticMarkup(
      <AgentActionCard
        action={action('Concluída', {
          artifacts: [
            { path: 'C:\\workspace\\relatorio.txt', kind: 'documento' },
            { path: 'C:\\workspace\\payload.exe', kind: 'arquivo' },
            { path: '../fora.txt', kind: 'arquivo' },
          ],
        })}
        onOpenArtifact={() => undefined}
        onRevealArtifact={() => undefined}
      />,
    );
    expect(markup).toContain('Abrir');
    expect(markup).toContain('Mostrar na pasta');
    expect(markup).not.toContain('payload.exe');
    expect(markup).not.toContain('fora.txt');
  });
});

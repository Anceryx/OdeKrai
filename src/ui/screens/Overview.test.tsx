import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { Overview } from './Overview';

const noop = () => undefined;

function renderOverview(overrides: Partial<ComponentProps<typeof Overview>> = {}) {
  return renderToStaticMarkup(
    <Overview
      draft=""
      setDraft={noop}
      busy={false}
      keyReady
      profile={{ displayName: 'Olívia', nickname: 'Oli', avatarDataUrl: null }}
      selectedPet="character-female-a"
      suggestions={[]}
      conversations={[]}
      checklist={[]}
      pendingApprovalCount={0}
      onStartConversation={noop}
      onSendMessage={async () => true}
      onResumeConversation={noop}
      onResolveChecklistItem={noop}
      onOpenApprovals={noop}
      {...overrides}
    />,
  );
}

describe('Início', () => {
  it('apresenta o mascote escolhido, saudação e campo de mensagem enxuto', () => {
    const markup = renderOverview();
    expect(markup).toContain('O que vamos fazer hoje?');
    expect(markup).toContain('Olá, Oli.');
    expect(markup).toContain('home-pet');
    expect(markup).toContain('aria-label="Mensagem"');
    expect(markup).not.toContain('Uma mente curiosa');
    expect(markup).not.toContain('AMBIENTE LOCAL');
    expect(markup).not.toContain('FEITO PARA ACOMPANHAR');
    expect(markup).not.toContain('PONTO DE PARTIDA');
  });

  it('mostra sugestões, Retomar, checklist e faixa de aprovação somente com dados reais', () => {
    const markup = renderOverview({
      suggestions: [
        {
          id: 'event-1',
          label: 'Preparar: Consulta',
          prompt: 'Ajude-me a me preparar para “Consulta”.',
          requirements: [{ type: 'event', id: 'event-1' }],
        },
      ],
      conversations: [
        { id: 'conversation-1', title: 'Viagem', preview: 'Pesquisar datas', created_at: 4 },
      ],
      checklist: [
        {
          id: 'provider',
          title: 'Conectar um provedor de IA',
          detail: 'Escolha um modelo.',
          destination: 'providers',
        },
      ],
      pendingApprovalCount: 1,
    });
    expect(markup).toContain('Preparar: Consulta');
    expect(markup).toContain('Retomar');
    expect(markup).toContain('Retomar Viagem');
    expect(markup).toContain('Conectar um provedor de IA');
    expect(markup).toContain('1 aprovação pendente; abrir janela de aprovação');
  });

  it('mantém o estado vazio sem inventar sugestões e permite saudação sem nome', () => {
    const markup = renderOverview({
      profile: { displayName: '', nickname: '', avatarDataUrl: null },
    });
    expect(markup).toContain('Olá.');
    expect(markup).not.toContain('home-suggestions');
    expect(markup).toContain('As conversas recentes aparecerão aqui.');
  });

  it('preserva semântica de botão nas sugestões e destinos do checklist', () => {
    const markup = renderOverview({
      suggestions: [
        { id: 'agent', label: 'Organizar uma tarefa', prompt: 'Ajude-me.', requirements: [] },
      ],
      checklist: [
        {
          id: 'workspace',
          title: 'Configurar a pasta do OdeKrai',
          detail: 'Pasta local.',
          destination: 'agent',
        },
      ],
    });
    expect(markup).toContain('type="button"');
    expect(markup).toContain('title="Preencher a mensagem para você revisar"');
    expect(markup).toContain('Resolver');
  });
});

import { describe, expect, it } from 'vitest';
import { filterConversations, presentMessages, resolveConversationSelection } from './chat';

const conversations = [
  { id: 'one', title: 'Viagem', preview: 'roteiro para Recife', created_at: 10 },
  { id: 'two', title: 'Estudos', preview: 'resumo de biologia', created_at: 20 },
];

describe('workspace de conversas', () => {
  it('filtra por título ou prévia e resolve somente IDs existentes', () => {
    expect(filterConversations(conversations, 'recife').map(({ id }) => id)).toEqual(['one']);
    expect(resolveConversationSelection(conversations, 'two')).toBe('two');
    expect(resolveConversationSelection(conversations, 'missing')).toBeNull();
  });

  it('alinha mensagens do usuário à direita e respostas à esquerda', () => {
    expect(
      presentMessages([
        { role: 'user' as const, content: 'pergunta' },
        { role: 'assistant' as const, content: 'resposta' },
      ]),
    ).toEqual([
      { message: { role: 'user', content: 'pergunta' }, side: 'right' },
      { message: { role: 'assistant', content: 'resposta' }, side: 'left' },
    ]);
  });
});

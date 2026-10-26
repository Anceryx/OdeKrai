import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConversationsScreen } from './Conversations';

describe('ConversationsScreen', () => {
  it('monta a conversa e sua lista sem mensagens', () => {
    const markup = renderToStaticMarkup(
      <ConversationsScreen
        messages={[]}
        conversations={[]}
        conversationId={null}
        onConversation={() => undefined}
        onNewConversation={() => undefined}
        onDeleteConversation={() => undefined}
        onRenameConversation={() => undefined}
        busy={false}
        draft=""
        setDraft={() => undefined}
        error=""
        submit={(event) => event.preventDefault()}
        cancel={() => undefined}
        providerName="OpenAI"
        providerModel=""
        providerConfigured={false}
        conversationSidebarCollapsed={false}
        conversationSidebarWidth={230}
        onToggleConversationSidebar={() => undefined}
        onResizeConversationSidebar={() => undefined}
        assistantUsesMascot={false}
        onFixConfiguration={() => undefined}
        onRetry={() => undefined}
        canRetry={false}
        profile={{ displayName: 'Teste', nickname: '', avatarDataUrl: null }}
        selectedPet="character-female-a"
      />,
    );
    expect(markup).toContain('Nova conversa');
    expect(markup).toContain('Lista de conversas');
    expect(markup).toContain('Recolher lista de conversas');
    expect(markup).toContain('Redimensionar lista de conversas');
  });

  it('renderiza o painel de conversas recolhido com controle para expandir', () => {
    const markup = renderToStaticMarkup(
      <ConversationsScreen
        messages={[]}
        conversations={[]}
        conversationId={null}
        onConversation={() => undefined}
        onNewConversation={() => undefined}
        onDeleteConversation={() => undefined}
        onRenameConversation={() => undefined}
        busy={false}
        draft=""
        setDraft={() => undefined}
        error=""
        submit={(event) => event.preventDefault()}
        cancel={() => undefined}
        providerName="OpenAI"
        providerModel=""
        providerConfigured={false}
        conversationSidebarCollapsed
        conversationSidebarWidth={230}
        onToggleConversationSidebar={() => undefined}
        onResizeConversationSidebar={() => undefined}
        assistantUsesMascot={false}
        onFixConfiguration={() => undefined}
        onRetry={() => undefined}
        canRetry={false}
        profile={{ displayName: 'Teste', nickname: '', avatarDataUrl: null }}
        selectedPet="character-female-a"
      />,
    );
    expect(markup).toContain('conversation-sidebar-collapsed');
    expect(markup).toContain('Expandir lista de conversas');
  });
});

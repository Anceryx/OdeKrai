import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConversationsScreen } from './Conversations';

describe('ConversationsScreen', () => {
  it('monta a conversa e identifica mensagens com o nome salvo no perfil', () => {
    const markup = renderToStaticMarkup(
      <ConversationsScreen
        messages={[{ role: 'user', content: 'Olá', created_at: 1 }]}
        conversations={[]}
        conversationId={null}
        onConversation={() => undefined}
        onNewConversation={() => undefined}
        onDeleteConversation={() => undefined}
        onRenameConversation={() => undefined}
        busy={false}
        draft=""
        setDraft={() => undefined}
        error="A pasta do OdeKrai está ausente ou incompleta."
        errorDetails="Verificação local da pasta pessoal falhou."
        canFixConfiguration
        submit={(event) => event.preventDefault()}
        cancel={() => undefined}
        providerModel=""
        providerId="openai"
        providerConfigured={false}
        conversationSidebarCollapsed={false}
        conversationSidebarWidth={230}
        onToggleConversationSidebar={() => undefined}
        onResizeConversationSidebar={() => undefined}
        onOpenLink={() => undefined}
        assistantUsesMascot={false}
        onFixConfiguration={() => undefined}
        onRetry={() => undefined}
        canRetry={false}
        profile={{ displayName: 'Oli', nickname: '', avatarDataUrl: null }}
        selectedPet="character-female-a"
        agentEnabled={false}
        agentUnavailableReason="Configure a pasta de trabalho do agente."
        agentWorkspacePath={null}
        agentRunning={false}
        agentAwaitingApproval={false}
        agentActionCards={[]}
        onToggleAgent={() => undefined}
        onStopAgent={() => undefined}
        onConfigureAgent={() => undefined}
      />,
    );
    expect(markup).toContain('Nova conversa');
    expect(markup).toContain('Lista de conversas');
    expect(markup).toContain('Recolher lista de conversas');
    expect(markup).toContain('Redimensionar lista de conversas');
    expect(markup).not.toContain('chat-model-chip');
    expect(markup).toContain('message-role">Oli</span>');
    expect(markup).toContain('Detalhes técnicos');
    expect(markup).toContain('Resolver pasta');
  });

  it('mostra o modelo no cabeçalho apenas quando difere do modelo atual', () => {
    const markup = renderToStaticMarkup(
      <ConversationsScreen
        messages={[]}
        conversations={[
          {
            id: 'one',
            title: 'Conversa anterior',
            preview: '',
            created_at: 1,
            provider_id: 'anthropic',
            model: 'claude-test',
          },
        ]}
        conversationId="one"
        onConversation={() => undefined}
        onNewConversation={() => undefined}
        onDeleteConversation={() => undefined}
        onRenameConversation={() => undefined}
        busy={false}
        draft=""
        setDraft={() => undefined}
        error=""
        errorDetails=""
        canFixConfiguration={false}
        submit={(event) => event.preventDefault()}
        cancel={() => undefined}
        providerModel="gpt-test"
        providerId="openai"
        providerConfigured
        conversationSidebarCollapsed={false}
        conversationSidebarWidth={230}
        onToggleConversationSidebar={() => undefined}
        onResizeConversationSidebar={() => undefined}
        onOpenLink={() => undefined}
        assistantUsesMascot={false}
        onFixConfiguration={() => undefined}
        onRetry={() => undefined}
        canRetry={false}
        profile={{ displayName: 'Teste', nickname: '', avatarDataUrl: null }}
        selectedPet="character-female-a"
        agentEnabled={true}
        agentUnavailableReason={null}
        agentWorkspacePath="D:\\OdeKrai"
        agentRunning={false}
        agentAwaitingApproval={false}
        agentActionCards={[]}
        onToggleAgent={() => undefined}
        onStopAgent={() => undefined}
        onConfigureAgent={() => undefined}
      />,
    );
    expect(markup).toContain('Modelo usado nesta conversa');
    expect(markup).toContain('Anthropic · claude-test');
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
        errorDetails=""
        canFixConfiguration={false}
        submit={(event) => event.preventDefault()}
        cancel={() => undefined}
        providerModel=""
        providerId="openai"
        providerConfigured={false}
        conversationSidebarCollapsed
        conversationSidebarWidth={230}
        onToggleConversationSidebar={() => undefined}
        onResizeConversationSidebar={() => undefined}
        onOpenLink={() => undefined}
        assistantUsesMascot={false}
        onFixConfiguration={() => undefined}
        onRetry={() => undefined}
        canRetry={false}
        profile={{ displayName: 'Teste', nickname: '', avatarDataUrl: null }}
        selectedPet="character-female-a"
        agentEnabled={false}
        agentUnavailableReason="Configure a pasta de trabalho do agente."
        agentWorkspacePath={null}
        agentRunning={false}
        agentAwaitingApproval={false}
        agentActionCards={[]}
        onToggleAgent={() => undefined}
        onStopAgent={() => undefined}
        onConfigureAgent={() => undefined}
      />,
    );
    expect(markup).toContain('conversation-sidebar-collapsed');
    expect(markup).toContain('Expandir lista de conversas');
  });
});

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage } from '../../core/provider-messages';
import { filterConversations, presentMessages, type ConversationSummary } from '../../core/chat';
import { safeMarkdownUrl } from '../../core/markdown';
import { Button } from '../DesignSystem';
import { Icon } from '../Icon';
import { PetSprite } from '../PetSprite';
import { MessageMarkdown } from '../MessageMarkdown';
import appIcon from '../../assets/odekrai-app-icon.png';
import { initials, type ProfileData } from '../Profile';

export function ConversationsScreen({
  messages,
  conversations,
  conversationId,
  onConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  busy,
  draft,
  setDraft,
  error,
  submit,
  cancel,
  providerName,
  providerModel,
  providerConfigured,
  assistantUsesMascot,
  onFixConfiguration,
  onRetry,
  canRetry,
  profile,
  selectedPet,
}: {
  messages: ChatMessage[];
  conversations: ConversationSummary[];
  conversationId: string | null;
  onConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  busy: boolean;
  draft: string;
  setDraft: (value: string) => void;
  error: string;
  submit: (event: FormEvent) => void;
  cancel: () => void;
  providerName: string;
  providerModel: string;
  providerConfigured: boolean;
  assistantUsesMascot: boolean;
  onFixConfiguration: () => void;
  onRetry: () => void;
  canRetry: boolean;
  profile: ProfileData;
  selectedPet: string;
}) {
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find((item) => item.id === conversationId);
  const filteredConversations = filterConversations(conversations, search);
  const presentedMessages = presentMessages(
    messages.filter((message) => message.role !== 'system'),
  );
  useEffect(
    () => setTitleDraft(activeConversation?.title ?? ''),
    [conversationId, activeConversation?.title],
  );
  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [draft]);
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area) return;
    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
    if (nearBottom) area.scrollTop = area.scrollHeight;
  }, [messages, busy]);

  return (
    <div className="chat-view">
      <aside className="conversation-sidebar" aria-label="Lista de conversas">
        <Button type="button" variant="primary" onClick={onNewConversation} disabled={busy}>
          Nova conversa
        </Button>
        <label className="conversation-search">
          <span className="sr-only">Buscar conversas</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar conversas"
          />
        </label>
        <div className="conversation-list">
          {filteredConversations.map((item) => (
            <div
              className={`conversation-item ${conversationId === item.id ? 'selected' : ''}`}
              key={item.id}
            >
              <button
                type="button"
                className="conversation-select"
                onClick={() => onConversation(item.id)}
                disabled={busy}
                aria-current={conversationId === item.id ? 'page' : undefined}
              >
                <strong>{item.title}</strong>
                <time dateTime={new Date(item.created_at * 1000).toISOString()}>
                  {new Date(item.created_at * 1000).toLocaleDateString('pt-BR')}
                </time>
                <span>{item.preview}</span>
              </button>
              <button
                type="button"
                className="conversation-menu-trigger"
                aria-label={`Opções da conversa ${item.title}`}
                aria-expanded={openMenuId === item.id}
                onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                disabled={busy}
              >
                <Icon name="more" />
              </button>
              {openMenuId === item.id && (
                <div className="conversation-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      const title = window.prompt('Novo título da conversa:', item.title);
                      if (title !== null) onRenameConversation(item.id, title);
                    }}
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      onDeleteConversation(item.id);
                    }}
                  >
                    Apagar
                  </button>
                </div>
              )}
            </div>
          ))}
          {filteredConversations.length === 0 && (
            <p className="conversation-list-empty">
              {search ? 'Nenhuma conversa encontrada.' : 'Suas conversas aparecerão aqui.'}
            </p>
          )}
        </div>
      </aside>
      <section className="chat-thread" aria-label="Conversa atual">
        <header className="chat-header">
          <div className="chat-title-wrap">
            <span className="eyebrow">CONVERSA</span>
            {activeConversation ? (
              <input
                className="chat-title-input"
                value={titleDraft}
                maxLength={120}
                aria-label="Título da conversa"
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  if (titleDraft.trim() && titleDraft.trim() !== activeConversation.title)
                    onRenameConversation(activeConversation.id, titleDraft);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setTitleDraft(activeConversation.title);
                }}
              />
            ) : (
              <h2>Nova conversa</h2>
            )}
          </div>
          <span className="chat-model-chip">
            {providerConfigured ? providerModel || providerName : 'Sem provedor'}
          </span>
        </header>
        {!providerConfigured && (
          <div className="chat-provider-needed" role="status">
            <span>Configure um provedor de IA para começar a conversar.</span>
            <Button type="button" variant="secondary" onClick={onFixConfiguration}>
              Abrir Conectores
            </Button>
          </div>
        )}
        <div className="messages-area" aria-live="polite" ref={messagesAreaRef}>
          {messages.length === 0 ? (
            <div className="empty-chat">
              <img className="empty-chat-icon" src={appIcon} alt="" />
              <strong>O que você gostaria de explorar?</strong>
              <p>Escreva uma pergunta, uma ideia ou algo que queira organizar.</p>
              <div className="prompt-chips">
                <button
                  type="button"
                  onClick={() => setDraft('Ajude-me a organizar minhas prioridades de hoje.')}
                >
                  Organizar meu dia <Icon name="external-link" />
                </button>
                <button type="button" onClick={() => setDraft('Quero explorar uma ideia nova: ')}>
                  Explorar uma ideia <Icon name="external-link" />
                </button>
                <button type="button" onClick={() => setDraft('Explique de forma simples: ')}>
                  Entender algo novo <Icon name="external-link" />
                </button>
              </div>
            </div>
          ) : (
            <div className="message-list">
              {presentedMessages.map(({ message, side }, index) => (
                <article className={`message message--${side}`} key={`${index}-${message.role}`}>
                  {message.role === 'assistant' && (
                    <span className="message-avatar">
                      {assistantUsesMascot ? (
                        <PetSprite estado="idle" petId={selectedPet} avatar />
                      ) : (
                        <img src={appIcon} alt="" />
                      )}
                    </span>
                  )}
                  <div className="message-content">
                    <span className="message-role">
                      {message.role === 'user' ? profile.displayName || 'Você' : 'OdeKrai'}
                    </span>
                    {message.role === 'assistant' ? (
                      <MessageMarkdown text={message.content} />
                    ) : (
                      <p className="message-plain">{message.content}</p>
                    )}
                    {message.citations?.length ? (
                      <div className="message-citations">
                        {message.citations.map((citation) =>
                          safeMarkdownUrl(citation.url) ? (
                            <a
                              key={citation.url}
                              href={safeMarkdownUrl(citation.url) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {citation.title}
                            </a>
                          ) : (
                            <span key={citation.url}>{citation.title}</span>
                          ),
                        )}
                      </div>
                    ) : null}
                    <time className="message-time">
                      {new Date(
                        (message.created_at ?? Math.floor(Date.now() / 1000)) * 1000,
                      ).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  {message.role === 'user' && (
                    <span className="message-avatar message-avatar-user">
                      {profile.avatarDataUrl ? (
                        <img src={profile.avatarDataUrl} alt="" />
                      ) : (
                        initials(profile.displayName)
                      )}
                    </span>
                  )}
                </article>
              ))}
              {busy && (
                <div className="thinking-row">
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>OdeKrai está pensando</span>
                </div>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="chat-error" role="alert">
            <p>{error}</p>
            <div>
              {canRetry && (
                <Button type="button" variant="secondary" onClick={onRetry} disabled={busy}>
                  Tentar novamente
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onFixConfiguration}>
                Corrigir configuração
              </Button>
            </div>
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Escreva sua mensagem..."
            rows={1}
            aria-label="Mensagem"
          />
          <div className="composer-bottom">
            <span>Enter envia · Shift + Enter quebra linha</span>
            <button
              className={`send-button ${busy ? 'stop-button' : ''}`}
              type={busy ? 'button' : 'submit'}
              onClick={busy ? cancel : undefined}
              disabled={!busy && !draft.trim()}
              aria-label={busy ? 'Parar resposta' : 'Enviar mensagem'}
            >
              {busy ? 'Parar' : 'Enviar'}
            </button>
          </div>
        </form>
        <p className="chat-disclaimer">
          As respostas podem conter imprecisões. As mensagens são enviadas ao provedor configurado.
        </p>
      </section>
    </div>
  );
}

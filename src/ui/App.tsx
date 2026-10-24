import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { sendChatMessage, type ChatMessage } from '../core/chat';
import { defaultSettings, loadSettings, saveSettings, type AppSettings } from '../core/settings';

type Section = 'overview' | 'chat' | 'providers' | 'companion' | 'settings';

const nav: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'overview', label: 'Visão geral', icon: '⌂', group: 'ESPAÇO DE TRABALHO' },
  { id: 'chat', label: 'Conversas', icon: '◌', group: 'ESPAÇO DE TRABALHO' },
  { id: 'providers', label: 'Provedores de IA', icon: '✳', group: 'INTELIGÊNCIA' },
  { id: 'companion', label: 'Companion', icon: '◇', group: 'PERSONALIZAÇÃO' },
  { id: 'settings', label: 'Configurações', icon: '⚙', group: 'PERSONALIZAÇÃO' },
];

export function App() {
  const [section, setSection] = useState<Section>('overview');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [apiKey, setApiKey] = useState('');
  const [keySavedForSession, setKeySavedForSession] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [chatMode, setChatMode] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => () => request.current?.abort(), []);

  const currentNav = useMemo(() => nav.find((item) => item.id === section), [section]);

  function updateProvider(field: keyof AppSettings['provider'], value: string) {
    setSettings((current) => ({ ...current, provider: { ...current.provider, [field]: value } }));
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (!apiKey.trim()) {
      setError('Adicione uma chave de API para conversar com o provedor configurado.');
      setSection('providers');
      return;
    }
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setDraft('');
    setError('');
    setBusy(true);
    request.current = new AbortController();
    try {
      const answer = await sendChatMessage(
        settings.provider.baseUrl,
        settings.provider.model,
        apiKey,
        next,
        request.current.signal,
      );
      setMessages([...next, { role: 'assistant', content: answer }]);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setMessages(next);
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível concluir a solicitação.',
        );
      }
    } finally {
      setBusy(false);
      request.current = null;
    }
  }

  function cancelRequest() {
    request.current?.abort();
    setBusy(false);
  }

  return (
    <div
      className={`app-shell ${settings.reduceMotion ? 'reduce-motion' : ''} ${chatMode ? 'chat-mode' : ''}`}
    >
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => {
            setSection('overview');
            setChatMode(false);
          }}
          aria-label="Ir para a visão geral"
        >
          <span className="brand-mark">O</span>
          <span>
            <strong>ODEKRAI</strong>
            <small>PERSONAL AI COMPANION</small>
          </span>
        </button>
        <div className="profile-card">
          <div className="avatar-small">
            O<span className="online-dot" />
          </div>
          <div className="profile-copy">
            <strong>Seu espaço</strong>
            <span>Local neste dispositivo</span>
          </div>
          <span className="chevron">⌄</span>
        </div>
        <nav className="nav-list" aria-label="Navegação principal">
          {(['ESPAÇO DE TRABALHO', 'INTELIGÊNCIA', 'PERSONALIZAÇÃO'] as const).map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-heading">{group}</span>
              {nav
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    className={`nav-item ${section === item.id ? 'active' : ''}`}
                    key={item.id}
                    onClick={() => {
                      setSection(item.id);
                      setChatMode(false);
                    }}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                    {item.id === 'providers' && (
                      <span
                        className="nav-status"
                        aria-label={
                          keySavedForSession
                            ? 'Chave disponível nesta sessão'
                            : 'Chave não configurada'
                        }
                      />
                    )}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span>◉</span> Seus dados ficam no dispositivo
          </div>
          <button
            className="user-row"
            onClick={() => {
              setSection('settings');
              setChatMode(false);
            }}
          >
            <span className="user-avatar">O</span>
            <span>
              <strong>Seu perfil</strong>
              <small>Espaço pessoal</small>
            </span>
            <span className="more">•••</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>ODEKRAI</span>
            <b>/</b>
            <strong>{chatMode ? 'Nova conversa' : currentNav?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="connection">
              <i /> LOCAL
            </span>
            <button
              className="icon-button"
              aria-label="Ajuda"
              onClick={() => setToast('A documentação do projeto está em docs/.')}
            >
              ?
            </button>
            <button
              className="help-button"
              onClick={() => setToast('Central de ajuda ainda em desenvolvimento.')}
            >
              Ajuda
            </button>
          </div>
        </header>
        {chatMode || section === 'chat' ? (
          <ChatView
            messages={messages}
            busy={busy}
            draft={draft}
            setDraft={setDraft}
            error={error}
            submit={submitMessage}
            cancel={cancelRequest}
            providerName={settings.provider.name}
          />
        ) : (
          <div className="content-scroll">
            {section === 'overview' && (
              <Overview
                onChat={() => setChatMode(true)}
                onOpen={(target) => setSection(target)}
                provider={settings.provider}
                keyReady={keySavedForSession}
              />
            )}
            {section === 'providers' && (
              <Providers
                settings={settings}
                updateProvider={updateProvider}
                apiKey={apiKey}
                setApiKey={setApiKey}
                keySaved={keySavedForSession}
                setKeySaved={setKeySavedForSession}
                onChat={() => setChatMode(true)}
              />
            )}
            {section === 'companion' && <Companion />}
            {section === 'settings' && (
              <Settings settings={settings} update={(next) => setSettings(next)} />
            )}
          </div>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Overview({
  onChat,
  onOpen,
  provider,
  keyReady,
}: {
  onChat: () => void;
  onOpen: (section: Section) => void;
  provider: AppSettings['provider'];
  keyReady: boolean;
}) {
  const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date())
    .toLocaleUpperCase('pt-BR');
  return (
    <div className="page overview-page">
      <div className="welcome-row">
        <div>
          <span className="eyebrow">{today}</span>
          <h1>
            Seu espaço, <em>suas ideias.</em>
          </h1>
          <p>Um lugar para pensar, criar e conversar com a IA que você escolher.</p>
        </div>
        <div className="welcome-mark">
          <span>O</span>
          <i />
        </div>
      </div>
      <section className="hero-card">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-content">
          <span className="pill-label">
            <i /> ODEKRAI HUB
          </span>
          <h2>
            Uma mente curiosa.
            <br />
            <em>Seu jeito de fazer.</em>
          </h2>
          <p>
            Conecte seu provedor de IA e comece uma conversa. Sua chave fica apenas nesta sessão
            nesta versão inicial.
          </p>
          <button className="primary-button" onClick={onChat}>
            Iniciar conversa <span>↗</span>
          </button>
        </div>
        <div className="hero-glyph">
          <div className="glyph-halo" />
          <div className="glyph-core">O</div>
          <span className="spark spark-a">✦</span>
          <span className="spark spark-b">✧</span>
          <span className="spark spark-c">·</span>
        </div>
        <div className="hero-footer">
          <span>
            <i /> AMBIENTE LOCAL
          </span>
          <span>FEITO PARA ACOMPANHAR</span>
        </div>
      </section>
      <div className="section-title">
        <div>
          <span className="eyebrow">PONTO DE PARTIDA</span>
          <h3>Seu Odekrai</h3>
        </div>
        <button className="text-button" onClick={() => onOpen('settings')}>
          Personalizar <span>↗</span>
        </button>
      </div>
      <div className="cards-grid">
        <button className="feature-card provider-card" onClick={() => onOpen('providers')}>
          <div className="card-icon red-icon">✳</div>
          <div className="feature-copy">
            <span className="eyebrow">INTELIGÊNCIA</span>
            <h4>{keyReady ? 'Provedor conectado' : 'Escolha sua IA'}</h4>
            <p>
              {provider.name} <span className="dot-sep">·</span> {provider.model}
            </p>
          </div>
          <span className="card-arrow">↗</span>
          <div className="mini-meter">
            <i style={{ width: keyReady ? '86%' : '28%' }} />
          </div>
        </button>
        <button className="feature-card companion-card" onClick={() => onOpen('companion')}>
          <div className="card-icon neutral-icon">◇</div>
          <div className="feature-copy">
            <span className="eyebrow">COMPANION</span>
            <h4>Seu espaço de presença</h4>
            <p>Conheça o personagem e a ilha.</p>
          </div>
          <span className="card-arrow">↗</span>
          <div className="companion-doodle">O</div>
        </button>
      </div>
      <div className="privacy-note">
        <span>◈</span>
        <p>
          <strong>Privacidade desde o primeiro passo.</strong> Preferências são salvas localmente. O
          conteúdo da conversa é enviado apenas ao provedor que você configurar.
        </p>
        <button onClick={() => onOpen('settings')}>
          Saiba mais <span>↗</span>
        </button>
      </div>
      <div className="home-footer">
        <span>
          ODEKRAI <b>·</b> VERSÃO 0.1.0
        </span>
        <span>UM COMPANHEIRO PARA O SEU DIA A DIA</span>
      </div>
    </div>
  );
}

function Providers({
  settings,
  updateProvider,
  apiKey,
  setApiKey,
  keySaved,
  setKeySaved,
  onChat,
}: {
  settings: AppSettings;
  updateProvider: (field: keyof AppSettings['provider'], value: string) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  keySaved: boolean;
  setKeySaved: (value: boolean) => void;
  onChat: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  return (
    <div className="page subpage">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INTELIGÊNCIA</span>
          <h1>Provedores de IA</h1>
          <p>Conecte uma API compatível com o formato OpenAI Chat Completions.</p>
        </div>
        <span className="heading-symbol">✳</span>
      </div>
      <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <h3>Conexão principal</h3>
            <p>As mensagens são enviadas diretamente ao endereço escolhido.</p>
          </div>
          <span className={`state-chip ${keySaved ? 'connected' : ''}`}>
            <i />
            {keySaved ? 'PRONTO NESTA SESSÃO' : 'NÃO CONFIGURADO'}
          </span>
        </div>
        <label className="field-label">
          Nome do provedor
          <input
            value={settings.provider.name}
            onChange={(e) => updateProvider('name', e.target.value)}
            placeholder="Ex.: OpenAI"
          />
        </label>
        <label className="field-label">
          URL base da API
          <input
            value={settings.provider.baseUrl}
            onChange={(e) => updateProvider('baseUrl', e.target.value)}
            placeholder="https://api.openai.com/v1"
            spellCheck={false}
          />
        </label>
        <label className="field-label">
          Modelo
          <input
            value={settings.provider.model}
            onChange={(e) => updateProvider('model', e.target.value)}
            placeholder="gpt-4o-mini"
            spellCheck={false}
          />
        </label>
        <label className="field-label">
          Chave de API
          <div className="secret-input">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeySaved(Boolean(e.target.value));
              }}
              placeholder={keySaved ? 'Chave disponível nesta sessão' : 'Cole sua chave de API'}
              autoComplete="off"
            />
            <button type="button" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Ocultar' : 'Exibir'}
            </button>
          </div>
        </label>
        <div className="security-callout">
          <span>◇</span>
          <p>
            A chave permanece apenas na memória desta sessão e não é gravada no disco. Ao fechar o
            aplicativo, será necessário inseri-la novamente. O armazenamento seguro do sistema
            operacional ainda será integrado.
          </p>
        </div>
        <div className="panel-actions">
          <button
            className="secondary-button"
            onClick={() => {
              setApiKey('');
              setKeySaved(false);
            }}
          >
            Limpar chave
          </button>
          <button className="primary-button" onClick={onChat} disabled={!keySaved}>
            Testar em uma conversa <span>↗</span>
          </button>
        </div>
      </section>
      <div className="provider-footnote">
        <span>ⓘ</span>
        <p>
          Use apenas um provedor em que você confia. Verifique os termos, a política de retenção e
          os custos da API escolhida. O Odekrai não controla a disponibilidade nem as cobranças do
          provedor.
        </p>
      </div>
    </div>
  );
}

function Companion() {
  return (
    <div className="page subpage">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PERSONALIZAÇÃO</span>
          <h1>ODEKRAI Companion</h1>
          <p>Uma presença leve para acompanhar você na área de trabalho.</p>
        </div>
        <span className="heading-symbol">◇</span>
      </div>
      <div className="companion-preview">
        <div className="preview-grid" />
        <div className="preview-island">
          <span className="island-light" />
          <div className="placeholder-mascot">O</div>
          <span className="island-label">
            ILHA ODEKRAI <i />
          </span>
        </div>
        <div className="preview-caption">
          <span className="eyebrow">PRÉVIA DO COMPANION</span>
          <strong>Um espaço próprio para estar por perto.</strong>
          <p>
            O personagem definitivo será criado pelo proprietário. Esta forma geométrica é apenas um
            marcador técnico.
          </p>
        </div>
      </div>
      <section className="settings-panel compact-panel">
        <div className="panel-heading">
          <div>
            <h3>Imagens e animações</h3>
            <p>
              A arquitetura está preparada para receber os assets oficiais quando estiverem
              disponíveis.
            </p>
          </div>
          <span className="state-chip">EM PREPARAÇÃO</span>
        </div>
        <div className="inline-link">
          Leia o guia de assets <span>↗</span>
        </div>
      </section>
    </div>
  );
}

function Settings({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (next: AppSettings) => void;
}) {
  return (
    <div className="page subpage">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PERSONALIZAÇÃO</span>
          <h1>Configurações</h1>
          <p>Ajuste a experiência do Odekrai neste dispositivo.</p>
        </div>
        <span className="heading-symbol">⚙</span>
      </div>
      <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <h3>Preferências gerais</h3>
            <p>Estas opções são armazenadas no navegador local do aplicativo.</p>
          </div>
          <span className="state-chip connected">
            <i /> SALVO LOCALMENTE
          </span>
        </div>
        <div className="preference-row">
          <div>
            <strong>Idioma da interface</strong>
            <span>Mais idiomas serão adicionados em uma próxima etapa.</span>
          </div>
          <select value="pt-BR" disabled aria-label="Idioma disponível">
            <option value="pt-BR">Português (Brasil)</option>
          </select>
        </div>
        <div className="preference-row">
          <div>
            <strong>Reduzir animações</strong>
            <span>Respeita a preferência de movimento reduzido.</span>
          </div>
          <button
            role="switch"
            aria-checked={settings.reduceMotion}
            className={`toggle ${settings.reduceMotion ? 'on' : ''}`}
            onClick={() => update({ ...settings, reduceMotion: !settings.reduceMotion })}
          >
            <span />
          </button>
        </div>
        <div className="preference-row">
          <div>
            <strong>Restaurar preferências</strong>
            <span>Voltar aos valores iniciais deste dispositivo.</span>
          </div>
          <button className="secondary-button small-button" onClick={() => update(defaultSettings)}>
            Restaurar
          </button>
        </div>
      </section>
      <div className="provider-footnote">
        <span>◈</span>
        <p>
          As preferências podem ser removidas limpando os dados locais do aplicativo. A chave de API
          não é incluída nelas.
        </p>
      </div>
    </div>
  );
}

function ChatView({
  messages,
  busy,
  draft,
  setDraft,
  error,
  submit,
  cancel,
  providerName,
}: {
  messages: ChatMessage[];
  busy: boolean;
  draft: string;
  setDraft: (value: string) => void;
  error: string;
  submit: (event: FormEvent) => void;
  cancel: () => void;
  providerName: string;
}) {
  return (
    <div className="chat-view">
      <div className="chat-header">
        <div>
          <span className="eyebrow">CONVERSA COM IA</span>
          <h2>Uma nova ideia começa aqui.</h2>
        </div>
        <span className="chat-provider">
          <i /> {providerName}
        </span>
      </div>
      <div className="messages-area">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-orb">O</div>
            <strong>O que você gostaria de explorar?</strong>
            <p>Escreva uma pergunta, uma ideia ou algo que queira organizar.</p>
            <div className="prompt-chips">
              <button onClick={() => setDraft('Ajude-me a organizar minhas prioridades de hoje.')}>
                Organizar meu dia <span>↗</span>
              </button>
              <button onClick={() => setDraft('Quero explorar uma ideia nova: ')}>
                Explorar uma ideia <span>↗</span>
              </button>
              <button onClick={() => setDraft('Explique de forma simples: ')}>
                Entender algo novo <span>↗</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${index}-${message.role}`}>
                <span className="message-avatar">{message.role === 'user' ? 'D' : 'O'}</span>
                <div>
                  <span className="message-role">
                    {message.role === 'user' ? 'VOCÊ' : 'ODEKRAI'}
                  </span>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
            {busy && (
              <div className="thinking-row">
                <span className="thinking-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>Odekrai está pensando</span>
              </div>
            )}
          </div>
        )}
      </div>
      {error && (
        <div className="chat-error" role="alert">
          <span>!</span>
          {error}
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Escreva sua mensagem..."
          rows={2}
          aria-label="Mensagem"
        />
        <div className="composer-bottom">
          <span>
            ENTER envia <b>·</b> SHIFT + ENTER quebra linha
          </span>
          <button
            className="send-button"
            type={busy ? 'button' : 'submit'}
            onClick={busy ? cancel : undefined}
            disabled={!busy && !draft.trim()}
            aria-label={busy ? 'Cancelar resposta' : 'Enviar mensagem'}
          >
            {busy ? '■' : '↑'}
          </button>
        </div>
      </form>
      <p className="chat-disclaimer">
        As respostas podem conter imprecisões. As mensagens são enviadas ao provedor configurado.
      </p>
    </div>
  );
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function sendChatMessage(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const endpoint = buildEndpoint(baseUrl);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, stream: false }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar ao provedor. Confira a URL e sua conexão.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = readError(payload);
    throw new Error(detail || `O provedor respondeu com HTTP ${response.status}.`);
  }
  const content = readContent(payload);
  if (!content) throw new Error('O provedor retornou uma resposta vazia ou em formato inesperado.');
  return content;
}

function buildEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Informe uma URL válida para o provedor.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Use HTTPS. HTTP só é permitido para um provedor local neste dispositivo.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('A URL base não pode conter credenciais, parâmetros ou fragmentos.');
  }
  return `${url.href.replace(/\/+$/, '')}/chat/completions`;
}

function readError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return;
  const error = (payload as { error?: unknown }).error;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message.slice(0, 500);
  }
}

function readContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return;
  const message = choices[0]?.message;
  if (!message || typeof message !== 'object') return;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content.trim() : undefined;
}

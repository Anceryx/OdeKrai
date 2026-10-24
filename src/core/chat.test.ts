import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendChatMessage } from './chat';

describe('sendChatMessage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envia o formato esperado ao endpoint compatível e devolve o texto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'Olá!' } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const answer = await sendChatMessage(
      'https://example.test/v1/',
      'modelo-teste',
      'chave-temporaria',
      [{ role: 'user', content: 'Oi' }],
    );

    expect(answer).toBe('Olá!');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer chave-temporaria' },
        body: JSON.stringify({
          model: 'modelo-teste',
          messages: [{ role: 'user', content: 'Oi' }],
          stream: false,
        }),
      }),
    );
  });

  it('expõe uma mensagem do provedor em erro HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Modelo indisponível' } }), {
          status: 400,
        }),
      ),
    );
    await expect(sendChatMessage('https://example.test/v1', 'modelo', 'chave', [])).rejects.toThrow(
      'Modelo indisponível',
    );
  });

  it('não mascara cancelamento como falha de conexão', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(
      sendChatMessage('https://example.test/v1', 'modelo', 'chave', [], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejeita HTTP remoto para não enviar a chave sem TLS', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      sendChatMessage('http://api.example.test/v1', 'modelo', 'chave', []),
    ).rejects.toThrow('Use HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('permite um servidor local sem TLS para modelos locais', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'Resposta local' } }] }), {
          status: 200,
        }),
      ),
    );
    await expect(
      sendChatMessage('http://localhost:11434/v1', 'modelo-local', 'chave', []),
    ).resolves.toBe('Resposta local');
  });
});

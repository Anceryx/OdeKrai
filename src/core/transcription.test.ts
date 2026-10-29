import { describe, expect, it, vi } from 'vitest';
import { transcribeConfirmedRecording } from './transcription';

describe('transcrição sob demanda', () => {
  it('não chama o provedor antes da confirmação ou após cancelamento', async () => {
    const send = vi.fn(async () => 'texto');
    const audio = new Blob(['audio'], { type: 'audio/webm' });

    await expect(transcribeConfirmedRecording(false, 'openai', audio, send)).resolves.toBeNull();
    await expect(transcribeConfirmedRecording(false, 'groq', audio, send)).resolves.toBeNull();

    expect(send).not.toHaveBeenCalled();
  });

  it('propaga erros do provedor e informa resposta vazia', async () => {
    const audio = new Blob(['audio'], { type: 'audio/webm' });
    await expect(
      transcribeConfirmedRecording(true, 'openai', audio, async () => {
        throw new Error('Falha de rede simulada.');
      }),
    ).rejects.toThrow('Falha de rede simulada.');
    await expect(
      transcribeConfirmedRecording(true, 'groq', audio, async () => '  '),
    ).rejects.toThrow('Nenhuma fala foi detectada');
  });

  it('rejeita provedor não verificado e arquivo acima do limite sem chamar adaptador', async () => {
    const send = vi.fn(
      async (_providerId: string, _mediaType: string, _audioBase64: string) => 'texto',
    );
    await expect(
      transcribeConfirmedRecording(true, 'anthropic', new Blob(['audio']), send),
    ).rejects.toThrow('não tem transcrição verificada');
    await expect(
      transcribeConfirmedRecording(true, 'groq', new Blob([new Uint8Array(25_000_001)]), send),
    ).rejects.toThrow('25 MB');
    expect(send).not.toHaveBeenCalled();
  });

  it('envia apenas ao adaptador aprovado e devolve texto editável', async () => {
    const send = vi.fn(
      async (_providerId: string, _mediaType: string, _audioBase64: string) =>
        '  Texto para revisar.  ',
    );
    const result = await transcribeConfirmedRecording(
      true,
      'openai',
      new Blob(['fake audio'], { type: 'audio/webm' }),
      send,
    );

    expect(result).toBe('Texto para revisar.');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toBe('openai');
    expect(send.mock.calls[0][1]).toBe('audio/webm');
  });
});

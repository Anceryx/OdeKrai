export const MAX_TRANSCRIPTION_BYTES = 25_000_000;

const SUPPORTED_TRANSCRIPTION_PROVIDERS = ['openai', 'groq'] as const;
export type TranscriptionProviderId = (typeof SUPPORTED_TRANSCRIPTION_PROVIDERS)[number];

export function supportsTranscription(providerId: string): providerId is TranscriptionProviderId {
  return SUPPORTED_TRANSCRIPTION_PROVIDERS.includes(providerId as TranscriptionProviderId);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function transcribeConfirmedRecording(
  confirmed: boolean,
  providerId: string,
  audio: Blob,
  send: (
    providerId: TranscriptionProviderId,
    mediaType: string,
    audioBase64: string,
  ) => Promise<string>,
): Promise<string | null> {
  if (!confirmed) return null;
  if (!supportsTranscription(providerId))
    throw new Error('Este provedor não tem transcrição verificada.');
  if (!audio.size) throw new Error('A gravação está vazia. Grave novamente antes de transcrever.');
  if (audio.size > MAX_TRANSCRIPTION_BYTES) {
    throw new Error('O áudio excede o limite de 25 MB. Grave um trecho menor e tente novamente.');
  }
  const bytes = new Uint8Array(await audio.arrayBuffer());
  try {
    const transcript = await send(providerId, audio.type || 'audio/webm', encodeBase64(bytes));
    if (!transcript.trim()) {
      throw new Error(
        'Nenhuma fala foi detectada no áudio. Grave novamente com a fala mais próxima do microfone.',
      );
    }
    return transcript.trim();
  } finally {
    bytes.fill(0);
  }
}

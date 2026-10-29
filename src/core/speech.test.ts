import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanSpeechText, LocalSpeechReader, localBrazilianPortugueseVoices } from './speech';

class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

afterEach(() => vi.unstubAllGlobals());

function voice(overrides: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return {
    voiceURI: 'local-pt-br',
    name: 'Voz local',
    lang: 'pt-BR',
    localService: true,
    default: false,
    ...overrides,
  } as SpeechSynthesisVoice;
}

function readerFixture(voices: SpeechSynthesisVoice[] = [voice()]) {
  const queued: FakeUtterance[] = [];
  const synthesis = {
    getVoices: () => voices,
    speak: vi.fn((utterance: FakeUtterance) => queued.push(utterance)),
    cancel: vi.fn(),
  } as unknown as SpeechSynthesis;
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { reader: new LocalSpeechReader(synthesis), queued, synthesis };
}

describe('leitura local', () => {
  it('limpa Markdown, código e endereços de links sem perder o texto do link', () => {
    expect(
      cleanSpeechText(
        '# Olá **mundo**\n- Veja [a documentação](https://exemplo.test)\n`const x = 1`\n```js\nconsole.log(1)\n```',
      ),
    ).toBe('Olá mundo Veja a documentação');
  });

  it('limita a lista às vozes locais em português do Brasil', () => {
    expect(
      localBrazilianPortugueseVoices([
        voice(),
        voice({ voiceURI: 'remote', localService: false }),
        voice({ voiceURI: 'pt-pt', lang: 'pt-PT' }),
      ]).map(({ voiceURI }) => voiceURI),
    ).toEqual(['local-pt-br']);
  });

  it('remove a fala anterior da fila antes de iniciar outra', () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const { reader, queued, synthesis } = readerFixture();
    reader.speak('Primeira resposta', 'primeira', { voiceURI: '', rate: 1, volume: 1 });
    reader.speak('Segunda resposta', 'segunda', { voiceURI: '', rate: 1.2, volume: 0.8 });

    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
    expect(queued.map(({ text }) => text)).toEqual(['Primeira resposta', 'Segunda resposta']);
    expect(queued[1]).toMatchObject({ lang: 'pt-BR', rate: 1.2, volume: 0.8 });
    expect(network).not.toHaveBeenCalled();
  });

  it('parada explícita limpa a fila e o estado atual', () => {
    const { reader, queued, synthesis } = readerFixture();
    const states: boolean[] = [];
    reader.subscribe(({ speaking }) => states.push(speaking));
    reader.speak('Resposta', 'resposta', { voiceURI: '', rate: 1, volume: 1 });
    reader.stop();

    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
    expect(queued).toHaveLength(1);
    expect(states.at(-1)).toBe(false);
  });

  it('não fala sem voz local instalada e ignora texto sem conteúdo', () => {
    const { reader, synthesis } = readerFixture([voice({ localService: false })]);
    expect(reader.speak('   ', 'vazio', { voiceURI: '', rate: 1, volume: 1 })).toBe(false);
    expect(() => reader.speak('Olá', 'resposta', { voiceURI: '', rate: 1, volume: 1 })).toThrow(
      'Nenhuma voz local',
    );
    expect(synthesis.speak).not.toHaveBeenCalled();
  });
});

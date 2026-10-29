export type LocalSpeechVoice = {
  voiceURI: string;
  name: string;
  lang: string;
  voice: SpeechSynthesisVoice;
};

export type SpeechOptions = {
  voiceURI: string;
  rate: number;
  volume: number;
};

export function cleanSpeechText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, ' ')
    .replace(/~~~[^\n]*\n[\s\S]*?(?:~~~|$)/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, ' ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b(?:https?:\/\/|mailto:)[^\s<>()]+/gi, ' ')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\\([\\`*_{}[\]()#+.!|>~-])/g, '$1')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

export function localBrazilianPortugueseVoices(
  voices: readonly SpeechSynthesisVoice[],
): LocalSpeechVoice[] {
  return voices
    .filter((voice) => voice.localService && /^pt[-_]BR$/i.test(voice.lang))
    .map((voice) => ({
      voiceURI: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      voice,
    }));
}

export type SpeechState = { key: string | null; speaking: boolean };

export class LocalSpeechReader {
  private key: string | null = null;
  private listeners = new Set<(state: SpeechState) => void>();

  constructor(private readonly synthesis: SpeechSynthesis) {}

  subscribe(listener: (state: SpeechState) => void): () => void {
    this.listeners.add(listener);
    listener({ key: this.key, speaking: this.key !== null });
    return () => this.listeners.delete(listener);
  }

  speak(text: string, key: string, options: SpeechOptions): boolean {
    const cleanText = cleanSpeechText(text);
    if (!cleanText) return false;

    const voices = localBrazilianPortugueseVoices(this.synthesis.getVoices());
    const selected = voices.find((item) => item.voiceURI === options.voiceURI) ?? voices[0];
    if (!selected) throw new Error('Nenhuma voz local em português do Brasil está instalada.');

    this.stop();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    utterance.voice = selected.voice;
    utterance.rate = Math.max(0.5, Math.min(2, options.rate));
    utterance.volume = Math.max(0, Math.min(1, options.volume));
    utterance.onstart = () => this.setKey(key);
    utterance.onend = () => {
      if (this.key === key) this.setKey(null);
    };
    utterance.onerror = () => {
      if (this.key === key) this.setKey(null);
    };
    this.setKey(key);
    this.synthesis.speak(utterance);
    return true;
  }

  stop(): void {
    this.synthesis.cancel();
    this.setKey(null);
  }

  private setKey(key: string | null): void {
    this.key = key;
    const state = { key, speaking: key !== null };
    this.listeners.forEach((listener) => listener(state));
  }
}

let sharedReader: LocalSpeechReader | null = null;

export function getLocalSpeechReader(): LocalSpeechReader | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  sharedReader ??= new LocalSpeechReader(window.speechSynthesis);
  return sharedReader;
}

export function stopLocalSpeech(): void {
  sharedReader?.stop();
}

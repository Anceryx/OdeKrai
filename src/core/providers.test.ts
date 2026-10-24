import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, providerById } from './providers';

describe('catálogo de provedores', () => {
  it('mantém os 15 conectores pedidos, com identificadores únicos', () => {
    expect(AI_PROVIDERS).toHaveLength(15);
    expect(new Set(AI_PROVIDERS.map(({ id }) => id)).size).toBe(15);
    expect(AI_PROVIDERS.map(({ name }) => name)).toEqual([
      'OpenAI',
      'Anthropic',
      'Google Gemini',
      'xAI',
      'Mistral',
      'Cohere',
      'Groq',
      'DeepSeek',
      'Perplexity',
      'Together AI',
      'OpenRouter',
      'Fireworks AI',
      'Azure OpenAI',
      'AWS Bedrock',
      'Vertex AI',
    ]);
  });

  it('separa conectores prontos para Chat Completions dos guias ainda sem adaptador', () => {
    expect(AI_PROVIDERS.filter(({ integration }) => integration === 'openai-chat')).toHaveLength(
      12,
    );
    expect(
      AI_PROVIDERS.filter(({ integration }) => integration === 'guide').map(({ id }) => id),
    ).toEqual(['vertex-ai']);
    expect(AI_PROVIDERS.filter(({ integration }) => integration !== 'guide')).toHaveLength(14);
  });

  it('configura cabeçalho de autenticação e endpoint especiais do Azure e Bedrock', () => {
    expect(providerById('azure-openai')).toMatchObject({ authMode: 'api-key', baseUrl: '' });
    expect(providerById('anthropic')).toMatchObject({ authMode: 'x-api-key' });
    expect(providerById('bedrock')).toMatchObject({ region: true, authMode: 'bearer' });
  });
});

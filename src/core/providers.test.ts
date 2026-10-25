import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, providerById } from './providers';

describe('catálogo de provedores', () => {
  it('mantém identificadores únicos para o catálogo de conectores', () => {
    expect(AI_PROVIDERS).toHaveLength(16);
    expect(new Set(AI_PROVIDERS.map(({ id }) => id)).size).toBe(16);
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
      'Cerebras',
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
      13,
    );
    expect(
      AI_PROVIDERS.filter(({ integration }) => integration === 'guide').map(({ id }) => id),
    ).toEqual(['vertex-ai']);
    expect(AI_PROVIDERS.filter(({ integration }) => integration !== 'guide')).toHaveLength(15);
  });

  it('configura cabeçalho de autenticação e endpoint especiais do Azure e Bedrock', () => {
    expect(providerById('azure-openai')).toMatchObject({ authMode: 'api-key', baseUrl: '' });
    expect(providerById('anthropic')).toMatchObject({ authMode: 'x-api-key' });
    expect(providerById('bedrock')).toMatchObject({ region: true, authMode: 'bearer' });
    expect(providerById('cerebras')).toMatchObject({
      integration: 'openai-chat',
      baseUrl: 'https://api.cerebras.ai/v1',
      authMode: 'bearer',
      freePlan: { limitsUrl: 'https://inference-docs.cerebras.ai/support/pricing' },
    });
  });

  it('marca como gratuitos apenas os provedores confirmados na documentação oficial', () => {
    expect(AI_PROVIDERS.filter(({ freePlan }) => freePlan).map(({ id }) => id)).toEqual([
      'gemini',
      'mistral',
      'groq',
      'cerebras',
      'openrouter',
    ]);
  });
});

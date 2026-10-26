import { describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from './providers';
import { openProviderLink } from './provider-links';

describe('openProviderLink', () => {
  it('mantém links de cadastro e console HTTPS para todos os conectores', () => {
    expect(AI_PROVIDERS.length).toBe(17);
    for (const provider of AI_PROVIDERS) {
      expect(new URL(provider.signupUrl).protocol, provider.id).toBe('https:');
      expect(new URL(provider.consoleUrl).protocol, provider.id).toBe('https:');
    }
    expect(AI_PROVIDERS.find((provider) => provider.id === 'perplexity')?.consoleUrl).toBe(
      'https://console.perplexity.ai/project/keys',
    );
    expect(AI_PROVIDERS.find((provider) => provider.id === 'fireworks')?.consoleUrl).toBe(
      'https://app.fireworks.ai/account/home',
    );
  });

  it('opens HTTPS addresses through the supplied system opener', async () => {
    const opener = vi.fn(async (_url: string) => undefined);

    await openProviderLink('https://console.example.com/keys', opener);

    expect(opener).toHaveBeenCalledWith('https://console.example.com/keys');
  });

  it('rejects malformed and non-HTTPS addresses without opening them', async () => {
    const opener = vi.fn(async (_url: string) => undefined);

    await expect(openProviderLink('javascript:alert(1)', opener)).rejects.toThrow('HTTPS');
    await expect(openProviderLink('not a URL', opener)).rejects.toThrow('inválido');
    expect(opener).not.toHaveBeenCalled();
  });
});

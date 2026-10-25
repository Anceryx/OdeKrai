import { describe, expect, it, vi } from 'vitest';
import { openProviderLink } from './provider-links';

describe('openProviderLink', () => {
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

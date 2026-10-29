import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('favicon do WebView', () => {
  it('declara um ICO válido que o build Vite copia para dist', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const readBinary = readFileSync as unknown as (path: URL) => Uint8Array;
    const icon = readBinary(new URL('../../public/favicon.ico', import.meta.url));
    expect(html).toContain('<link rel="icon" href="/favicon.ico"');
    expect(icon[0]).toBe(0);
    expect(icon[1]).toBe(0);
    expect(icon[2]).toBe(1);
    expect(icon[3]).toBe(0);
  });
});

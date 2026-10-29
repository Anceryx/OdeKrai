import { afterEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock, isTauri: () => true }));

import { sanitizeDiagnosticDetails, startupInvoke } from './hooks/useAppEffects';

afterEach(() => vi.unstubAllGlobals());

describe('diagnósticos da interface', () => {
  it('sanitiza stack traces sem descartar a origem do erro', () => {
    const error = new Error('Falha api_key=segredo-chave em ana@example.com');
    error.stack = `Error: ${error.message}\n    at run (C:\\Users\\Ana\\app.js:4:2)`;
    const details = sanitizeDiagnosticDetails(error);
    expect(details).toContain('Error:');
    expect(details).toContain('[caminho local]');
    expect(details).not.toContain('segredo-chave');
    expect(details).not.toContain('ana@example.com');
  });

  it('converte rejeição IPC em diagnóstico da chamada sem deixá-la desatendida', async () => {
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    invokeMock.mockImplementation((command: string) =>
      command === 'record_diagnostic_event'
        ? Promise.resolve()
        : Promise.reject(new Error('Falha api_key=segredo-chave')),
    );
    const report = vi.fn();

    await expect(startupInvoke('get_profile', undefined, report)).rejects.toThrow(
      'api_key=segredo-chave',
    );
    expect(report).toHaveBeenCalledWith(
      'get_profile',
      expect.any(String),
      expect.not.stringContaining('segredo-chave'),
    );
    expect(invokeMock).toHaveBeenCalledWith(
      'record_diagnostic_event',
      expect.objectContaining({
        section: 'startup',
        category: 'initialization',
        correlationId: expect.any(String),
      }),
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from './providers';
import { defaultSettings } from './settings';
import {
  filterProviderDirectory,
  loadConnectedProviderIds,
  removeProviderCredential,
  removeConnectedProvider,
  setPrimaryProviderSettings,
  setProviderEnabled,
  toggleProviderSettings,
} from './provider-directory';

describe('diretório de provedores', () => {
  const connected = new Set(['groq', 'openai']);

  it('consulta credenciais em sequência e preserva as que foram encontradas', async () => {
    const calls: string[] = [];
    let activeCalls = 0;
    let maxActiveCalls = 0;
    const result = await loadConnectedProviderIds(['openai', 'groq', 'gemini'], async (id) => {
      calls.push(id);
      activeCalls += 1;
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
      await Promise.resolve();
      activeCalls -= 1;
      if (id === 'groq') throw new Error('Credential Manager indisponível');
      return id === 'openai';
    });

    expect(calls).toEqual(['openai', 'groq', 'gemini']);
    expect(maxActiveCalls).toBe(1);
    expect(result.connectedIds).toEqual(new Set(['openai']));
    expect(result.failedIds).toEqual(new Set(['groq']));
  });

  it('filtra conectados, gratuitos e todos por nome', () => {
    expect(
      filterProviderDirectory(AI_PROVIDERS, 'connected', '', connected).map((p) => p.id),
    ).toEqual(['openai', 'groq']);
    expect(filterProviderDirectory(AI_PROVIDERS, 'free', '', connected).map((p) => p.id)).toEqual([
      'gemini',
      'mistral',
      'groq',
      'cerebras',
      'openrouter',
    ]);
    expect(
      filterProviderDirectory(AI_PROVIDERS, 'all', 'cere', connected).map((p) => p.id),
    ).toEqual(['cerebras']);
  });

  it('ativa e desativa o provedor sem alterar os demais campos', () => {
    expect(setProviderEnabled({ model: 'm1', enabled: true }, false)).toEqual({
      model: 'm1',
      enabled: false,
    });
  });

  it('define principal e limpa a seleção quando esse provedor é desativado', () => {
    const primary = setPrimaryProviderSettings(defaultSettings, 'groq');
    expect(primary.activeProviderId).toBe('groq');
    expect(primary.providers.groq.enabled).toBe(true);
    const disabled = toggleProviderSettings(primary, 'groq', false);
    expect(disabled.activeProviderId).toBe('');
    expect(disabled.providers.groq.enabled).toBe(false);
  });

  it('remove da lista conectada após a credencial ser removida', () => {
    expect([...removeConnectedProvider(connected, 'groq')]).toEqual(['openai']);
  });

  it('só atualiza a lista depois que a remoção da credencial confirma sucesso', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    await expect(removeProviderCredential('groq', remove, connected)).resolves.toEqual(
      new Set(['openai']),
    );
    expect(remove).toHaveBeenCalledWith('groq');
    const failed = vi.fn().mockRejectedValue(new Error('falhou'));
    await expect(removeProviderCredential('groq', failed, connected)).rejects.toThrow('falhou');
  });
});

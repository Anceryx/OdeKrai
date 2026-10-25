import type { AiProvider } from './providers';
import { defaultProviderSettings, type AppSettings } from './settings';

export type ProviderDirectoryTab = 'connected' | 'free' | 'all';

export async function loadConnectedProviderIds(
  providerIds: readonly string[],
  hasCredential: (providerId: string) => Promise<boolean>,
): Promise<{ connectedIds: Set<string>; failedIds: Set<string> }> {
  const connectedIds = new Set<string>();
  const failedIds = new Set<string>();
  for (const providerId of providerIds) {
    try {
      if (await hasCredential(providerId)) connectedIds.add(providerId);
    } catch {
      failedIds.add(providerId);
    }
  }
  return { connectedIds, failedIds };
}

export function filterProviderDirectory(
  providers: AiProvider[],
  tab: ProviderDirectoryTab,
  search: string,
  connectedIds: ReadonlySet<string>,
): AiProvider[] {
  const query = search.trim().toLocaleLowerCase('pt-BR');
  return providers.filter((provider) => {
    if (tab === 'connected' && !connectedIds.has(provider.id)) return false;
    if (tab === 'free' && !provider.freePlan) return false;
    return !query || provider.name.toLocaleLowerCase('pt-BR').includes(query);
  });
}

export function setProviderEnabled<T extends { enabled?: boolean }>(
  settings: T,
  enabled: boolean,
): T & { enabled: boolean } {
  return { ...settings, enabled };
}

export function setPrimaryProviderSettings(settings: AppSettings, providerId: string): AppSettings {
  const provider = settings.providers[providerId] ?? defaultProviderSettings(providerId);
  return {
    ...settings,
    activeProviderId: providerId,
    providers: { ...settings.providers, [providerId]: { ...provider, enabled: true } },
  };
}

export function toggleProviderSettings(
  settings: AppSettings,
  providerId: string,
  enabled: boolean,
): AppSettings {
  const provider = settings.providers[providerId] ?? defaultProviderSettings(providerId);
  return {
    ...settings,
    activeProviderId:
      !enabled && settings.activeProviderId === providerId ? '' : settings.activeProviderId,
    providers: { ...settings.providers, [providerId]: { ...provider, enabled } },
  };
}

export function removeConnectedProvider(
  connectedIds: ReadonlySet<string>,
  providerId: string,
): Set<string> {
  const next = new Set(connectedIds);
  next.delete(providerId);
  return next;
}

export async function removeProviderCredential(
  providerId: string,
  remove: (providerId: string) => Promise<unknown>,
  connectedIds: ReadonlySet<string>,
): Promise<Set<string>> {
  await remove(providerId);
  return removeConnectedProvider(connectedIds, providerId);
}

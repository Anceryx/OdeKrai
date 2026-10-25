export type UrlOpener = (url: string) => Promise<void>;

export async function openProviderLink(url: string, openUrl: UrlOpener): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Endereço inválido.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Os links dos provedores precisam usar HTTPS.');
  }
  await openUrl(parsed.href);
}

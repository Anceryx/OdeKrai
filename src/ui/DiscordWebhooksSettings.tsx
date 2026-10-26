import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button } from './DesignSystem';
import { Icon } from './Icon';

type DiscordWebhook = { id: string; name: string };

export function DiscordWebhooksSettings() {
  const [webhooks, setWebhooks] = useState<DiscordWebhook[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setWebhooks(await invoke<DiscordWebhook[]>('discord_list'));
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    setBusy(true);
    try {
      await invoke('discord_save', { name, url });
      setName('');
      setUrl('');
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(webhook: DiscordWebhook) {
    setBusy(true);
    try {
      await invoke('discord_remove', { webhookId: webhook.id });
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel settings-section allowed-folders-section">
      <h2>Webhooks do Discord</h2>
      <p className="settings-description">
        Cadastre um nome e a URL recebida do Discord. A URL fica no Gerenciador de Credenciais do
        Windows e não volta a ser exibida.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <label>
        Nome do webhook
        <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        URL do webhook
        <input
          type="password"
          autoComplete="new-password"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <Button
        variant="secondary"
        disabled={busy || !isTauri() || !name.trim() || !url}
        onClick={() => void save()}
      >
        Salvar webhook
      </Button>
      <ul className="allowed-folder-list">
        {webhooks.map((webhook) => (
          <li key={webhook.id}>
            <div>
              <strong>{webhook.name}</strong>
              <small>ID para identificar a habilidade: {webhook.id}</small>
            </div>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void remove(webhook)}
              aria-label={`Remover webhook ${webhook.name}`}
            >
              <Icon name="delete" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

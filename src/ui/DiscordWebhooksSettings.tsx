import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button } from './DesignSystem';
import { Icon } from './Icon';
import {
  revokeDiscordIntegration,
  saveDiscordIntegration,
  testDiscordConnection,
} from '../core/discord-integration';

type DiscordWebhook = { id: string; name: string };

export function DiscordWebhooksSettings({ onChanged }: { onChanged?: () => Promise<void> }) {
  const [webhooks, setWebhooks] = useState<DiscordWebhook[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [notice, setNotice] = useState('');
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
      await saveDiscordIntegration(name, url, authorized, connectionTested, invoke);
      setName('');
      setUrl('');
      setAuthorized(false);
      setConnectionTested(false);
      setNotice('Integração configurada. A URL não será exibida novamente.');
      await refresh();
      await onChanged?.();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setConnectionTested(false);
    setNotice('');
    try {
      await testDiscordConnection(url, authorized, invoke);
      setConnectionTested(true);
      setNotice('Conexão confirmada. Nenhuma mensagem foi enviada.');
      setError('');
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(webhook: DiscordWebhook) {
    const confirmed = window.confirm(
      `Revogar o webhook “${webhook.name}” no Discord? O endpoint será apagado e não poderá ser reutilizado.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await revokeDiscordIntegration(webhook.id, confirmed, invoke);
      setNotice('Webhook revogado no Discord e credencial local removida.');
      await refresh();
      await onChanged?.();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="settings-panel settings-section allowed-folders-section"
      aria-labelledby="discord-integration-heading"
    >
      <h3 id="discord-integration-heading">Discord · webhook de saída</h3>
      <p className="settings-description">
        Permite enviar mensagens ao canal associado ao webhook, sempre após aprovação da ação. Não
        há escopos OAuth nem acesso de leitura ao Discord. Revogar apaga o webhook no Discord e
        remove a credencial deste aplicativo. A ação pede confirmação e não pode ser desfeita.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success-banner">
          {notice}
        </div>
      )}
      <label className="discord-secret-field">
        Nome do webhook
        <input
          value={name}
          maxLength={60}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setConnectionTested(false);
          }}
        />
      </label>
      <label className="discord-secret-field">
        URL do webhook
        <input
          type="password"
          autoComplete="new-password"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setConnectionTested(false);
          }}
        />
      </label>
      <label className="discord-consent">
        <input
          type="checkbox"
          checked={authorized}
          onChange={(event) => setAuthorized(event.target.checked)}
        />
        Autorizo enviar a credencial ao Discord para validar o webhook, salvá-la no Gerenciador de
        Credenciais do Windows e permitir mensagens ao canal configurado, sujeitas à aprovação de
        cada ação.
      </label>
      <div className="folder-shortcuts">
        <Button
          variant="secondary"
          disabled={busy || !isTauri() || !url || !authorized}
          onClick={() => void testConnection()}
        >
          Testar conexão
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !isTauri() || !name.trim() || !url || !authorized || !connectionTested}
          onClick={() => void save()}
        >
          Autorizar e salvar
        </Button>
      </div>
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
              aria-label={`Revogar webhook ${webhook.name} no Discord e remover do aplicativo`}
            >
              <Icon name="delete" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

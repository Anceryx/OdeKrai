import { useEffect, useState, type ChangeEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button, PageHeader } from './DesignSystem';

export type ProfileData = { displayName: string; nickname: string; avatarDataUrl: string | null };
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('') || 'U';

export function Profile({
  value,
  onChange,
}: {
  value: ProfileData;
  onChange: (profile: ProfileData) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [homeConfigured, setHomeConfigured] = useState(false);
  useEffect(() => {
    void invoke<{ configured: boolean }>('agent_home_status')
      .then((status) => setHomeConfigured(status.configured))
      .catch(() => setHomeConfigured(false));
  }, []);
  useEffect(() => setDraft(value), [value]);
  async function save() {
    setBusy(true);
    try {
      const saved = await invoke<ProfileData>('save_profile', {
        displayName: draft.displayName,
        nickname: draft.nickname,
      });
      onChange(saved);
      setDraft(saved);
      setNotice('Perfil salvo neste dispositivo.');
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotice('A imagem pode ter no máximo 5 MB.');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Arquivo inválido.'));
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(file);
    }).catch((error: unknown) => {
      setNotice(String(error));
      return '';
    });
    if (!dataUrl) return;
    setBusy(true);
    try {
      const saved = await invoke<ProfileData>('save_profile_avatar', { dataUrl });
      onChange(saved);
      setDraft(saved);
      setNotice('Avatar atualizado.');
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function removeAvatar() {
    setBusy(true);
    try {
      const saved = await invoke<ProfileData>('remove_profile_avatar');
      onChange(saved);
      setDraft(saved);
      setNotice('Avatar removido.');
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function updateIdentity() {
    setBusy(true);
    try {
      const core = await invoke<{
        content: string;
        current_hash: string;
        changed_externally: boolean;
        diff: string;
      }>('agent_home_read_core');
      const safeName = draft.displayName
        .replace(/[^\p{L}\p{N} .'-]/gu, '')
        .slice(0, 60)
        .trim();
      const safeNickname = draft.nickname
        .replace(/[^\p{L}\p{N} .'-]/gu, '')
        .slice(0, 60)
        .trim();
      if (!safeName) throw new Error('Informe um nome com letras, números e pontuação simples.');
      const nameLine = core.content.match(/^(- Nome: ).*$/m);
      const nicknameLine = core.content.match(/^(- Apelido: ).*$/m);
      if (!nameLine || !nicknameLine)
        throw new Error('Não foi possível localizar os campos de perfil no ODEKRAI.md.');
      let next = core.content.replace(
        /^(- Nome: ).*$/m,
        (_line, prefix: string) => `${prefix}${safeName}`,
      );
      next = next.replace(
        /^(- Apelido: ).*$/m,
        (_line, prefix: string) => `${prefix}${safeNickname || 'não informado'}`,
      );
      const diff = `- ${nameLine[0].slice(2)}\n+ Nome: ${safeName}\n- ${nicknameLine[0].slice(2)}\n+ Apelido: ${safeNickname || 'não informado'}`;
      const externalDiff = core.changed_externally
        ? `\n\nO arquivo também contém alterações externas:\n${core.diff}`
        : '';
      if (!window.confirm(`Aprovar esta alteração no ODEKRAI.md?\n\n${diff}${externalDiff}`))
        return;
      await invoke('agent_home_save_core', { content: next, expectedHash: core.current_hash });
      setNotice('Identidade do agente atualizada com sua aprovação.');
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  if (!isTauri())
    return (
      <div className="page">
        <h1>Perfil</h1>
        <p>Abra o aplicativo OdeKrai para editar seu perfil.</p>
      </div>
    );
  return (
    <div className="page profile-page">
      <PageHeader
        eyebrow="PREFERÊNCIAS PESSOAIS"
        title="Seu perfil"
        subtitle="O perfil fica no dispositivo. A imagem nunca é enviada ao provedor de IA."
      />
      <section className="settings-panel profile-panel">
        <div className="profile-avatar-preview">
          {draft.avatarDataUrl ? (
            <img src={draft.avatarDataUrl} alt="Avatar do perfil" />
          ) : (
            initials(draft.displayName)
          )}
        </div>
        <div className="profile-actions">
          <label className="secondary-button">
            Trocar avatar
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void chooseAvatar(event)}
              disabled={busy}
              hidden
            />
          </label>
          {draft.avatarDataUrl && (
            <button className="text-button" onClick={() => void removeAvatar()} disabled={busy}>
              Remover avatar
            </button>
          )}
          <small>
            PNG, JPEG ou WebP; até 5 MB. A imagem será recortada e redimensionada para 256 × 256 px.
          </small>
        </div>
        <label className="field-label">
          Nome de exibição
          <input
            value={draft.displayName}
            maxLength={80}
            onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
          />
        </label>
        <label className="field-label">
          Apelido (opcional)
          <input
            value={draft.nickname}
            maxLength={40}
            onChange={(event) => setDraft({ ...draft, nickname: event.target.value })}
          />
        </label>
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={busy || !draft.displayName.trim()}
        >
          Salvar perfil
        </Button>
        {homeConfigured && (
          <button
            className="secondary-button"
            onClick={() => void updateIdentity()}
            disabled={busy || !draft.displayName.trim()}
          >
            Atualizar nome no ODEKRAI.md…
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
    </div>
  );
}

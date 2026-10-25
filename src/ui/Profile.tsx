import { useEffect, useState, type ChangeEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button } from './DesignSystem';
import { sanitizeIdentityName } from '../core/identity';

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
  onBeforeSave,
}: {
  value: ProfileData;
  onChange: (profile: ProfileData) => void;
  onBeforeSave?: (profile: ProfileData) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(value), [value]);
  async function save() {
    setBusy(true);
    try {
      const normalized = {
        ...draft,
        displayName: sanitizeIdentityName(draft.displayName, 60),
        nickname: sanitizeIdentityName(draft.nickname, 40),
      };
      if (!normalized.displayName) throw new Error('Informe seu nome.');
      if (onBeforeSave && !(await onBeforeSave(normalized))) return;
      const saved = await invoke<ProfileData>('save_profile', {
        displayName: normalized.displayName,
        nickname: normalized.nickname,
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
  if (!isTauri())
    return (
      <div className="page">
        <h1>Perfil</h1>
        <p>Abra o aplicativo OdeKrai para editar seu perfil.</p>
      </div>
    );
  return (
    <section className="settings-panel profile-panel">
      <h2>Perfil</h2>
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
          maxLength={60}
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
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

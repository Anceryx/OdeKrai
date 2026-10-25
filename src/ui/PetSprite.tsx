import { useEffect, useState, type CSSProperties } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  DEFAULT_PET_ID,
  petImageUrl,
  petMotionDisabled,
  type PetAnimationState,
} from '../core/pets';
import { Icon, type IconName } from './Icon';

export function PetSprite({
  estado,
  petId,
  reduceMotion = false,
  className = '',
  avatar = false,
  style,
}: {
  estado: PetAnimationState;
  petId?: string;
  reduceMotion?: boolean;
  className?: string;
  avatar?: boolean;
  style?: CSSProperties;
}) {
  const [storedPetId, setStoredPetId] = useState(DEFAULT_PET_ID);
  const [imageFailed, setImageFailed] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(query.matches);
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);
  useEffect(() => {
    if (!isTauri() || petId) return;
    let unlisten: (() => void) | undefined;
    void invoke<string>('get_selected_pet')
      .then(setStoredPetId)
      .catch(() =>
        console.warn('[OdeKrai diagnóstico] Não foi possível carregar o personagem salvo.'),
      );
    void listen<string>('selected-pet-updated', ({ payload }) => setStoredPetId(payload)).then(
      (off) => {
        unlisten = off;
      },
    );
    return () => unlisten?.();
  }, [petId]);

  const selected = petId ?? storedPetId;
  useEffect(() => setImageFailed(false), [selected]);
  const image = imageFailed ? null : petImageUrl(selected);
  return (
    <span
      className={`pet-sprite pet-state-${estado} ${petMotionDisabled(reduceMotion, prefersReducedMotion) ? 'pet-reduce-motion' : ''} ${avatar ? 'pet-avatar' : ''} ${className}`.trim()}
      role={avatar ? 'img' : undefined}
      aria-label={avatar ? 'Avatar do OdeKrai' : undefined}
      aria-hidden={avatar ? undefined : true}
      style={style}
    >
      <span className="pet-shadow" aria-hidden="true" />
      {image ? (
        <img
          className="pet-image"
          src={image}
          alt=""
          draggable="false"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="pet-fallback" aria-hidden="true">
          <i />
          <b />
        </span>
      )}
      <span className="pet-overlay" aria-hidden="true">
        {estado !== 'idle' && (
          <Icon
            name={
              (
                {
                  thinking: 'pending',
                  working: 'activity',
                  awaiting_approval: 'pending',
                  success: 'success',
                  error: 'error',
                  paused: 'stop',
                } as Partial<Record<PetAnimationState, IconName>>
              )[estado] ?? 'activity'
            }
            size={20}
          />
        )}
      </span>
    </span>
  );
}

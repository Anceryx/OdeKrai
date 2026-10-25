import { useEffect, useState, type CSSProperties } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  DEFAULT_PET_ID,
  petAnimationSheet,
  petImageUrl,
  petMotionDisabled,
  petVisualMode,
  type PetAnimationState,
} from '../core/pets';
import { Icon, type IconName } from './Icon';

export function PetSprite({
  estado,
  petId,
  reduceMotion = false,
  className = '',
  avatar = false,
  staticImage = false,
  style,
}: {
  estado: PetAnimationState;
  petId?: string;
  reduceMotion?: boolean;
  className?: string;
  avatar?: boolean;
  staticImage?: boolean;
  style?: CSSProperties;
}) {
  const [storedPetId, setStoredPetId] = useState(DEFAULT_PET_ID);
  const [imageFailed, setImageFailed] = useState(false);
  const [sheetFailed, setSheetFailed] = useState(false);
  const [visualState, setVisualState] = useState(estado);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
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
  useEffect(() => setVisualState(estado), [estado]);
  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
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
  const motionDisabled = petMotionDisabled(reduceMotion, prefersReducedMotion);
  const sheet = avatar || staticImage ? null : petAnimationSheet(selected, visualState);
  useEffect(() => {
    setImageFailed(false);
    setSheetFailed(false);
  }, [selected, sheet?.url]);
  const image = imageFailed ? null : petImageUrl(selected);
  const visualMode = petVisualMode(Boolean(sheet && !sheetFailed), Boolean(image));
  return (
    <span
      className={`pet-sprite pet-state-${visualState} ${motionDisabled ? 'pet-reduce-motion' : ''} ${!documentVisible ? 'pet-hidden' : ''} ${avatar ? 'pet-avatar' : ''} ${className}`.trim()}
      role={avatar ? 'img' : undefined}
      aria-label={avatar ? 'Avatar do OdeKrai' : undefined}
      aria-hidden={avatar ? undefined : true}
      style={style}
    >
      <span className="pet-shadow" aria-hidden="true" />
      {visualMode === 'animated' && sheet ? (
        <span className="pet-sheet-viewport" aria-hidden="true">
          <img
            className={`pet-sheet ${sheet.loop ? 'pet-sheet-loop' : 'pet-sheet-once'}`}
            src={sheet.url}
            alt=""
            draggable="false"
            style={
              {
                '--pet-steps': sheet.frames - 1,
                '--pet-duration': `${sheet.frames / sheet.fps}s`,
                '--pet-last-frame': `-${((sheet.frames - 1) / sheet.frames) * 100}%`,
                width: `${sheet.frames * 100}%`,
                animationPlayState: documentVisible ? 'running' : 'paused',
              } as CSSProperties
            }
            onAnimationEnd={() => {
              if (!sheet.loop) setVisualState('idle');
            }}
            onError={() => setSheetFailed(true)}
          />
        </span>
      ) : visualMode === 'static' && image ? (
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

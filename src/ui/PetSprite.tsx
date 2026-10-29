import { useEffect, useState, type CSSProperties } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  DEFAULT_PET_ID,
  PETS,
  petAnimationSheet,
  petImageUrl,
  petMotionDisabled,
  petVisualMode,
  type PetAnimationState,
} from '../core/pets';
import { Icon, type IconName } from './Icon';
import { canAnimateIdle, idleCue, idleCueDelay, type IdleCue } from '../core/idle-motion';

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
  const [idleCueState, setIdleCueState] = useState<IdleCue | null>(null);
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
    if (!isTauri() || getCurrentWindow().label !== 'pet') return;
    let unlisten: (() => void) | undefined;
    void listen<boolean>('pet-window-visibility', ({ payload }) =>
      setDocumentVisible(payload),
    ).then((off) => {
      unlisten = off;
    });
    return () => unlisten?.();
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
  const pet = PETS.find((entry) => entry.id === selected);
  const accessibleDescription = pet?.altText ?? 'Mascote do OdeKrai';
  const motionDisabled = petMotionDisabled(reduceMotion, prefersReducedMotion);
  const isIslandPet = className.split(/\s+/).includes('island-mascot-renderer');
  useEffect(() => {
    if (
      !canAnimateIdle({
        enabled: isIslandPet && !motionDisabled,
        visible: documentVisible,
        idle: estado === 'idle',
      })
    ) {
      setIdleCueState(null);
      return;
    }
    let cueTimer = 0;
    let resetTimer = 0;
    let active = true;
    const scheduleCue = () => {
      cueTimer = window.setTimeout(() => {
        if (!active) return;
        const cue = idleCue(Math.random());
        setIdleCueState(cue);
        resetTimer = window.setTimeout(
          () => {
            setIdleCueState(null);
            scheduleCue();
          },
          cue === 'blink' ? 140 : 280,
        );
      }, idleCueDelay(Math.random()));
    };
    scheduleCue();
    return () => {
      active = false;
      window.clearTimeout(cueTimer);
      window.clearTimeout(resetTimer);
    };
  }, [className, documentVisible, estado, motionDisabled]);
  const sheet = avatar || staticImage ? null : petAnimationSheet(selected, visualState);
  useEffect(() => {
    setImageFailed(false);
    setSheetFailed(false);
  }, [selected, sheet?.url]);
  const image = imageFailed ? null : petImageUrl(selected);
  const visualMode = petVisualMode(Boolean(sheet && !sheetFailed), Boolean(image));
  return (
    <span
      className={`pet-sprite pet-state-${visualState} ${idleCueState ? `pet-idle-${idleCueState}` : ''} ${motionDisabled ? 'pet-reduce-motion' : ''} ${!documentVisible ? 'pet-hidden' : ''} ${avatar ? 'pet-avatar' : ''} ${className}`.trim()}
      role="img"
      aria-label={avatar ? `Avatar do OdeKrai: ${accessibleDescription}` : accessibleDescription}
      title={accessibleDescription}
      style={style}
    >
      <span className="pet-shadow" aria-hidden="true" />
      {visualMode === 'animated' && sheet ? (
        <span className="pet-sheet-viewport" aria-hidden="true">
          <img
            className={`pet-sheet ${sheet.loop ? 'pet-sheet-loop' : 'pet-sheet-once'}`}
            src={sheet.url}
            alt={pet?.altText ?? ''}
            draggable="false"
            style={
              {
                '--pet-steps': sheet.frames - 1,
                '--pet-duration': `${sheet.frames / sheet.fps}s`,
                '--pet-last-frame': `-${((sheet.frames - 1) / sheet.frames) * 100}%`,
                width: `${sheet.frames * 100}%`,
                animationPlayState: documentVisible && !motionDisabled ? 'running' : 'paused',
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
          alt={pet?.altText ?? ''}
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

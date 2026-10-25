import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { loadSettings, saveSettings } from '../core/settings';
import { normalizeSoundPreferences, playSound } from '../core/sounds';
import { initialIslandSnapshot, transitionIsland, type IslandEvent } from '../core/island';
import { petAnimationForIslandState, type PetAnimationState } from '../core/pets';
import { PetSprite } from './PetSprite';

export function DesktopCharacter() {
  const [settings, setSettings] = useState(loadSettings);
  const [error, setError] = useState('');
  const [petState, setPetState] = useState<PetAnimationState>('idle');
  const [returning, setReturning] = useState(false);
  const activitySnapshot = useRef(initialIslandSnapshot);
  const moveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    document.body.classList.add('island-window-body');
    document.documentElement.classList.add('island-window-html');
    const refresh = () => setSettings(loadSettings());
    window.addEventListener('storage', refresh);
    let unlisten: (() => void)[] = [];
    void Promise.all([
      listen<[number, number]>('character-moved', ({ payload: [x, y] }) => {
        window.clearTimeout(moveTimer.current);
        moveTimer.current = window.setTimeout(() => {
          const current = loadSettings();
          saveSettings({
            ...current,
            companion: { ...current.companion, desktopCoordinates: { x, y } },
          });
        }, 180);
      }),
      listen<IslandEvent>('companion-state', ({ payload }) => {
        activitySnapshot.current = transitionIsland(activitySnapshot.current, payload);
        setPetState(petAnimationForIslandState(activitySnapshot.current.state));
      }),
    ]).then((off) => {
      unlisten = off;
    });
    return () => {
      document.body.classList.remove('island-window-body');
      document.documentElement.classList.remove('island-window-html');
      window.removeEventListener('storage', refresh);
      window.clearTimeout(moveTimer.current);
      unlisten.forEach((stop) => stop());
    };
  }, []);

  async function returnHome() {
    const current = loadSettings();
    const companion = { ...current.companion, freeMode: false, enabled: true };
    const width = 280 * companion.size;
    const height = 150 * companion.size;
    const right = companion.position.endsWith('right');
    const bottom = companion.position.startsWith('bottom');
    const x =
      companion.coordinates?.x ?? (right ? Math.max(0, screen.availWidth - width - 28) : 28);
    const y =
      companion.coordinates?.y ?? (bottom ? Math.max(0, screen.availHeight - height - 58) : 28);
    try {
      setReturning(true);
      await invoke('set_island_position', { x, y, size: companion.size });
      await invoke('set_island_topmost', { enabled: companion.alwaysOnTop });
      await invoke('set_island_visible', { visible: true });
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      await invoke('set_character_visible', { visible: false });
      saveSettings({ ...current, companion });
      await emit('companion-state', { type: 'reveal' });
      void playSound('return_home', normalizeSoundPreferences(companion.sounds));
      setError('');
      setReturning(false);
    } catch {
      setReturning(false);
      setError('Não foi possível retornar o pet à posição inicial. Tente novamente.');
    }
  }

  return (
    <main
      className={`desktop-character ${returning ? 'desktop-returning' : ''} ${settings.reduceMotion ? 'reduce-motion' : ''}`}
    >
      <div className="desktop-drag-handle" data-tauri-drag-region aria-hidden="true" />
      <PetSprite
        className="desktop-model"
        estado={petState}
        reduceMotion={settings.reduceMotion}
        style={{
          inset: `${8 * settings.companion.size}px`,
          width: `${160 * settings.companion.size}px`,
          height: `${160 * settings.companion.size}px`,
        }}
      />
      <button
        className="desktop-return"
        onClick={() => void returnHome()}
        aria-label="Retornar o OdeKrai à posição inicial"
      >
        ↩
      </button>
      <span className="desktop-tooltip">Voltar à posição inicial</span>
      {error && (
        <span className="desktop-error" role="alert">
          {error}
        </span>
      )}
      {settings.reduceMotion && <span className="sr-only">Movimento reduzido ativo</span>}
    </main>
  );
}

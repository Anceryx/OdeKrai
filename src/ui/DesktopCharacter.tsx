import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { loadSettings, saveSettings } from '../core/settings';
import { normalizeSoundPreferences, playSound } from '../core/sounds';
import { initialIslandSnapshot, transitionIsland, type IslandEvent } from '../core/island';
import { expressionForIslandState, type MascotExpression } from '../core/mascot';
import { OdekraiMascot, type MascotMotionRequest } from './OdekraiMascot';

export function DesktopCharacter() {
  const [settings, setSettings] = useState(loadSettings);
  const [error, setError] = useState('');
  const [expression, setExpression] = useState<MascotExpression>('idle');
  const [motionRequest, setMotionRequest] = useState<MascotMotionRequest>();
  const motionId = useRef(0);
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
        setExpression(expressionForIslandState(activitySnapshot.current.state));
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
      setMotionRequest({
        type: 'returning-home',
        startedAt: performance.now(),
        id: ++motionId.current,
      });
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
      onPointerDown={() => {
        setMotionRequest({
          type: 'dragging',
          startedAt: performance.now(),
          id: ++motionId.current,
        });
      }}
      onPointerUp={() => {
        window.setTimeout(() => {
          setMotionRequest({ type: 'idle', startedAt: performance.now(), id: ++motionId.current });
        }, 300);
      }}
    >
      <div className="desktop-drag-handle" data-tauri-drag-region aria-hidden="true" />
      <OdekraiMascot
        className={`desktop-model desktop-${expression}`}
        expression={expression}
        reduceMotion={settings.reduceMotion}
        motionRequest={motionRequest}
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

import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { loadSettings, saveSettings } from '../core/settings';
import { normalizeSoundPreferences, playSound } from '../core/sounds';
import type { IslandEvent } from '../core/island';

export function DesktopCharacter() {
  const [settings, setSettings] = useState(loadSettings);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState('idle');
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
        if (payload.type === 'activity') setActivity(payload.state);
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
      await invoke('set_island_position', { x, y, size: companion.size });
      await invoke('set_island_topmost', { enabled: companion.alwaysOnTop });
      await invoke('set_island_visible', { visible: true });
      await invoke('set_character_visible', { visible: false });
      saveSettings({ ...current, companion });
      await emit('companion-state', { type: 'reveal' });
      void playSound('return_home', normalizeSoundPreferences(companion.sounds));
      setError('');
    } catch {
      setError('Não foi possível retornar à ilha. Tente novamente.');
    }
  }

  return (
    <main className="desktop-character">
      <div className="desktop-drag-handle" data-tauri-drag-region aria-hidden="true" />
      <button
        className={`desktop-mascot desktop-${activity}`}
        aria-label={`Marcador geométrico temporário do Odekrai. Estado: ${activity}`}
        title="ODEKRAI"
      >
        <span>O</span>
      </button>
      <button
        className="desktop-return"
        onClick={() => void returnHome()}
        aria-label="Retornar o marcador à ilha"
      >
        ↩
      </button>
      <span className="desktop-tooltip">Voltar à ilha</span>
      {error && (
        <span className="desktop-error" role="alert">
          {error}
        </span>
      )}
      {settings.reduceMotion && <span className="sr-only">Movimento reduzido ativo</span>}
    </main>
  );
}

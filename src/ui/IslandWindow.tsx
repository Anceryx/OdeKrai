import { useEffect, useRef, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  initialIslandSnapshot,
  islandLabels,
  transitionIsland,
  type IslandEvent,
  type IslandSnapshot,
} from '../core/island';
import { loadSettings, saveSettings } from '../core/settings';
import { normalizeSoundPreferences, playSound } from '../core/sounds';

export function IslandWindow() {
  const [snapshot, setSnapshot] = useState<IslandSnapshot>(initialIslandSnapshot);
  const [settings, setSettings] = useState(loadSettings);
  const moveTimer = useRef<number | undefined>(undefined);
  const heightRef = useRef(150 * settings.companion.size);
  useEffect(() => {
    document.body.classList.add('island-window-body');
    document.documentElement.classList.add('island-window-html');
    const refreshSettings = () => setSettings(loadSettings());
    window.addEventListener('storage', refreshSettings);
    let unlisten: (() => void)[] = [];
    void Promise.all([
      listen<IslandEvent>('companion-state', ({ payload }) =>
        setSnapshot((current) => transitionIsland(current, payload)),
      ),
      listen<[number, number]>('companion-moved', ({ payload: [x, y] }) => {
        window.clearTimeout(moveTimer.current);
        moveTimer.current = window.setTimeout(() => {
          const current = loadSettings();
          saveSettings({ ...current, companion: { ...current.companion, coordinates: { x, y } } });
        }, 180);
      }),
    ]).then((off) => {
      unlisten = off;
    });
    return () => {
      document.body.classList.remove('island-window-body');
      document.documentElement.classList.remove('island-window-html');
      window.removeEventListener('storage', refreshSettings);
      window.clearTimeout(moveTimer.current);
      unlisten.forEach((off) => off());
    };
  }, []);
  useEffect(() => {
    let active = true;
    const scale = settings.companion.size;
    const start = heightRef.current;
    const end = (snapshot.state === 'expanded' ? 230 : 150) * scale;
    void (async () => {
      for (let step = 1; step <= 8 && active; step++) {
        const height = start + ((end - start) * step) / 8;
        await invoke('set_island_height', { size: scale, height });
        heightRef.current = height;
        await new Promise((resolve) => window.setTimeout(resolve, 18));
      }
    })();
    return () => {
      active = false;
    };
  }, [snapshot.state, settings.companion.size]);
  useEffect(() => {
    if (snapshot.state === 'expanded') {
      const timer = window.setTimeout(
        () => setSnapshot((current) => transitionIsland(current, { type: 'timeout' })),
        settings.companion.collapseSeconds * 1000,
      );
      return () => window.clearTimeout(timer);
    }
  }, [snapshot.state, settings.companion.collapseSeconds]);
  const send = async (event: IslandEvent, sound?: Parameters<typeof playSound>[0]) => {
    setSnapshot((current) => transitionIsland(current, event));
    if (sound) await playSound(sound, normalizeSoundPreferences(settings.companion.sounds));
    await emit('companion-state', event);
  };
  const state = snapshot.state;
  return (
    <main
      className={`floating-island state-${state} ${settings.reduceMotion ? 'reduce-motion' : ''}`}
    >
      <div
        className="island-shell"
        onMouseEnter={() => {
          void playSound('hover', normalizeSoundPreferences(settings.companion.sounds));
          if (settings.companion.openOnHover && state !== 'expanded') {
            void send({ type: 'open' }, 'island_open');
          }
        }}
      >
        <div className="island-drag-handle" data-tauri-drag-region aria-hidden="true" />
        <div className="island-orbit" aria-hidden="true" />
        {!settings.companion.freeMode && (
          <button
            className="island-mascot"
            aria-label="Abrir o Companion"
            onClick={() =>
              void send(
                { type: state === 'expanded' ? 'close' : 'open' },
                state === 'expanded' ? 'island_close' : 'island_open',
              )
            }
          >
            <span className="mascot-glyph" aria-hidden="true">
              O
            </span>
          </button>
        )}
        <div className="island-copy">
          <strong>ODEKRAI</strong>
          <span>{snapshot.message || islandLabels[state]}</span>
        </div>
        <button
          className="island-action"
          aria-label={state === 'expanded' ? 'Recolher Companion' : 'Expandir Companion'}
          onClick={() =>
            void send(
              { type: state === 'expanded' ? 'close' : 'open' },
              state === 'expanded' ? 'island_close' : 'island_open',
            )
          }
        >
          {state === 'expanded' ? '−' : '+'}
        </button>
        {state === 'expanded' && (
          <div className="island-expanded">
            <span className="island-status">
              <i />
              {islandLabels[state]}
            </span>
            <button
              onClick={() => {
                const current = loadSettings();
                saveSettings({ ...current, companion: { ...current.companion, enabled: false } });
                void send({ type: 'hide' }, 'sleep');
                void invoke('set_island_visible', { visible: false });
              }}
            >
              Ocultar
            </button>
            {!settings.companion.freeMode && (
              <button
                onClick={() => {
                  const current = loadSettings();
                  const companion = { ...current.companion, freeMode: true };
                  saveSettings({ ...current, companion });
                  const x =
                    companion.desktopCoordinates?.x ??
                    Math.max(0, (screen.availWidth - 104 * companion.size) / 2);
                  const y =
                    companion.desktopCoordinates?.y ??
                    Math.max(0, (screen.availHeight - 104 * companion.size) / 2);
                  void invoke('set_character_position', { x, y, size: companion.size })
                    .then(() => invoke('set_character_visible', { visible: true }))
                    .then(() =>
                      playSound('drag_start', normalizeSoundPreferences(companion.sounds)),
                    )
                    .catch(() => {
                      const latest = loadSettings();
                      saveSettings({
                        ...latest,
                        companion: { ...latest.companion, freeMode: false },
                      });
                      void emit('companion-state', {
                        type: 'activity',
                        state: 'error',
                        message: 'Não foi possível mover o marcador para o desktop',
                      });
                    });
                }}
              >
                Modo livre
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

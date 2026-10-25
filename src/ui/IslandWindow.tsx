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
import { petAnimationForIslandState } from '../core/pets';
import { PetSprite } from './PetSprite';
import { Icon } from './Icon';

export function IslandWindow() {
  const [snapshot, setSnapshot] = useState<IslandSnapshot>(initialIslandSnapshot);
  const [settings, setSettings] = useState(loadSettings);
  const moveTimer = useRef<number | undefined>(undefined);
  const heightRef = useRef((settings.companion.freeMode ? 176 : 150) * settings.companion.size);
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
      listen<[number, number]>('pet-moved', ({ payload: [x, y] }) => {
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
    const baseHeight = settings.companion.freeMode ? 176 : 150;
    const end = (snapshot.state === 'expanded' ? 280 : baseHeight) * scale;
    void (async () => {
      for (let step = 1; step <= 8 && active; step++) {
        const height = start + ((end - start) * step) / 8;
        await invoke('set_pet_size', {
          width:
            (settings.companion.freeMode ? (snapshot.state === 'expanded' ? 360 : 176) : 280) *
            scale,
          height,
        });
        heightRef.current = height;
        await new Promise((resolve) => window.setTimeout(resolve, 18));
      }
    })();
    return () => {
      active = false;
    };
  }, [snapshot.state, settings.companion.freeMode, settings.companion.size]);
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
      className={`floating-island ${settings.companion.freeMode ? 'free-mode' : 'island-mode'} state-${state} ${settings.reduceMotion ? 'reduce-motion' : ''}`}
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
        <button
          className="island-mascot"
          data-tauri-drag-region={settings.companion.freeMode ? '' : undefined}
          aria-label="Abrir o assistente do OdeKrai"
          onClick={() => void send({ type: state === 'expanded' ? 'close' : 'open' })}
        >
          <PetSprite
            className="island-mascot-renderer"
            estado={petAnimationForIslandState(state)}
            reduceMotion={settings.reduceMotion}
          />
        </button>
        {!settings.companion.freeMode && (
          <span className="island-copy">
            <strong>OdeKrai</strong>
            <span>{snapshot.message || islandLabels[state]}</span>
          </span>
        )}
        {!settings.companion.freeMode && (
          <button
            className="island-action"
            aria-label={
              state === 'expanded' ? 'Recolher pet do OdeKrai' : 'Expandir pet do OdeKrai'
            }
            onClick={() =>
              void send(
                { type: state === 'expanded' ? 'close' : 'open' },
                state === 'expanded' ? 'island_close' : 'island_open',
              )
            }
          >
            <Icon name={state === 'expanded' ? 'minus' : 'plus'} />
          </button>
        )}
        {state === 'expanded' && (
          <div className="island-expanded">
            <span className="island-status">
              <i />
              {islandLabels[state]}
            </span>
            <button onClick={() => void emit('pet-action', 'open')}>Abrir o OdeKrai</button>
            <button onClick={() => void emit('pet-action', 'new-chat')}>Nova conversa</button>
            <button onClick={() => void emit('pet-action', 'stop')}>Parar tudo</button>
            <button onClick={() => void emit('pet-action', 'mute')}>Silenciar</button>
            <button
              onClick={() => {
                const current = loadSettings();
                saveSettings({ ...current, companion: { ...current.companion, enabled: false } });
                void send({ type: 'hide' }, 'sleep');
                void invoke('set_pet_visible', { visible: false });
              }}
            >
              Ocultar
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

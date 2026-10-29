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
import { DEFAULT_PET_ID, PETS, petAnimationForIslandState, petGreeting } from '../core/pets';
import { PetSprite } from './PetSprite';
import { Icon } from './Icon';
import { petWindowLayout } from '../core/pet-layout';

export function IslandWindow() {
  const [snapshot, setSnapshot] = useState<IslandSnapshot>(initialIslandSnapshot);
  const [settings, setSettings] = useState(loadSettings);
  const [selectedPetId, setSelectedPetId] = useState(DEFAULT_PET_ID);
  const moveTimer = useRef<number | undefined>(undefined);
  const initialLayout = petWindowLayout(
    settings.companion.freeMode,
    false,
    settings.companion.size,
  );
  const layoutRef = useRef(initialLayout);
  useEffect(() => {
    document.body.classList.add('island-window-body');
    document.documentElement.classList.add('island-window-html');
    const refreshSettings = () => setSettings(loadSettings());
    window.addEventListener('storage', refreshSettings);
    let unlisten: (() => void)[] = [];
    void Promise.all([
      listen<IslandEvent>('companion-state', ({ payload }) => {
        if (payload.type !== 'activity') {
          setSnapshot((current) => transitionIsland(current, payload));
          return;
        }
        if (payload.state === 'awaiting_approval') return;
        void invoke('enqueue_pet_activity', { state: payload.state }).catch(() => {});
      }),
      listen<{
        alertId?: string;
        state: IslandSnapshot['state'];
        message: string;
        count: number;
        pinned: boolean;
      }>('pet-alert-state', ({ payload }) =>
        setSnapshot((current) =>
          transitionIsland(current, {
            type: 'sync-alert',
            alert: {
              alertId: payload.alertId,
              state: payload.state,
              message: payload.message,
              alertCount: payload.count,
              pinned: payload.pinned,
            },
          }),
        ),
      ),
      listen<[number, number]>('pet-moved', ({ payload: [x, y] }) => {
        window.clearTimeout(moveTimer.current);
        moveTimer.current = window.setTimeout(() => {
          const current = loadSettings();
          saveSettings({ ...current, companion: { ...current.companion, coordinates: { x, y } } });
        }, 180);
      }),
      listen<string>('selected-pet-updated', ({ payload }) => {
        if (PETS.some((pet) => pet.id === payload)) setSelectedPetId(payload);
      }),
    ]).then((off) => {
      unlisten = off;
    });
    void invoke<string>('get_selected_pet')
      .then((petId) => {
        if (PETS.some((pet) => pet.id === petId)) setSelectedPetId(petId);
      })
      .catch(() => {});
    void invoke<{
      alertId?: string;
      state: IslandSnapshot['state'];
      message: string;
      count: number;
      pinned: boolean;
    }>('get_pet_alert_state')
      .then((payload) =>
        setSnapshot((current) =>
          transitionIsland(current, {
            type: 'sync-alert',
            alert: {
              alertId: payload.alertId,
              state: payload.state,
              message: payload.message,
              alertCount: payload.count,
              pinned: payload.pinned,
            },
          }),
        ),
      )
      .catch(() => {});
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
    const start = layoutRef.current;
    const end = petWindowLayout(settings.companion.freeMode, snapshot.state === 'expanded', scale);
    void (async () => {
      for (let step = 1; step <= 8 && active; step++) {
        const width = start.width + ((end.width - start.width) * step) / 8;
        const height = start.height + ((end.height - start.height) * step) / 8;
        await invoke('set_pet_size', {
          width,
          height,
        });
        layoutRef.current = { width, height };
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
  useEffect(() => {
    if (
      snapshot.pinned ||
      !snapshot.alertId ||
      !['completed', 'error', 'paused', 'notification'].includes(snapshot.state)
    )
      return;
    const id = snapshot.alertId;
    const timer = window.setTimeout(
      () => {
        void invoke('dismiss_pet_alert', { alertId: id }).catch(() => {});
      },
      snapshot.state === 'notification' ? 5000 : 2400,
    );
    return () => window.clearTimeout(timer);
  }, [snapshot.alertId, snapshot.pinned, snapshot.state]);
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
        <button
          className="island-mascot"
          data-tauri-drag-region={settings.companion.freeMode ? '' : undefined}
          aria-label="Abrir o assistente do OdeKrai"
          onClick={() => {
            const preferences = normalizeSoundPreferences(settings.companion.sounds);
            void playSound('click', preferences, {
              petVisible: true,
            });
            if (settings.companion.freeMode) {
              void playSound('happy', preferences, { petVisible: true });
            }
            void send({ type: state === 'expanded' ? 'close' : 'open' });
          }}
        >
          <PetSprite
            className="island-mascot-renderer"
            estado={petAnimationForIslandState(state)}
            reduceMotion={settings.reduceMotion}
          />
        </button>
        {!settings.companion.freeMode && (
          <span className="island-copy">
            <strong>{petGreeting(selectedPetId)}</strong>
            <span>{snapshot.message || islandLabels[state]}</span>
            {(snapshot.alertCount ?? 0) > 1 && <small>{snapshot.alertCount} alertas na fila</small>}
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
            <button
              className="island-action-open"
              onClick={() => {
                void playSound('click', normalizeSoundPreferences(settings.companion.sounds), {
                  petVisible: true,
                });
                void emit('pet-action', 'open');
              }}
            >
              <Icon name="home" />
              <span>Abrir o OdeKrai</span>
            </button>
            <button
              className="island-action-chat"
              onClick={() => {
                void playSound('click', normalizeSoundPreferences(settings.companion.sounds), {
                  petVisible: true,
                });
                void emit('pet-action', 'new-chat');
              }}
            >
              <Icon name="chat" />
              <span>Nova conversa</span>
            </button>
            <button
              className="island-action-stop"
              onClick={() => {
                void playSound('click', normalizeSoundPreferences(settings.companion.sounds), {
                  petVisible: true,
                });
                void emit('pet-action', 'stop');
              }}
            >
              <Icon name="stop" />
              <span>Parar tudo</span>
            </button>
            <button
              className="island-action-mute"
              onClick={() => {
                void playSound('click', normalizeSoundPreferences(settings.companion.sounds), {
                  petVisible: true,
                });
                void emit('pet-action', 'mute');
              }}
            >
              <Icon name="mute" />
              <span>Silenciar</span>
            </button>
            <button
              className="island-action-hide"
              onClick={async () => {
                const current = loadSettings();
                void playSound('click', normalizeSoundPreferences(settings.companion.sounds), {
                  petVisible: true,
                });
                await playSound('sleep', normalizeSoundPreferences(settings.companion.sounds), {
                  petVisible: true,
                });
                saveSettings({ ...current, companion: { ...current.companion, enabled: false } });
                await send({ type: 'hide' });
                await invoke('set_pet_visible', { visible: false });
                await emit('pet-visibility-changed', false);
              }}
            >
              <Icon name="close" />
              <span>Ocultar</span>
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

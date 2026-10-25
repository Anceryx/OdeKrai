import { useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  normalizeSoundPreferences,
  playSound,
  SOUND_EVENT_LABELS,
  SOUND_EVENTS,
  SOUND_MANIFEST,
  soundSources,
} from '../../core/sounds';
import { PETS, PET_ANIMATION_LABELS, type PetAnimationState } from '../../core/pets';
import type { AppSettings } from '../../core/settings';
import { PageHeader, Toggle } from '../DesignSystem';
import { PetSprite } from '../PetSprite';

export function AssistantScreen({
  settings,
  update,
  onError,
  selectedPet,
  onSelectPet,
}: {
  settings: AppSettings;
  update: (settings: AppSettings) => void;
  onError: (message: string) => void;
  selectedPet: string;
  onSelectPet: (petId: string) => void;
}) {
  const [petState, setPetState] = useState<PetAnimationState>('idle');
  async function applyPosition(next: AppSettings['companion']) {
    if (!isTauri() || !next.enabled) return;
    const width = 280 * next.size;
    const height = 150 * next.size;
    const right = next.position.endsWith('right');
    const bottom = next.position.startsWith('bottom');
    const x = next.coordinates?.x ?? (right ? Math.max(0, screen.availWidth - width - 28) : 28);
    const y = next.coordinates?.y ?? (bottom ? Math.max(0, screen.availHeight - height - 58) : 28);
    try {
      await invoke('set_island_position', { x, y, size: next.size });
    } catch {
      throw new Error('Não foi possível atualizar a posição do pet.');
    }
  }
  async function setEnabled(enabled: boolean) {
    update({ ...settings, companion: { ...settings.companion, enabled } });
    if (!isTauri()) return;
    try {
      if (enabled) {
        await applyPosition({ ...settings.companion, enabled: true });
        await invoke('set_island_topmost', { enabled: settings.companion.alwaysOnTop });
        await invoke('set_island_visible', { visible: true });
        await emit('companion-state', { type: 'reveal' });
        void playSound('wake', normalizeSoundPreferences(settings.companion.sounds));
      } else {
        await invoke('set_island_visible', { visible: false });
        void playSound('sleep', normalizeSoundPreferences(settings.companion.sounds));
      }
    } catch {
      update({ ...settings, companion: { ...settings.companion, enabled: !enabled } });
      onError('Não foi possível alterar a janela do assistente.');
    }
  }
  async function setFreeMode(freeMode: boolean) {
    const companion = { ...settings.companion, freeMode };
    update({ ...settings, companion });
    if (!isTauri()) return;
    try {
      if (freeMode) {
        const x =
          companion.desktopCoordinates?.x ??
          Math.max(0, (screen.availWidth - 176 * companion.size) / 2);
        const y =
          companion.desktopCoordinates?.y ??
          Math.max(0, (screen.availHeight - 176 * companion.size) / 2);
        await invoke('set_character_position', { x, y, size: companion.size });
        await invoke('set_character_visible', { visible: true });
        void playSound('drag_start', normalizeSoundPreferences(companion.sounds));
      } else {
        await invoke('set_character_visible', { visible: false });
        void playSound('return_home', normalizeSoundPreferences(companion.sounds));
      }
    } catch {
      update({ ...settings, companion: { ...settings.companion, freeMode: !freeMode } });
      onError('Não foi possível mover o OdeKrai entre as janelas.');
    }
  }
  return (
    <div className="page subpage">
      <PageHeader
        eyebrow="PERSONALIZAÇÃO"
        title="Assistente do OdeKrai"
        subtitle="Uma presença leve para acompanhar você na área de trabalho."
      />
      <section className="settings-panel pet-picker-panel">
        <div className="panel-heading">
          <div>
            <h3>Escolha seu mascote</h3>
            <p>
              {'Escolha qual mascote aparece na área de trabalho, nas conversas e na tela inicial.'}
            </p>
          </div>
        </div>
        <div className="pet-picker-grid" role="group" aria-label="Mascote do OdeKrai">
          {PETS.map((pet) => (
            <button
              type="button"
              aria-pressed={selectedPet === pet.id}
              className={`pet-choice ${selectedPet === pet.id ? 'selected' : ''}`}
              key={pet.id}
              onClick={() => onSelectPet(pet.id)}
            >
              <PetSprite estado="idle" petId={pet.id} reduceMotion={settings.reduceMotion} />
              <span>{pet.name}</span>
              {selectedPet === pet.id && <small>Selecionado</small>}
            </button>
          ))}
        </div>
        <label className="pet-state-select">
          <span>Prévia de estado</span>
          <select
            value={petState}
            onChange={(event) => setPetState(event.target.value as PetAnimationState)}
          >
            <option value="idle">Em espera</option>
            <option value="thinking">Pensando</option>
            <option value="working">Trabalhando</option>
            <option value="awaiting_approval">Aguardando aprovação</option>
            <option value="success">Concluído</option>
            <option value="error">Erro</option>
            <option value="paused">Pausado</option>
          </select>
        </label>
      </section>
      <div className="companion-preview">
        <div className="preview-grid" />
        <div className="preview-island">
          <span className="island-light" />
          <PetSprite
            className="preview-mascot"
            estado={petState}
            petId={selectedPet}
            reduceMotion={settings.reduceMotion}
          />
          <span className="island-label">
            PET OdeKrai <i />
          </span>
        </div>
        <div className="preview-caption">
          <span className="eyebrow">PET DO OdeKrai</span>
          <strong>{PET_ANIMATION_LABELS[petState]}</strong>
          <p>OdeKrai pronto para acompanhar sua área de trabalho.</p>
        </div>
      </div>
      <section className="settings-panel compact-panel">
        <div className="panel-heading">
          <div>
            <h3>Pet na área de trabalho</h3>
            <p>
              Abre uma janela transparente do assistente. A posição pode ficar em qualquer canto da
              tela principal.
            </p>
          </div>
          <Toggle
            checked={settings.companion.enabled}
            label="Ativar pet do assistente"
            onClick={() => void setEnabled(!settings.companion.enabled)}
            disabled={!isTauri()}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Posição</strong>
            <span>Arraste a janela para personalizar; a posição é salva.</span>
          </div>
          <select
            value={settings.companion.position}
            onChange={(event) => {
              const companion = {
                ...settings.companion,
                position: event.target.value as AppSettings['companion']['position'],
                coordinates: null,
              };
              update({ ...settings, companion });
              void applyPosition(companion).catch(() =>
                onError('Não foi possível atualizar a posição do pet.'),
              );
            }}
          >
            <option value="bottom-right">Inferior direita</option>
            <option value="bottom-left">Inferior esquerda</option>
            <option value="top-right">Superior direita</option>
            <option value="top-left">Superior esquerda</option>
          </select>
        </div>
        <div className="preference-row">
          <div>
            <strong>Modo livre do OdeKrai</strong>
            <span>Permite mover o OdeKrai em uma janela separada.</span>
          </div>
          <Toggle
            checked={settings.companion.freeMode}
            label="Ativar modo livre do pet"
            onClick={() => void setFreeMode(!settings.companion.freeMode)}
            disabled={!isTauri()}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Tamanho</strong>
            <span>{Math.round(settings.companion.size * 100)}% da escala-base.</span>
          </div>
          <input
            aria-label="Tamanho do pet"
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value={settings.companion.size}
            onChange={(event) => {
              const companion = { ...settings.companion, size: Number(event.target.value) };
              update({ ...settings, companion });
              void applyPosition(companion).catch(() =>
                onError('Não foi possível atualizar o tamanho do pet.'),
              );
            }}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Manter sobre outras janelas</strong>
            <span>Define a prioridade de exibição do pet.</span>
          </div>
          <Toggle
            checked={settings.companion.alwaysOnTop}
            label="Manter o pet sobre outras janelas"
            onClick={() => {
              const enabled = !settings.companion.alwaysOnTop;
              update({ ...settings, companion: { ...settings.companion, alwaysOnTop: enabled } });
              if (isTauri()) void invoke('set_island_topmost', { enabled });
            }}
            disabled={!isTauri()}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Abrir ao passar o mouse</strong>
            <span>Expande o pet quando o ponteiro passa sobre ele.</span>
          </div>
          <Toggle
            checked={settings.companion.openOnHover}
            label="Expandir o pet ao passar o mouse"
            onClick={() =>
              update({
                ...settings,
                companion: { ...settings.companion, openOnHover: !settings.companion.openOnHover },
              })
            }
            disabled={!isTauri()}
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Recolher após</strong>
            <span>Tempo sem interação enquanto expandida.</span>
          </div>
          <select
            value={settings.companion.collapseSeconds}
            onChange={(event) =>
              update({
                ...settings,
                companion: { ...settings.companion, collapseSeconds: Number(event.target.value) },
              })
            }
            disabled={!isTauri()}
          >
            <option value={8}>8 segundos</option>
            <option value={15}>15 segundos</option>
            <option value={30}>30 segundos</option>
            <option value={60}>1 minuto</option>
          </select>
        </div>
        <div className="preference-row">
          <div>
            <strong>Efeitos sonoros</strong>
            <span>Desative esta opção para manter o pet em silêncio.</span>
          </div>
          <Toggle
            checked={settings.companion.sounds.enabled}
            label="Ativar sons do pet"
            onClick={() =>
              update({
                ...settings,
                companion: {
                  ...settings.companion,
                  sounds: {
                    ...settings.companion.sounds,
                    enabled: !settings.companion.sounds.enabled,
                  },
                },
              })
            }
          />
        </div>
        <div className="preference-row">
          <div>
            <strong>Volume</strong>
            <span>{Math.round(settings.companion.sounds.volume * 100)}%</span>
          </div>
          <input
            aria-label="Volume dos efeitos sonoros"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.companion.sounds.volume}
            onChange={(event) =>
              update({
                ...settings,
                companion: {
                  ...settings.companion,
                  sounds: { ...settings.companion.sounds, volume: Number(event.target.value) },
                },
              })
            }
          />
        </div>
        <div className="sound-events-list">
          {SOUND_EVENTS.map((event) => {
            const replacement = settings.companion.sounds.replacements[event];
            const currentFile = replacement ?? soundSources(event)[0];
            return (
              <div className="sound-event-row" key={event}>
                <div className="sound-event-description">
                  <strong>{SOUND_EVENT_LABELS[event]}</strong>
                  <span>
                    {currentFile ? currentFile.split('/').at(-1) : 'Nenhum arquivo disponível'}
                  </span>
                </div>
                <div className="sound-event-controls">
                  <select
                    aria-label={`Arquivo para ${SOUND_EVENT_LABELS[event]}`}
                    value={replacement ?? ''}
                    onChange={(change) => {
                      const replacements = { ...settings.companion.sounds.replacements };
                      if (change.target.value) replacements[event] = change.target.value;
                      else delete replacements[event];
                      update({
                        ...settings,
                        companion: {
                          ...settings.companion,
                          sounds: { ...settings.companion.sounds, replacements },
                        },
                      });
                    }}
                  >
                    <option value="">Automático (formato disponível)</option>
                    {SOUND_MANIFEST.map((file) => (
                      <option key={file} value={file}>
                        {file.split('/').at(-1)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="ui-button ui-button--secondary"
                    type="button"
                    disabled={!currentFile}
                    onClick={() =>
                      void playSound(event, normalizeSoundPreferences(settings.companion.sounds))
                    }
                  >
                    Tocar prévia
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

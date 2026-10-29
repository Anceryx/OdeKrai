import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../core/settings';
import { AgentHome } from './AgentHome';
import { SecurityCenter } from './SecurityCenter';
import { AssistantScreen } from './screens/Assistant';
import { ComputerScreen } from './screens/Computer';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }));

afterEach(() => vi.unstubAllGlobals());

describe('telas embutidas em Configurações', () => {
  it.each(['perfil', 'assistente', 'computador', 'atividade'])(
    'remove o cabeçalho e a margem de página em %s',
    (screen) => {
      const markup =
        screen === 'perfil'
          ? renderToStaticMarkup(
              <AgentHome
                profileValue={{ displayName: '', nickname: '', avatarDataUrl: null }}
                onProfileChange={() => undefined}
                embedded
              />,
            )
          : screen === 'assistente'
            ? renderToStaticMarkup(
                <AssistantScreen
                  settings={defaultSettings}
                  update={() => undefined}
                  petVisible
                  onPetVisibilityChange={() => undefined}
                  onError={() => undefined}
                  selectedPet="male-a"
                  onSelectPet={() => undefined}
                  embedded
                />,
              )
            : screen === 'computador'
              ? (() => {
                  vi.stubGlobal('localStorage', { getItem: () => null });
                  return renderToStaticMarkup(<ComputerScreen embedded />);
                })()
              : renderToStaticMarkup(<SecurityCenter page="activity" embedded />);

      expect(markup).toContain('class="settings-embedded-content');
      expect(markup).not.toContain('class="page subpage');
      expect(markup).not.toContain('class="page-heading"');
    },
  );

  it('continua renderizando Seu computador quando o armazenamento local falha', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Acesso negado');
      },
    });

    const markup = renderToStaticMarkup(<ComputerScreen embedded />);

    expect(markup).toContain('id="computer-resources"');
    expect(markup).toContain('Não foi possível carregar a pasta de modelos salva.');
    expect(markup).toContain('Escolher modelo');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../core/settings';
import { AssistantScreen, PetActionError } from './Assistant';

describe('AssistantScreen', () => {
  it('exibe falha ao criar o pet e oferece nova tentativa', () => {
    const markup = renderToStaticMarkup(
      <PetActionError
        message="Não foi possível criar a janela do pet."
        onRetry={() => undefined}
      />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Não foi possível criar a janela do pet.');
    expect(markup).toContain('Tentar de novo');
  });

  it('monta as op??es do mascote', () => {
    const markup = renderToStaticMarkup(
      <AssistantScreen
        settings={defaultSettings}
        update={() => undefined}
        onError={() => undefined}
        selectedPet="character-female-a"
        onSelectPet={() => undefined}
      />,
    );
    expect(markup).toContain('Escolha seu mascote');
    expect(markup).toContain('Pet na');
    expect(markup).toContain('Modo do pet');
    expect(markup).toContain('>Ilha<');
    expect(markup).toContain('>Livre<');
  });
});

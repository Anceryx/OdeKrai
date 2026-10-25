import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../core/settings';
import { AssistantScreen } from './Assistant';

describe('AssistantScreen', () => {
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
  });
});

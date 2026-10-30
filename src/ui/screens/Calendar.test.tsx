import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CalendarScreen } from './Calendar';

describe('estado vazio da agenda', () => {
  it('mostra o mascote escolhido em tamanho pequeno e aceita imagem estática', () => {
    const markup = renderToStaticMarkup(
      <CalendarScreen selectedPet="character-male-d" reduceMascot />,
    );
    expect(markup).toContain('calendar-empty-results');
    expect(markup).toContain('empty-state-pet');
    expect(markup).toContain('Davi');
    expect(markup).toContain('pet-image');
    expect(markup).not.toContain('pet-sheet');
  });
});

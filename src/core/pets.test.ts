import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PET_ID,
  petAnimationForIslandState,
  petImageUrl,
  petMotionDisabled,
  validatePetCatalog,
} from './pets';

describe('catálogo e estado do pet', () => {
  it('rejeita catálogo ausente, caminhos inválidos e aceita o catálogo do pacote', () => {
    expect(validatePetCatalog(undefined)).toBeNull();
    expect(validatePetCatalog([{ id: 'x', name: 'x', file: '../x.png', altText: 'x' }])).toBeNull();
    expect(validatePetCatalog([{ id: 'x', name: 'x', file: 'x.png', altText: 'x' }])).toBeNull();
    expect(
      validatePetCatalog(
        Array.from({ length: 12 }, (_, i) => ({
          id: `pet-${i}`,
          name: 'Pet',
          file: `pet-${i}.png`,
          altText: 'Pet',
        })),
      ),
    ).toHaveLength(12);
    expect(DEFAULT_PET_ID).toBe('character-female-a');
  });

  it('mapeia estados existentes para as animações previstas', () => {
    expect(petAnimationForIslandState('thinking')).toBe('thinking');
    expect(petAnimationForIslandState('task')).toBe('working');
    expect(petAnimationForIslandState('awaiting_approval')).toBe('awaiting_approval');
    expect(petAnimationForIslandState('completed')).toBe('success');
    expect(petAnimationForIslandState('error')).toBe('error');
    expect(petAnimationForIslandState('hidden')).toBe('paused');
    expect(petAnimationForIslandState('unknown')).toBe('idle');
  });

  it('retorna fallback quando o PNG do catálogo não existe', () => {
    expect(petImageUrl(DEFAULT_PET_ID)).toBeNull();
    expect(petImageUrl('character-male-a')).toMatch(/\.png$/);
    expect(petImageUrl('../escape')).toBeNull();
  });

  it('desativa animações pela preferência do app ou do sistema', () => {
    expect(petMotionDisabled(true, false)).toBe(true);
    expect(petMotionDisabled(false, true)).toBe(true);
    expect(petMotionDisabled(false, false)).toBe(false);
  });
});

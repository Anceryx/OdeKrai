import catalogJson from '../../assets/pets/kenney-mini-characters/pets.json';

export type PetCatalogEntry = {
  id: string;
  name: string;
  file: string;
  altText: string;
};

export type PetAnimationState =
  'idle' | 'thinking' | 'working' | 'awaiting_approval' | 'success' | 'error' | 'paused';

export const PET_ANIMATION_LABELS: Record<PetAnimationState, string> = {
  idle: 'Em espera',
  thinking: 'Pensando',
  working: 'Trabalhando',
  awaiting_approval: 'Aguardando aprovação',
  success: 'Concluído',
  error: 'Erro',
  paused: 'Pausado',
};

export const DEFAULT_PET_ID = 'character-female-a';

export function validatePetCatalog(value: unknown): PetCatalogEntry[] | null {
  if (!Array.isArray(value) || value.length !== 12) return null;
  const ids = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const pet = entry as Partial<PetCatalogEntry>;
    if (
      typeof pet.id !== 'string' ||
      !/^[a-z0-9-]+$/.test(pet.id) ||
      ids.has(pet.id) ||
      typeof pet.name !== 'string' ||
      typeof pet.altText !== 'string' ||
      typeof pet.file !== 'string' ||
      !/^[a-z0-9-]+\.png$/.test(pet.file)
    ) {
      return null;
    }
    ids.add(pet.id);
  }
  return value as PetCatalogEntry[];
}

export const PETS = validatePetCatalog(catalogJson) ?? [];

const petAssets = import.meta.glob<string>('../../assets/pets/kenney-mini-characters/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function petImageUrl(petId: string): string | null {
  const pet = PETS.find((entry) => entry.id === petId);
  if (!pet || !/^[a-z0-9-]+\.png$/.test(pet.file)) return null;
  return petAssets[`../../assets/pets/kenney-mini-characters/${pet.file}`] ?? null;
}

const islandStateAnimation: Record<string, PetAnimationState> = {
  compact: 'idle',
  expanded: 'idle',
  retracted: 'idle',
  hidden: 'paused',
  listening: 'idle',
  thinking: 'thinking',
  responding: 'working',
  task: 'working',
  notification: 'idle',
  awaiting_approval: 'awaiting_approval',
  paused: 'paused',
  error: 'error',
  completed: 'success',
};

export function petAnimationForIslandState(state: string): PetAnimationState {
  return islandStateAnimation[state] ?? 'idle';
}

export function petMotionDisabled(reduceMotion: boolean, prefersReducedMotion: boolean): boolean {
  return reduceMotion || prefersReducedMotion;
}

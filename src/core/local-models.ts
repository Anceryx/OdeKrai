import manifest from '../../src-tauri/resources/local-models.json';

export type HardwareProfile = {
  total_ram_bytes: number;
  available_ram_bytes: number;
  models_free_bytes: number;
  cpu_cores: number;
  avx: boolean;
  avx2: boolean;
  avx512: boolean;
  adapters: { name: string; dedicated_vram_bytes: number }[];
  warnings: string[];
};

export type LocalModelInventory = {
  modelId: string;
  name: string;
  fileName: string;
  path: string;
  sizeBytes: number;
  status: 'NAO_BAIXADO' | 'BAIXANDO' | 'PARCIAL' | 'BAIXADO' | 'VERIFICADO' | 'ERRO';
  engine: string;
  ramVramEstimate: string;
};

const inventoryStatuses = new Set<LocalModelInventory['status']>([
  'NAO_BAIXADO',
  'BAIXANDO',
  'PARCIAL',
  'BAIXADO',
  'VERIFICADO',
  'ERRO',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isHardwareProfile(value: unknown): value is HardwareProfile {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeSafeInteger(value.total_ram_bytes) &&
    isNonNegativeSafeInteger(value.available_ram_bytes) &&
    isNonNegativeSafeInteger(value.models_free_bytes) &&
    isNonNegativeSafeInteger(value.cpu_cores) &&
    typeof value.avx === 'boolean' &&
    typeof value.avx2 === 'boolean' &&
    typeof value.avx512 === 'boolean' &&
    Array.isArray(value.adapters) &&
    value.adapters.every(
      (adapter) =>
        isRecord(adapter) &&
        typeof adapter.name === 'string' &&
        isNonNegativeSafeInteger(adapter.dedicated_vram_bytes),
    ) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === 'string')
  );
}

export function isLocalModelInventory(value: unknown): value is LocalModelInventory[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.modelId === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.fileName === 'string' &&
        typeof entry.path === 'string' &&
        isNonNegativeSafeInteger(entry.sizeBytes) &&
        typeof entry.status === 'string' &&
        inventoryStatuses.has(entry.status as LocalModelInventory['status']) &&
        typeof entry.engine === 'string' &&
        typeof entry.ramVramEstimate === 'string',
    )
  );
}

export const LOCAL_MODELS = manifest.models;

export function recommendLocalModel(hardware: HardwareProfile) {
  const vram = Math.max(0, ...hardware.adapters.map((adapter) => adapter.dedicated_vram_bytes));
  const availableRamGiB = hardware.available_ram_bytes / 1_073_741_824;
  const profile =
    vram >= 20 * 1_073_741_824 && availableRamGiB >= 32
      ? 'pesado'
      : availableRamGiB >= 20 || vram >= 8 * 1_073_741_824
        ? 'medio'
        : availableRamGiB >= 8
          ? 'leve'
          : 'ultraleve';
  const alternatives =
    profile === 'pesado'
      ? ['medio', 'leve']
      : profile === 'medio'
        ? ['leve', 'pesado']
        : profile === 'leve'
          ? ['ultraleve', 'medio']
          : ['leve'];
  const reason = `${profile === 'pesado' ? 'A memória disponível e a VRAM favorecem um modelo pesado.' : profile === 'medio' ? 'A memória disponível favorece um modelo médio.' : profile === 'leve' ? 'A memória disponível favorece um modelo leve.' : 'A memória disponível é limitada; comece por um modelo ultraleve.'}${hardware.avx2 ? '' : ' Este processador não tem AVX2; a execução pode ser lenta.'}`;
  return { profile, alternatives, reason };
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return 'Não verificado';
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

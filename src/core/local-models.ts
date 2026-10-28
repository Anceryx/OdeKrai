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

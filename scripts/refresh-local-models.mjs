import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'src-tauri/resources/local-models.json');
const models = [
  [
    'qwen35-2b-q4km',
    'ultraleve',
    'Qwen3.5 2B Q4_K_M',
    'Qwen/Qwen3.5-2B',
    'gguf/Qwen3.5-2B-GGUF',
    'qwen3.5-2b-Q4_K_M.gguf',
  ],
  [
    'qwen35-4b-q4km',
    'leve',
    'Qwen3.5 4B Q4_K_M',
    'Qwen/Qwen3.5-4B',
    'gguf/Qwen3.5-4B-GGUF',
    'qwen3.5-4b-Q4_K_M.gguf',
  ],
  [
    'qwen35-9b-q4km',
    'medio',
    'Qwen3.5 9B Q4_K_M',
    'Qwen/Qwen3.5-9B',
    'unsloth/Qwen3.5-9B-GGUF',
    'Qwen3.5-9B-Q4_K_M.gguf',
  ],
  [
    'qwen38-27b-q4km',
    'pesado',
    'Qwen3.8 27B Q4_K_M',
    'Qwen/Qwen3.8-27B',
    'unsloth/Qwen3.8-27B-GGUF',
    'Qwen3.8-27B-UD-Q4_K_M.gguf',
  ],
  [
    'qwen36-35b-a3b-q4km',
    'pesado',
    'Qwen3.6 35B-A3B Q4_K_M',
    'Qwen/Qwen3.6-35B-A3B',
    'unsloth/Qwen3.6-35B-A3B-GGUF',
    'Qwen3.6-35B-A3B-UD-Q4_K_M.gguf',
  ],
];

export async function createManifest(fetcher = fetch) {
  const entries = await Promise.all(
    models.map(async ([id, profile, name, sourceRepo, repository, file]) => {
      const base = {
        id,
        family: 'Qwen',
        profile,
        name,
        repository,
        file,
        sourceRepository: sourceRepo,
        sizeBytes: null,
        sha256: null,
        license: null,
        minimum: { ramBytes: null, vramBytes: null, verification: 'unverified' },
        defaultContext: null,
        thinkingNotes:
          'N\u00e3o verificado; confira a documenta\u00e7\u00e3o do modelo e do servidor.',
        verifiedAt: null,
        verification: 'unverified',
      };
      try {
        const [repoResponse, sourceResponse] = await Promise.all([
          fetcher(`https://huggingface.co/api/models/${repository}?blobs=true`, {
            signal: AbortSignal.timeout(10_000),
          }),
          fetcher(`https://huggingface.co/api/models/${sourceRepo}`, {
            signal: AbortSignal.timeout(10_000),
          }),
        ]);
        if (!repoResponse.ok || !sourceResponse.ok) return base;
        const [repo, source] = await Promise.all([repoResponse.json(), sourceResponse.json()]);
        const artifact = repo.siblings?.find((item) => item.rfilename === file);
        const sha256 = artifact?.lfs?.sha256;
        if (
          !artifact ||
          !Number.isSafeInteger(artifact.size) ||
          !/^[a-f\d]{64}$/i.test(sha256 ?? '')
        )
          return base;
        return {
          ...base,
          sizeBytes: artifact.size,
          sha256,
          license: source.cardData?.license ?? null,
          verifiedAt: new Date().toISOString().slice(0, 10),
          verification: source.cardData?.license ? 'verified' : 'unverified',
        };
      } catch {
        return base;
      }
    }),
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Hugging Face Hub API',
    models: entries,
  };
}

export function validateManifest(manifest) {
  if (
    manifest?.schemaVersion !== 1 ||
    !Array.isArray(manifest.models) ||
    manifest.models.length !== models.length
  )
    return false;
  const ids = new Set();
  return manifest.models.every((item) => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      ids.has(item.id) ||
      !['Qwen'].includes(item.family) ||
      !['ultraleve', 'leve', 'medio', 'pesado'].includes(item.profile) ||
      typeof item.name !== 'string' ||
      typeof item.repository !== 'string' ||
      typeof item.file !== 'string' ||
      !item.minimum ||
      item.minimum.verification !== 'unverified'
    )
      return false;
    ids.add(item.id);
    const hasSize = Number.isSafeInteger(item.sizeBytes) && item.sizeBytes > 0;
    const hasHash = /^[a-f\d]{64}$/i.test(item.sha256 ?? '');
    if ((item.sizeBytes !== null || item.sha256 !== null) && !(hasSize && hasHash)) return false;
    const verifiedArtifact = hasSize && hasHash && Boolean(item.verifiedAt);
    return item.verification === (verifiedArtifact && item.license ? 'verified' : 'unverified');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const manifest = await createManifest();
  if (!validateManifest(manifest))
    throw new Error('O manifesto de modelos retornou dados inválidos.');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8' });
  console.log(
    `Manifesto atualizado: ${manifest.models.filter((item) => item.verification === 'verified').length}/${manifest.models.length} arquivos verificados.`,
  );
}

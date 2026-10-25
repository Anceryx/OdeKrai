import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const forbiddenExtensions = new Set(['.glb', '.fbx', '.obj']);

async function inspect(entryPath, violations) {
  const details = await stat(entryPath);
  if (path.basename(entryPath).toLowerCase() === 'assets-src') {
    violations.push(`${entryPath} (assets-src)`);
  }
  if (details.isDirectory()) {
    for (const name of await readdir(entryPath)) {
      await inspect(path.join(entryPath, name), violations);
    }
  } else if (forbiddenExtensions.has(path.extname(entryPath).toLowerCase())) {
    violations.push(entryPath);
  }
}

export async function findForbiddenArtifacts(roots) {
  const violations = [];
  for (const root of roots) await inspect(path.resolve(root), violations);
  return [...new Set(violations)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error('Informe ao menos uma pasta para verificar.');
    process.exit(2);
  }
  const violations = await findForbiddenArtifacts(roots);
  if (violations.length) {
    console.error(`Artefatos proibidos encontrados:\n${violations.join('\n')}`);
    process.exit(1);
  }
  console.log(`Verificação de artefatos aprovada: ${roots.join(', ')}`);
}

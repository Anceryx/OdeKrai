import { readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const proprietaryFilename = /^odekrai-head(?:-[a-z0-9_-]+)?\.glb$/i;

export async function findProprietaryAssets(root) {
  const found = [];
  const pending = [resolve(root)];

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const relative = path
        .slice(resolve(root).length + 1)
        .split(sep)
        .join('/');
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (
        proprietaryFilename.test(entry.name) ||
        relative.toLowerCase().includes('official-references/')
      ) {
        found.push(relative);
      }
    }
  }

  return found.sort();
}

async function main() {
  const outputDirectory = resolve(process.argv[2] ?? 'dist');
  let assets;
  try {
    assets = await findProprietaryAssets(outputDirectory);
  } catch {
    console.error(`Não foi possível verificar os assets do build em ${outputDirectory}.`);
    process.exitCode = 1;
    return;
  }

  if (assets.length > 0) {
    console.error(
      'AVISO: o build de distribuição contém assets proprietários do OdeKrai e não pode ser publicado:',
    );
    for (const asset of assets) console.error(`- ${asset}`);
    process.exitCode = 1;
    return;
  }

  console.log('Verificação de assets proprietários aprovada para distribuição.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

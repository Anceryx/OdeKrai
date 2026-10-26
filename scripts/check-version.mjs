import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateVersions({ packageJson, cargoToml, tauriConfig }) {
  const versions = {
    packageJson: packageJson.version,
    cargoToml: cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    tauriConfig: tauriConfig.version,
  };
  const unique = new Set(Object.values(versions));
  return unique.size === 1 && !unique.has(undefined)
    ? { valid: true, version: versions.packageJson, versions }
    : { valid: false, versions };
}

export async function checkVersion(root = '.') {
  const [packageJson, cargoToml, tauriConfig] = await Promise.all([
    readFile(resolve(root, 'package.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'src-tauri/Cargo.toml'), 'utf8'),
    readFile(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8').then(JSON.parse),
  ]);
  return validateVersions({ packageJson, cargoToml, tauriConfig });
}

async function main() {
  const result = await checkVersion(process.argv[2] ?? '.');
  if (!result.valid) {
    console.error(`Versões divergentes: ${JSON.stringify(result.versions)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Versões sincronizadas: ${result.version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

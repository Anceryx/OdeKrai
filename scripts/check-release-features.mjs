import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkFeatureConfiguration(cargoToml) {
  const lines = cargoToml.split(/\r?\n/);
  const section = (name) => {
    const start = lines.indexOf(`[${name}]`);
    if (start < 0) return [];
    let end = start + 1;
    while (end < lines.length && !/^\[[^\]]+\]$/.test(lines[end])) end += 1;
    return lines.slice(start + 1, end);
  };
  const features = section('features').join('\n');
  const dependencies = section('dependencies');
  const tauriLine = dependencies.findIndex((line) => /^tauri\s*=/.test(line));
  const tauriDependency =
    tauriLine < 0
      ? ''
      : (dependencies
          .slice(tauriLine)
          .join('\n')
          .match(/^tauri\s*=\s*\{[\s\S]*?\}/m)?.[0] ?? '');
  const errors = [];
  const defaultFeatures = features.match(/^default\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? '';
  if (/\bdiagnostics\b/.test(defaultFeatures))
    errors.push('diagnostics foi incluída nas features padrão.');
  if (!/^diagnostics\s*=\s*\[\s*"tauri\/devtools"\s*\]\s*$/m.test(features)) {
    errors.push('diagnostics deve ser a única feature que ativa tauri/devtools.');
  }
  const withoutDiagnostics = cargoToml.replace(
    /^diagnostics\s*=\s*\[\s*"tauri\/devtools"\s*\]\s*$/m,
    '',
  );
  if (/tauri\/devtools/.test(withoutDiagnostics)) {
    errors.push('Outra configuração ativa tauri/devtools fora da feature diagnostics.');
  }
  if (/\bdevtools\b/.test(tauriDependency))
    errors.push('tauri/devtools foi ativada diretamente na dependência.');
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cargoToml = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  const errors = checkFeatureConfiguration(cargoToml);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('Features padrão verificadas: Tauri devtools está desativado.');
}

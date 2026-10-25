import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const commandName = 'submit_simulated_action';
const declarationPattern = new RegExp(
  String.raw`#\[tauri::command\]\s*pub\s+fn\s+${commandName}\s*\(`,
  'g',
);
const registrationPattern = new RegExp(String.raw`security::${commandName}\s*,`, 'g');
const debugGuard = /#\[cfg\(debug_assertions\)\]\s*$/;

export function verifyDebugCommandSources(sources) {
  const text = sources.join('\n');
  const declarations = [...text.matchAll(declarationPattern)];
  if (
    declarations.length === 0 ||
    declarations.some((match) => !debugGuard.test(text.slice(0, match.index)))
  ) {
    return false;
  }

  const registrations = [...text.matchAll(registrationPattern)];
  return (
    registrations.length > 0 &&
    registrations.every((match) => debugGuard.test(text.slice(0, match.index)))
  );
}

async function collectRustSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...(await collectRustSources(path)));
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      sources.push(await readFile(path, 'utf8'));
    }
  }
  return sources;
}

async function main() {
  const root = resolve(process.argv[2] ?? '.');
  const sources = await collectRustSources(resolve(root, 'src-tauri/src'));
  if (!verifyDebugCommandSources(sources)) {
    console.error(
      'O comando manual simulado precisa estar declarado e registrado somente sob cfg(debug_assertions).',
    );
    process.exitCode = 1;
    return;
  }

  console.log('O comando manual simulado está excluído da configuração de release.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

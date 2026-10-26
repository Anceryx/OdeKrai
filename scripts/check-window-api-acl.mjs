import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const permissionFor = {
  show: 'core:window:allow-show',
  setFocus: 'core:window:allow-set-focus',
  unminimize: 'core:window:allow-unminimize',
  close: 'core:window:allow-close',
  startDragging: 'core:window:allow-start-dragging',
};

export function findWindowCalls(source) {
  const calls = [];
  const direct = /getCurrentWindow\s*\(\)\s*\.\s*([\w$]+)\s*\(/g;
  for (const match of source.matchAll(direct)) calls.push(match[1]);
  const aliases = [
    ...source.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*getCurrentWindow\s*\(\)/g),
  ].map((match) => match[1]);
  for (const alias of aliases) {
    const callsOnAlias = new RegExp(`\\b${alias}\\s*\\.\\s*([\\w$]+)\\s*\\(`, 'g');
    for (const match of source.matchAll(callsOnAlias)) calls.push(match[1]);
  }
  return calls;
}

export function findMissingWindowPermissions(calls, permissions) {
  const allowed = new Set(permissions);
  return [
    ...new Set(
      calls
        .map((call) => permissionFor[call] ?? `window-api:unknown:${call}`)
        .filter(
          (permission) =>
            permission.startsWith('window-api:unknown:') || !allowed.has(permission),
        ),
    ),
  ];
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(file)));
    else if (/\.[jt]sx?$/.test(entry.name)) files.push(file);
  }
  return files;
}

const capabilities = await Promise.all(
  (await readdir(path.join(root, 'src-tauri/capabilities')))
    .filter((name) => name.endsWith('.json'))
    .map(async (name) =>
      JSON.parse(await readFile(path.join(root, 'src-tauri/capabilities', name), 'utf8')),
    ),
);
let failed = false;
for (const file of await sourceFiles(path.join(root, 'src'))) {
  const source = await readFile(file, 'utf8');
  const calls = findWindowCalls(source);
  if (!calls.length) continue;
  const window =
    /getCurrentWindow\(\)\.label\s*===\s*['"](pet|approval)['"]/.exec(source)?.[1] ?? 'main';
  const permissions = capabilities
    .filter((capability) => capability.windows.includes(window))
    .flatMap((capability) => capability.permissions);
  for (const permission of findMissingWindowPermissions(calls, permissions)) {
    failed = true;
    console.error(
      `${path.relative(root, file)} (${window}): chamada exige ${permission} em uma capability dessa janela.`,
    );
  }
}
if (failed) process.exitCode = 1;
else console.log('Chamadas diretas da API de janela cobertas pelas capabilities correspondentes.');

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function hasDebugGuard(source, pattern) {
  return pattern.test(source);
}

async function main() {
  const root = resolve(process.argv[2] ?? '.');
  const [security, lib] = await Promise.all([
    readFile(resolve(root, 'src-tauri/src/security.rs'), 'utf8'),
    readFile(resolve(root, 'src-tauri/src/lib.rs'), 'utf8'),
  ]);
  const declaration =
    /#\[cfg\(debug_assertions\)\]\s*#\[tauri::command\]\s*pub\s+fn\s+submit_simulated_action\s*\(/;
  const registration = /#\[cfg\(debug_assertions\)\]\s*security::submit_simulated_action\s*,/;

  if (!hasDebugGuard(security, declaration) || !hasDebugGuard(lib, registration)) {
    console.error(
      'A ferramenta manual simulada precisa de cfg(debug_assertions) na declaração e no invoke_handler.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('A ferramenta manual simulada está excluída da configuração de release.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findSynchronousWindowBuilders(source) {
  const matches = [];
  const commandPattern = /#\s*\[\s*tauri::command(?:\([^\]]*\))?\s*\]/g;
  for (const attribute of source.matchAll(commandPattern)) {
    const declaration = source.slice(attribute.index + attribute[0].length);
    const functionMatch = declaration.match(
      /\bfn\s+([A-Za-z_][\w]*)\s*(?:<[^>]*>)?\s*\([^)]*\)[^{]*\{/s,
    );
    if (!functionMatch) continue;
    const signature = functionMatch[0];
    if (/\basync\s*$/.test(declaration.slice(0, functionMatch.index))) continue;
    const bodyStart = functionMatch.index + signature.length - 1;
    let depth = 0;
    let bodyEnd = bodyStart;
    for (; bodyEnd < declaration.length; bodyEnd += 1) {
      if (declaration[bodyEnd] === '{') depth += 1;
      if (declaration[bodyEnd] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = declaration.slice(bodyStart, bodyEnd + 1);
    if (/WebviewWindowBuilder/.test(body) && /(?:::\s*new\s*\(|\.build\s*\()/.test(body)) {
      matches.push(functionMatch[1]);
    }
  }
  return matches;
}

function verifyExamples() {
  const good =
    '#[tauri::command] async fn good(app: AppHandle) { WebviewWindowBuilder::new(&app, "x", url).build(); }';
  const bad =
    '#[tauri::command] fn bad(app: AppHandle) { WebviewWindowBuilder::new(&app, "x", url).build(); }';
  const unrelated = '#[tauri::command] fn unrelated() { MenuBuilder::new().build(); }';
  assert.deepEqual(findSynchronousWindowBuilders(good), []);
  assert.deepEqual(findSynchronousWindowBuilders(bad), ['bad']);
  assert.deepEqual(findSynchronousWindowBuilders(unrelated), []);
}

async function rustFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await rustFiles(fullPath)));
    else if (entry.isFile() && entry.name.endsWith('.rs')) result.push(fullPath);
  }
  return result;
}

verifyExamples();
let failed = false;
for (const file of await rustFiles(path.join(root, 'src-tauri', 'src'))) {
  const violations = findSynchronousWindowBuilders(await readFile(file, 'utf8'));
  if (violations.length) {
    failed = true;
    console.error(
      `${path.relative(root, file)}: criação/construção de janela em comando síncrono: ${violations.join(', ')}`,
    );
  }
}
if (failed) process.exitCode = 1;
else console.log('Nenhum comando Tauri síncrono cria janelas; exemplos bom e ruim validados.');

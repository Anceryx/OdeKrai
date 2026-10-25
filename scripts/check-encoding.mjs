import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectEncoding, repairMojibake } from './encoding-utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fix = process.argv.includes('--fix');
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.lock',
  '.md',
  '.mjs',
  '.ps1',
  '.rs',
  '.sh',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yml',
  '.yaml',
]);
const rootFiles = ['.editorconfig', '.gitattributes', '.gitignore', 'LICENSE'];
const issues = [];

async function collectFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['.agents', '.codex', '.git', 'dist', 'node_modules', 'target'].includes(entry.name)) {
        files.push(...(await collectFiles(relative)));
      }
    } else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(relative);
    }
  }
  return files;
}

// O arquivo corrompido é uma entrada intencional do teste e não integra o código/documentação verificados.
const files = [...new Set([...rootFiles, ...(await collectFiles('.'))])].filter(
  (file) => file.replaceAll('\\', '/') !== 'tests/encoding-fixtures/mojibake.txt',
);
for (const relative of files) {
  const absolute = path.join(root, relative);
  let bytes = await readFile(absolute);
  const initial = inspectEncoding(bytes);
  if (!initial.validUtf8) {
    issues.push(`${relative}: UTF-8 inválido`);
    continue;
  }

  let text = initial.text;
  const hadBom = initial.hasBom;
  if (fix) {
    if (hadBom) text = text.slice(1);
    text = repairMojibake(text);
    await writeFile(absolute, text, { encoding: 'utf8' });
    bytes = Buffer.from(text, 'utf8');
  }

  const result = inspectEncoding(bytes);
  if (hadBom && !fix) issues.push(`${relative}: BOM UTF-8`);
  if (result.mojibake) issues.push(`${relative}: possível mojibake`);
}

if (issues.length > 0) {
  console.error(issues.map((issue) => `- ${issue}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    fix ? 'Codificação corrigida.' : 'Codificação verificada: UTF-8 sem BOM e sem mojibake.',
  );
}

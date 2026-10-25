import { readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildSoundManifest(directory) {
  const files = await readdir(directory, { withFileTypes: true });
  const sounds = [];
  for (const entry of files) {
    if (!entry.isFile() || entry.name.startsWith('.') || entry.name === 'License.txt') continue;
    if (!/^[a-z0-9_-]+\.(wav|ogg|mp3)$/i.test(entry.name)) {
      throw new Error(`Nome ou formato de áudio inválido: ${entry.name}`);
    }
    sounds.push(`/sounds/${entry.name}`);
  }
  return sounds.sort();
}

async function main() {
  const sounds = await buildSoundManifest(path.join(root, 'public', 'sounds'));
  const output = path.join(root, 'src', 'core', 'sound-manifest.generated.json');
  await writeFile(output, `${JSON.stringify(sounds, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}

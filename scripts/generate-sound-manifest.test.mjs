import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSoundManifest } from './generate-sound-manifest.mjs';

describe('manifesto de sons', () => {
  let temporaryDirectory = '';

  afterEach(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = '';
  });

  it('lista somente sons compatíveis e ignora a licença e arquivos ocultos', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'odekrai-sounds-'));
    await mkdir(path.join(temporaryDirectory, 'nested'));
    await writeFile(path.join(temporaryDirectory, 'bell.ogg'), '');
    await writeFile(path.join(temporaryDirectory, 'drag-start.mp3'), '');
    await writeFile(path.join(temporaryDirectory, 'License.txt'), 'CC0');
    await writeFile(path.join(temporaryDirectory, '.gitkeep'), '');
    await writeFile(path.join(temporaryDirectory, 'nested', 'hidden.wav'), '');

    await expect(buildSoundManifest(temporaryDirectory)).resolves.toEqual([
      '/sounds/bell.ogg',
      '/sounds/drag-start.mp3',
    ]);
  });

  it.each(['som com espaço.wav', 'som.aiff', '.arquivo.ogg'])(
    'rejeita arquivo não permitido: %s',
    async (file) => {
      temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'odekrai-sounds-'));
      await writeFile(path.join(temporaryDirectory, file), '');
      await expect(buildSoundManifest(temporaryDirectory)).rejects.toThrow('inválido');
    },
  );
});

import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findProprietaryAssets } from './check-release-assets.mjs';

const roots = [];

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), 'odekrai-release-assets-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('verificação de assets de distribuição', () => {
  it('detecta o modelo proprietário com nome de arquivo versionado', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets', 'odekrai-head-AbC123.glb'), 'fixture');

    await expect(findProprietaryAssets(root)).resolves.toEqual(['assets/odekrai-head-AbC123.glb']);
  });

  it('detecta referências oficiais e aceita um build sem assets proprietários', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'assets', 'official-references'), { recursive: true });
    await writeFile(join(root, 'assets', 'official-references', 'reference.png'), 'fixture');
    await writeFile(join(root, 'assets', 'app.js'), 'fixture');

    await expect(findProprietaryAssets(root)).resolves.toEqual([
      'assets/official-references/reference.png',
    ]);
    await rm(join(root, 'assets', 'official-references'), { recursive: true });
    await expect(findProprietaryAssets(root)).resolves.toEqual([]);
  });
});

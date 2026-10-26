import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkVersion, validateVersions } from './check-version.mjs';

describe('check:version', () => {
  it('aceita as três versões iguais e identifica divergências', () => {
    const files = {
      packageJson: { version: '0.14.0' },
      cargoToml: '[package]\nversion = "0.14.0"',
      tauriConfig: { version: '0.14.0' },
    };
    expect(validateVersions(files)).toMatchObject({ valid: true, version: '0.14.0' });
    expect(validateVersions({ ...files, tauriConfig: { version: '0.13.0' } }).valid).toBe(false);
  });

  it('lê os arquivos reais de um repositório temporário', async () => {
    const root = await mkdtemp(join(tmpdir(), 'odekrai-version-'));
    try {
      await mkdir(join(root, 'src-tauri'));
      await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.14.0' }));
      await writeFile(join(root, 'src-tauri/Cargo.toml'), '[package]\nversion = "0.14.0"');
      await writeFile(
        join(root, 'src-tauri/tauri.conf.json'),
        JSON.stringify({ version: '0.14.0' }),
      );
      expect(await checkVersion(root)).toMatchObject({ valid: true, version: '0.14.0' });
      await writeFile(
        join(root, 'src-tauri/tauri.conf.json'),
        JSON.stringify({ version: '0.1.0' }),
      );
      expect((await checkVersion(root)).valid).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

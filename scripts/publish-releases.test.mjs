import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGitHubRepository, publishReleases } from './publish-releases.mjs';

const tempRoots = [];

async function createFixture(tags = ['v0.1.0', 'v0.2.0']) {
  const root = await mkdtemp(join(tmpdir(), 'odekrai-releases-'));
  tempRoots.push(root);
  const remote = join(root, 'remote.git');
  const checkout = join(root, 'checkout');
  execFileSync('git', ['init', '--bare', remote]);
  execFileSync('git', ['init', checkout]);
  execFileSync('git', ['-C', checkout, 'config', 'user.email', 'test@example.invalid']);
  execFileSync('git', ['-C', checkout, 'config', 'user.name', 'Release Test']);
  execFileSync('git', ['-C', checkout, 'remote', 'add', 'origin', remote]);
  const releasesDir = join(checkout, 'docs', 'releases');
  await mkdir(releasesDir, { recursive: true });
  for (const [index, tag] of tags.entries()) {
    const filename = `${tag}.md`;
    await writeFile(join(releasesDir, filename), `# ${tag} — Teste\n\nConteúdo ${index}.\n`);
  }
  execFileSync('git', ['-C', checkout, 'add', '.']);
  execFileSync('git', ['-C', checkout, 'commit', '-m', 'notas de teste']);
  for (const tag of tags) {
    execFileSync('git', ['-C', checkout, 'tag', '-a', tag, '-m', `tag ${tag}`]);
  }
  execFileSync('git', ['-C', checkout, 'push', 'origin', '--tags']);
  return checkout;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('publish-releases', () => {
  it('reconhece remotos GitHub HTTPS e SSH', () => {
    expect(parseGitHubRepository('https://github.com/Anceryx/OdeKrai.git')).toBe('Anceryx/OdeKrai');
    expect(parseGitHubRepository('git@github.com:Anceryx/OdeKrai.git')).toBe('Anceryx/OdeKrai');
  });

  it('simula sem chamar API e exige tags disponíveis no remoto local de teste', async () => {
    const root = await createFixture();
    const fetchImpl = vi.fn();
    const log = vi.fn();
    const result = await publishReleases({ root, ownerRepo: 'test/repo', fetchImpl, log });
    expect(result.simulated).toEqual(['v0.1.0', 'v0.2.0']);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
  }, 30000);

  it('cria pré-lançamentos ausentes sem anexos e ignora releases existentes', async () => {
    const root = await createFixture();
    const requests = [];
    const fetchImpl = vi.fn(async (url, options) => {
      requests.push({ url, options });
      if (!options.method) return { ok: true, json: async () => [{ tag_name: 'v0.1.0' }] };
      return { ok: true, json: async () => ({ tag_name: 'v0.2.0' }) };
    });
    const log = vi.fn();
    const result = await publishReleases({
      root,
      ownerRepo: 'test/repo',
      execute: true,
      env: { GITHUB_TOKEN: 'secret-test-token' },
      fetchImpl,
      log,
    });
    expect(result).toMatchObject({ created: ['v0.2.0'], skipped: ['v0.1.0'] });
    expect(requests).toHaveLength(2);
    const payload = JSON.parse(requests[1].options.body);
    expect(payload).toMatchObject({ tag_name: 'v0.2.0', prerelease: true, make_latest: 'false' });
    expect(payload).not.toHaveProperty('assets');
    expect(log.mock.calls.flat().join(' ')).not.toContain('secret-test-token');
  }, 30000);

  it('para se qualquer tag de release não existir na origem remota', async () => {
    const root = await createFixture(['v0.1.0']);
    await writeFile(join(root, 'docs', 'releases', 'v0.2.0.md'), '# v0.2.0 — Ausente\n');
    await expect(
      publishReleases({ root, ownerRepo: 'test/repo', fetchImpl: vi.fn() }),
    ).rejects.toThrow('Tag v0.2.0 não existe na origem remota.');
  }, 30000);
});

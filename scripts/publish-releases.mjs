import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const apiBase = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
  'Content-Type': 'application/json',
};

export function parseGitHubRepository(remote) {
  const match = remote.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) throw new Error('A origem Git precisa apontar para um repositório GitHub.');
  return `${match[1]}/${match[2]}`;
}

export function parseReleaseNotes(file, body) {
  const match = file.match(/^v(0\.\d+\.\d+)\.md$/);
  if (!match) throw new Error(`Nome de nota inválido: ${file}`);
  const tag = `v${match[1]}`;
  const title = body.match(/^#\s+(.+)$/m)?.[1];
  if (!title) throw new Error(`Título ausente nas notas de ${tag}.`);
  return { tag, title, body };
}

function compareVersions(a, b) {
  const left = a.slice(1).split('.').map(Number);
  const right = b.slice(1).split('.').map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export async function loadReleases(root) {
  const directory = resolve(root, 'docs/releases');
  const files = (await readdir(directory)).filter((file) => /^v0\.\d+\.\d+\.md$/.test(file));
  const releases = await Promise.all(
    files.map(async (file) =>
      parseReleaseNotes(file, await readFile(resolve(directory, file), 'utf8')),
    ),
  );
  return releases.sort((a, b) => compareVersions(a.tag, b.tag));
}

export function createReleaseClient({ fetchImpl, token }) {
  async function request(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      headers: { ...headers, Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) throw new Error(`GitHub API respondeu HTTP ${response.status}.`);
    return response.status === 204 ? null : response.json();
  }

  return {
    async listAll(ownerRepo) {
      const all = [];
      for (let page = 1; ; page += 1) {
        const batch = await request(
          `${apiBase}/repos/${ownerRepo}/releases?per_page=100&page=${page}`,
        );
        all.push(...batch);
        if (batch.length < 100) return all;
      }
    },
    create(ownerRepo, release) {
      return request(`${apiBase}/repos/${ownerRepo}/releases`, {
        method: 'POST',
        body: JSON.stringify({
          tag_name: release.tag,
          name: release.title,
          body: release.body,
          draft: false,
          prerelease: true,
          make_latest: 'false',
          generate_release_notes: false,
        }),
      });
    },
  };
}

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export async function publishReleases({
  root,
  execute = false,
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  ownerRepo: repoOverride,
}) {
  const releases = await loadReleases(root);
  const ownerRepo = repoOverride ?? parseGitHubRepository(git(root, 'remote', 'get-url', 'origin'));
  for (const release of releases) {
    let result;
    try {
      result = git(
        root,
        'ls-remote',
        '--exit-code',
        '--refs',
        'origin',
        `refs/tags/${release.tag}`,
      );
    } catch (error) {
      if (error.status === 2) {
        throw new Error(`Tag ${release.tag} não existe na origem remota.`);
      }
      throw new Error(`Não foi possível verificar a tag ${release.tag} na origem remota.`);
    }
    if (!result) throw new Error(`Tag ${release.tag} não existe na origem remota.`);
  }
  if (!execute) {
    for (const release of releases)
      log(`[simulação] ${ownerRepo} ${release.tag}: ${release.title} (pré-lançamento, sem anexos)`);
    return { created: [], skipped: [], simulated: releases.map(({ tag }) => tag) };
  }
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error('Defina GITHUB_TOKEN para executar a publicação.');
  const client = createReleaseClient({ fetchImpl, token });
  const existing = new Set((await client.listAll(ownerRepo)).map(({ tag_name }) => tag_name));
  const created = [];
  const skipped = [];
  for (const release of releases) {
    if (existing.has(release.tag)) {
      skipped.push(release.tag);
      log(`Ignorada (já existe): ${release.tag}`);
      continue;
    }
    await client.create(ownerRepo, release);
    created.push(release.tag);
    log(`Release pré-lançamento criada: ${release.tag}`);
  }
  return { created, skipped, simulated: [] };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const root = resolve(process.argv.find((arg) => arg.startsWith('--root='))?.slice(7) ?? '.');
  try {
    await publishReleases({ root, execute });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

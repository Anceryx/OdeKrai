import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findForbiddenArtifacts } from './check-release-artifact.mjs';
import { checkFeatureConfiguration } from './check-release-features.mjs';

const allowedRoot = await mkdtemp(path.join(os.tmpdir(), 'odekrai-artifact-good-'));
try {
  await writeFile(path.join(allowedRoot, 'odekrai.exe'), 'binary');
  await writeFile(path.join(allowedRoot, 'SHA256SUMS.txt'), 'hash');
  await writeFile(path.join(allowedRoot, 'LEIA-ME.txt'), 'instruções');
  assert.deepEqual(await findForbiddenArtifacts([allowedRoot]), []);
} finally {
  await rm(allowedRoot, { recursive: true, force: true });
}

const rejectedRoot = await mkdtemp(path.join(os.tmpdir(), 'odekrai-artifact-bad-'));
try {
  await mkdir(path.join(rejectedRoot, 'assets-src'));
  await writeFile(path.join(rejectedRoot, 'model.glb'), 'binary');
  await writeFile(path.join(rejectedRoot, 'model.FBX'), 'binary');
  await writeFile(path.join(rejectedRoot, 'model.obj'), 'text');
  const violations = await findForbiddenArtifacts([rejectedRoot]);
  assert.ok(violations.some((item) => item.includes('assets-src')));
  assert.ok(violations.some((item) => item.endsWith('model.glb')));
  assert.ok(violations.some((item) => item.endsWith('model.FBX')));
  assert.ok(violations.some((item) => item.endsWith('model.obj')));
} finally {
  await rm(rejectedRoot, { recursive: true, force: true });
}

const featureConfiguration = `[features]\ndefault = []\ndiagnostics = ["tauri/devtools"]\n\n[dependencies]\ntauri = { version = "2", features = ["tray-icon"] }\n`;
assert.deepEqual(checkFeatureConfiguration(featureConfiguration), []);
assert.notDeepEqual(
  checkFeatureConfiguration(
    featureConfiguration.replace('default = []', 'default = ["diagnostics"]'),
  ),
  [],
);
assert.notDeepEqual(
  checkFeatureConfiguration(
    featureConfiguration.replace(
      'features = ["tray-icon"]',
      'features = ["tray-icon", "devtools"]',
    ),
  ),
  [],
);
assert.notDeepEqual(
  checkFeatureConfiguration(featureConfiguration.replace('diagnostics =', 'release-debug =')),
  [],
);

console.log('Testes de artefatos e features de release aprovados.');

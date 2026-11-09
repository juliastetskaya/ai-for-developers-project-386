import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';

import { validateReleasePleaseConfig } from './check-release-please.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WORKSPACE_MANIFESTS = [
  'apps/backend/package.json',
  'apps/frontend/package.json',
  'packages/api-client/package.json',
  'typespec/package.json',
];

const fixtures = [];

function configFor(extraFiles = WORKSPACE_MANIFESTS) {
  return {
    $schema: 'https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json',
    'bootstrap-sha': '038847c644463e0cf7e0d01a4ba79764ce81a370',
    'include-component-in-tag': false,
    packages: {
      '.': {
        'release-type': 'node',
        'changelog-path': 'CHANGELOG.md',
        'extra-files': extraFiles.map((path) => ({
          type: 'json',
          path,
          jsonpath: '$.version',
        })),
      },
    },
  };
}

async function createFixture(options = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'release-please-config-'));
  fixtures.push(rootDir);

  const rootVersion = options.rootVersion ?? '1.0.0';
  const workspaceManifests = options.workspaceManifests ?? WORKSPACE_MANIFESTS;

  await writeJson(rootDir, 'package.json', { name: 'cal-clone', version: rootVersion });
  await writeFile(
    join(rootDir, 'pnpm-workspace.yaml'),
    ['packages:', '  - apps/*', '  - packages/*', '  - typespec', ''].join('\n'),
  );

  for (const manifestPath of workspaceManifests) {
    await writeJson(rootDir, manifestPath, { name: manifestPath, private: true, version: rootVersion });
  }

  await writeJson(rootDir, 'release-please-config.json', options.config ?? configFor());
  await writeJson(
    rootDir,
    '.release-please-manifest.json',
    options.manifest ?? { '.': options.manifestVersion ?? rootVersion },
  );

  return rootDir;
}

async function writeJson(rootDir, relativePath, value) {
  const filePath = join(rootDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

after(async () => {
  await Promise.all(fixtures.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('validateReleasePleaseConfig', () => {
  test('accepts a single root package whose manifest matches the root version and lists every workspace manifest', async () => {
    const rootDir = await createFixture();

    assert.deepEqual(await validateReleasePleaseConfig(rootDir), []);
  });

  test('reports a manifest version that drifted from the root package version', async () => {
    const rootDir = await createFixture({ manifestVersion: '0.9.0' });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('0.9.0') && problem.includes('1.0.0')),
      `expected a version mismatch problem, got: ${JSON.stringify(problems)}`,
    );
  });

  test('reports a workspace manifest missing from extra-files', async () => {
    const extras = WORKSPACE_MANIFESTS.filter((path) => path !== 'typespec/package.json');
    const rootDir = await createFixture({ config: configFor(extras) });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('typespec/package.json')),
      `expected a missing extra-file problem, got: ${JSON.stringify(problems)}`,
    );
  });

  test('reports an extra-file path that does not exist on disk', async () => {
    const extras = [...WORKSPACE_MANIFESTS, 'apps/missing/package.json'];
    const rootDir = await createFixture({ config: configFor(extras) });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('apps/missing/package.json')),
      `expected a missing path problem, got: ${JSON.stringify(problems)}`,
    );
  });

  test('reports a newly added workspace package that is not listed in extra-files', async () => {
    const rootDir = await createFixture({
      workspaceManifests: [...WORKSPACE_MANIFESTS, 'apps/worker/package.json'],
    });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('apps/worker/package.json')),
      `expected the new workspace package to be reported, got: ${JSON.stringify(problems)}`,
    );
  });

  test('rejects independent package releases', async () => {
    const config = configFor();
    config.packages['apps/backend'] = { 'release-type': 'node' };
    const rootDir = await createFixture({ config });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('exactly one root package')),
      `expected a single-package problem, got: ${JSON.stringify(problems)}`,
    );
  });

  test('rejects a manifest that tracks package paths other than the root', async () => {
    const rootDir = await createFixture({
      manifest: { '.': '1.0.0', 'apps/backend': '1.0.0' },
    });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('manifest') && problem.includes('apps/backend')),
      `expected a single-package manifest problem, got: ${JSON.stringify(problems)}`,
    );
  });

  test('requires component-less tags so releases are tagged vX.Y.Z', async () => {
    const config = configFor();
    delete config['include-component-in-tag'];
    const rootDir = await createFixture({ config });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('include-component-in-tag')),
      `expected a tag format problem, got: ${JSON.stringify(problems)}`,
    );
  });

  test('requires the json updater with the $.version jsonpath', async () => {
    const config = configFor();
    config.packages['.']['extra-files'][0].jsonpath = '$.pkg.version';
    const rootDir = await createFixture({ config });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('jsonpath')),
      `expected a jsonpath problem, got: ${JSON.stringify(problems)}`,
    );
  });

  test('requires the node release type', async () => {
    const config = configFor();
    config.packages['.']['release-type'] = 'simple';
    const rootDir = await createFixture({ config });

    const problems = await validateReleasePleaseConfig(rootDir);

    assert.ok(
      problems.some((problem) => problem.includes('release-type')),
      `expected a release-type problem, got: ${JSON.stringify(problems)}`,
    );
  });

  test('the committed release-please config matches this repository', async () => {
    assert.deepEqual(await validateReleasePleaseConfig(REPO_ROOT), []);
  });
});

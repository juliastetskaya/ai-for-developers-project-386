import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { checkVersions, syncVersions } from './sync-versions.mjs';

const fixtures = [];

async function createFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'sync-versions-'));
  fixtures.push(rootDir);

  await writeFile(
    join(rootDir, 'pnpm-workspace.yaml'),
    ['packages:', '  - apps/*', '  - packages/*', '  - typespec', ''].join('\n'),
  );

  await writeManifest(rootDir, 'package.json', 'cal-clone', '1.0.0');
  await writeManifest(rootDir, 'apps/backend/package.json', 'backend', '0.0.1');
  await writeManifest(rootDir, 'apps/frontend/package.json', 'frontend', '0.0.0');
  await writeManifest(rootDir, 'packages/api-client/package.json', 'api-client', '0.0.0');
  await writeManifest(rootDir, 'typespec/package.json', 'typespec', '0.0.0');

  return rootDir;
}

async function writeManifest(rootDir, relativePath, name, version) {
  const filePath = join(rootDir, relativePath);
  await mkdir(join(filePath, '..'), { recursive: true });
  const manifest = { name, private: true, version };
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readVersion(rootDir, relativePath) {
  const manifest = JSON.parse(await readFile(join(rootDir, relativePath), 'utf8'));
  return manifest.version;
}

after(async () => {
  await Promise.all(fixtures.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('checkVersions', () => {
  test('reports every workspace package whose version differs from the root version', async () => {
    const rootDir = await createFixture();

    const result = await checkVersions(rootDir);

    assert.equal(result.rootVersion, '1.0.0');
    assert.deepEqual(
      result.drift.map(({ file, actual }) => ({ file, actual })),
      [
        { file: 'apps/backend/package.json', actual: '0.0.1' },
        { file: 'apps/frontend/package.json', actual: '0.0.0' },
        { file: 'packages/api-client/package.json', actual: '0.0.0' },
        { file: 'typespec/package.json', actual: '0.0.0' },
      ],
    );
    assert.ok(result.drift.every(({ expected }) => expected === '1.0.0'));
  });

  test('reports no drift once every package matches the root version', async () => {
    const rootDir = await createFixture();
    await syncVersions(rootDir);

    const result = await checkVersions(rootDir);

    assert.deepEqual(result.drift, []);
  });
});

describe('syncVersions', () => {
  test('sets every workspace package version to the root version', async () => {
    const rootDir = await createFixture();

    const result = await syncVersions(rootDir);

    assert.equal(result.rootVersion, '1.0.0');
    assert.deepEqual(result.updated, [
      'apps/backend/package.json',
      'apps/frontend/package.json',
      'packages/api-client/package.json',
      'typespec/package.json',
    ]);
    assert.equal(await readVersion(rootDir, 'apps/backend/package.json'), '1.0.0');
    assert.equal(await readVersion(rootDir, 'apps/frontend/package.json'), '1.0.0');
    assert.equal(await readVersion(rootDir, 'packages/api-client/package.json'), '1.0.0');
    assert.equal(await readVersion(rootDir, 'typespec/package.json'), '1.0.0');
  });

  test('is a no-op when every package already matches the root version', async () => {
    const rootDir = await createFixture();
    await syncVersions(rootDir);

    const result = await syncVersions(rootDir);

    assert.deepEqual(result.updated, []);
    assert.equal(await readVersion(rootDir, 'apps/backend/package.json'), '1.0.0');
  });

  test('preserves the rest of the manifest', async () => {
    const rootDir = await createFixture();
    const manifestPath = join(rootDir, 'apps/backend/package.json');
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        { name: 'backend', private: true, version: '0.0.1', type: 'module', scripts: { build: 'nest build' } },
        null,
        2,
      )}\n`,
    );

    await syncVersions(rootDir);

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.deepEqual(manifest, {
      name: 'backend',
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: { build: 'nest build' },
    });
  });
});

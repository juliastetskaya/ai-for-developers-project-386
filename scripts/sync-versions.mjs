#!/usr/bin/env node
/**
 * Keep every workspace package on the single project version.
 *
 * The root package.json `version` is the only source of truth. This script
 * rewrites every workspace package.json `version` to match it, or with
 * `--check` reports drift and exits with a non-zero code.
 *
 * Usage:
 *   node scripts/sync-versions.mjs           # sync
 *   node scripts/sync-versions.mjs --check   # verify (used by `mise run check`)
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';

async function readRootVersion(rootDir) {
  const manifest = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8'));
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('The root package.json must define a non-empty "version".');
  }
  return manifest.version;
}

async function readWorkspacePatterns(rootDir) {
  const source = await readFile(join(rootDir, WORKSPACE_FILE), 'utf8');
  const patterns = [];
  for (const rawLine of source.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const match = /^-\s*(.+)$/.exec(line);
    if (!match) continue;
    const pattern = match[1]
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/^\.\//, '')
      .replace(/\/+$/, '');
    if (pattern) patterns.push(pattern);
  }
  if (patterns.length === 0) {
    throw new Error(`No package patterns found in ${WORKSPACE_FILE}.`);
  }
  return patterns;
}

async function expandPattern(rootDir, pattern) {
  if (!pattern.includes('*')) {
    return [join(rootDir, pattern)];
  }

  const match = /^([^*]+)\/\*$/.exec(pattern);
  if (!match) {
    throw new Error(
      `Unsupported workspace pattern "${pattern}": only one-level "dir/*" globs are supported.`,
    );
  }

  const parentDir = join(rootDir, match[1]);
  let entries;
  try {
    entries = await readdir(parentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => join(parentDir, entry.name));
}

/**
 * Every workspace package manifest, sorted by its repo-relative path.
 * @returns {Promise<Array<{ file: string, manifest: Record<string, unknown> }>>}
 */
export async function findWorkspaceManifests(rootDir) {
  const patterns = await readWorkspacePatterns(rootDir);
  const manifests = [];
  const seen = new Set();

  for (const pattern of patterns) {
    for (const packageDir of await expandPattern(rootDir, pattern)) {
      const manifestPath = join(packageDir, 'package.json');
      if (seen.has(manifestPath)) continue;

      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }

      seen.add(manifestPath);
      manifests.push({ file: relative(rootDir, manifestPath), manifest });
    }
  }

  return manifests.sort((left, right) => left.file.localeCompare(right.file));
}

/**
 * Report workspace packages whose version differs from the root version.
 * @returns {Promise<{ rootVersion: string, drift: Array<{ file: string, actual: string | null, expected: string }> }>}
 */
export async function checkVersions(rootDir) {
  const rootVersion = await readRootVersion(rootDir);
  const manifests = await findWorkspaceManifests(rootDir);

  const drift = manifests
    .filter(({ manifest }) => manifest.version !== rootVersion)
    .map(({ file, manifest }) => ({
      file,
      actual: typeof manifest.version === 'string' ? manifest.version : null,
      expected: rootVersion,
    }));

  return { rootVersion, drift };
}

/**
 * Rewrite every workspace package version to the root version.
 * @returns {Promise<{ rootVersion: string, updated: string[] }>}
 */
export async function syncVersions(rootDir) {
  const rootVersion = await readRootVersion(rootDir);
  const manifests = await findWorkspaceManifests(rootDir);
  const updated = [];

  for (const { file, manifest } of manifests) {
    if (manifest.version === rootVersion) continue;

    manifest.version = rootVersion;
    await writeFile(join(rootDir, file), `${JSON.stringify(manifest, null, 2)}\n`);
    updated.push(file);
  }

  return { rootVersion, updated };
}

async function main() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const checkOnly = process.argv.includes('--check');

  if (checkOnly) {
    const { rootVersion, drift } = await checkVersions(rootDir);
    if (drift.length === 0) {
      console.log(`All workspace packages share version ${rootVersion}.`);
      return;
    }

    console.error(`Workspace package versions do not match the root version ${rootVersion}:`);
    for (const { file, actual, expected } of drift) {
      console.error(`  ${file}: ${actual ?? '(missing)'} -> ${expected}`);
    }
    console.error("Run 'pnpm sync-versions' to fix.");
    process.exitCode = 1;
    return;
  }

  const { rootVersion, updated } = await syncVersions(rootDir);
  if (updated.length === 0) {
    console.log(`All workspace packages already share version ${rootVersion}.`);
    return;
  }

  console.log(`Synced ${updated.length} package(s) to version ${rootVersion}:`);
  for (const file of updated) console.log(`  ${file}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

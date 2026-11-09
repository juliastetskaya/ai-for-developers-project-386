#!/usr/bin/env node
/**
 * Keep the release-please setup aligned with the single-version strategy.
 *
 * This script is intentionally offline: it only reads files from the repo.
 * It checks that release-please is configured for one root package, that the
 * manifest version matches the root package.json, and that every workspace
 * manifest is listed in `extra-files` with the JSON `$.version` updater.
 *
 * Usage:
 *   node scripts/check-release-please.mjs   # used by `mise run check`
 */
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findWorkspaceManifests } from './sync-versions.mjs';

const CONFIG_FILE = 'release-please-config.json';
const MANIFEST_FILE = '.release-please-manifest.json';
const ROOT_PACKAGE = '.';

async function readJson(rootDir, file) {
  return JSON.parse(await readFile(join(rootDir, file), 'utf8'));
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sameKeys(value, expectedKey) {
  const keys = Object.keys(value ?? {});
  return keys.length === 1 && keys[0] === expectedKey;
}

/**
 * Validate the release-please config against the repository manifests.
 * @returns {Promise<string[]>} Human-readable problems; an empty array means the config is valid.
 */
export async function validateReleasePleaseConfig(rootDir) {
  let config;
  let manifest;
  let rootManifest;

  try {
    config = await readJson(rootDir, CONFIG_FILE);
  } catch (error) {
    return [`${CONFIG_FILE}: ${error.message}`];
  }
  try {
    manifest = await readJson(rootDir, MANIFEST_FILE);
  } catch (error) {
    return [`${MANIFEST_FILE}: ${error.message}`];
  }
  try {
    rootManifest = await readJson(rootDir, 'package.json');
  } catch (error) {
    return [`package.json: ${error.message}`];
  }

  const problems = [];
  const packages = config.packages ?? {};

  if (!sameKeys(packages, ROOT_PACKAGE)) {
    problems.push(
      `release-please must configure exactly one root package ("${ROOT_PACKAGE}"), found: ${JSON.stringify(
        Object.keys(packages),
      )}`,
    );
  }

  const rootConfig = packages[ROOT_PACKAGE] ?? {};
  const releaseType = rootConfig['release-type'] ?? config['release-type'];
  if (releaseType !== 'node') {
    problems.push(
      `root package release-type must be "node", got: ${JSON.stringify(releaseType)}`,
    );
  }

  const includeComponentInTag =
    rootConfig['include-component-in-tag'] ?? config['include-component-in-tag'];
  if (includeComponentInTag !== false) {
    problems.push(
      'include-component-in-tag must be false so release tags are plain vX.Y.Z (not <component>-vX.Y.Z)',
    );
  }

  if (!sameKeys(manifest, ROOT_PACKAGE)) {
    problems.push(
      `manifest must track only the root package ("${ROOT_PACKAGE}"), found: ${JSON.stringify(
        Object.keys(manifest),
      )}`,
    );
  }

  const rootVersion = typeof rootManifest.version === 'string' ? rootManifest.version : null;
  if (!rootVersion) {
    problems.push('package.json must define a non-empty "version"');
  }

  const manifestVersion = manifest[ROOT_PACKAGE];
  if (manifestVersion !== rootVersion) {
    problems.push(
      `${MANIFEST_FILE} version ${JSON.stringify(manifestVersion)} does not match the root package.json version ${JSON.stringify(
        rootVersion,
      )}`,
    );
  }

  const extraFiles = rootConfig['extra-files'];
  if (!Array.isArray(extraFiles) || extraFiles.length === 0) {
    problems.push(
      `root package must list every workspace manifest in "extra-files" so release PRs bump all package versions`,
    );
  }

  const listedPaths = new Set();
  for (const entry of Array.isArray(extraFiles) ? extraFiles : []) {
    const label = entry && typeof entry === 'object' && entry.path ? entry.path : '(missing path)';

    if (!entry || typeof entry !== 'object') {
      problems.push(`extra-files entry must be an object, got: ${JSON.stringify(entry)}`);
      continue;
    }
    if (entry.type !== 'json') {
      problems.push(`extra-files ${label}: type must be "json"`);
    }
    if (entry.jsonpath !== '$.version') {
      problems.push(`extra-files ${label}: jsonpath must be "$.version"`);
    }
    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      problems.push('extra-files entry must have a non-empty "path"');
      continue;
    }

    listedPaths.add(entry.path);
    if (!(await fileExists(join(rootDir, entry.path)))) {
      problems.push(`extra-files path does not exist: ${entry.path}`);
    }
  }

  let workspaceManifests;
  try {
    workspaceManifests = (await findWorkspaceManifests(rootDir)).map(({ file }) => file);
  } catch (error) {
    problems.push(`cannot read the workspace manifests: ${error.message}`);
    workspaceManifests = [];
  }

  for (const file of workspaceManifests) {
    if (!listedPaths.has(file)) {
      problems.push(`workspace manifest is missing from extra-files: ${file}`);
    }
  }
  for (const file of listedPaths) {
    if (!workspaceManifests.includes(file)) {
      problems.push(`extra-files path is not a workspace manifest: ${file}`);
    }
  }

  return problems;
}

async function main() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = await validateReleasePleaseConfig(rootDir);

  if (problems.length === 0) {
    console.log('release-please config matches the single-version strategy and workspace manifests.');
    return;
  }

  console.error('release-please configuration problems:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

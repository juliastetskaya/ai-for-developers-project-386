#!/usr/bin/env node
/**
 * Keep the frontend on the generated API SDK.
 *
 * The contract in `typespec/main.ts` is the only supported way to talk to the
 * backend: `packages/api-client` turns it into typed functions, so a drift in
 * endpoints, fields or error shapes becomes a type error instead of a runtime
 * surprise. Two things keep that property:
 *
 * 1. frontend code imports the generated `api-client`;
 * 2. raw HTTP calls (`fetch`, `XMLHttpRequest`, `axios`, `sendBeacon`) live only
 *    in the single adapter `apps/frontend/src/lib/api.ts`, where the SDK client
 *    is configured and errors are normalized.
 *
 * Unit and component tests mock `@/lib/api`, and the live server is covered by
 * the backend e2e suite and the Playwright golden path, so no test needs to
 * bypass the adapter.
 *
 * Usage:
 *   node scripts/check-sdk-usage.mjs   # used by `mise run check`
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_SRC = 'apps/frontend/src';
const ADAPTER = 'apps/frontend/src/lib/api.ts';
const SDK_MODULE = 'api-client';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Raw transport calls that must stay behind the adapter. */
const RAW_HTTP = [
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['axios', /\baxios\b/],
  ['navigator.sendBeacon', /\bnavigator\.sendBeacon\b/],
];

const SDK_IMPORT = new RegExp(
  `(?:from\\s+['"]${SDK_MODULE}['"]|import\\(\\s*['"]${SDK_MODULE}['"]\\s*\\))`,
);

/**
 * Replace comments and string literals with blanks so a word inside a comment
 * or a label (`'fetch(...)'`) never looks like a real call.
 */
export function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""')
    .replace(/\/\/[^\n]*/g, ' ');
}

function toPosix(path) {
  return path.split(sep).join('/');
}

/**
 * Inspect already-read frontend files.
 * @param {Array<{ path: string, source: string }>} files repo-relative paths
 * @returns {{ problems: string[], sdkImports: number }}
 */
export function analyzeFrontend(files) {
  const problems = [];
  let sdkImports = 0;

  for (const file of files) {
    const path = toPosix(file.path);
    // Imports are string literals, so look them up before stripping anything.
    if (SDK_IMPORT.test(file.source)) sdkImports += 1;

    if (path === ADAPTER) continue;

    const code = stripCommentsAndStrings(file.source);
    const lines = code.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      for (const [name, pattern] of RAW_HTTP) {
        if (!pattern.test(lines[index])) continue;
        problems.push(
          `${path}:${index + 1}: raw HTTP "${name}" — call the generated api-client instead`,
        );
      }
    }
  }

  if (sdkImports === 0) {
    problems.push(
      `${FRONTEND_SRC}: the frontend never imports the generated "${SDK_MODULE}"`,
    );
  }

  return { problems, sdkImports };
}

async function collectSourceFiles(rootDir) {
  const startDir = join(rootDir, FRONTEND_SRC);
  const files = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) continue;
      files.push({
        path: toPosix(relative(rootDir, absolute)),
        source: await readFile(absolute, 'utf8'),
      });
    }
  }

  await walk(startDir);
  return files;
}

/**
 * Check the real frontend tree.
 * @returns {Promise<{ problems: string[], sdkImports: number, files: number }>}
 */
export async function checkSdkUsage(rootDir = REPO_ROOT) {
  const files = await collectSourceFiles(rootDir);
  const { problems, sdkImports } = analyzeFrontend(files);
  return { problems, sdkImports, files: files.length };
}

async function main() {
  const { problems, sdkImports, files } = await checkSdkUsage();

  if (problems.length > 0) {
    console.error('Frontend bypasses the generated SDK:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Frontend uses the generated SDK: ${files} file(s) scanned, ` +
      `${sdkImports} SDK import(s), no raw HTTP outside ${ADAPTER}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

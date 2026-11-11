import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { analyzeFrontend, checkSdkUsage } from './check-sdk-usage.mjs';

const ROOT = resolve(dirname(dirname(fileURLToPath(import.meta.url))));
const ADAPTER = 'apps/frontend/src/lib/api.ts';

test('flags raw fetch outside the adapter', () => {
  const { problems } = analyzeFrontend([
    { path: ADAPTER, source: "import { client } from 'api-client'" },
    {
      path: 'apps/frontend/src/pages/landing-page.tsx',
      source: 'const response = await fetch("/meeting-types")',
    },
  ]);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /landing-page\.tsx:1: raw HTTP "fetch\("/);
});

test('flags XMLHttpRequest, axios and sendBeacon', () => {
  const { problems } = analyzeFrontend([
    { path: ADAPTER, source: "import { client } from 'api-client'" },
    { path: 'apps/frontend/src/lib/upload.ts', source: 'new XMLHttpRequest()' },
    { path: 'apps/frontend/src/lib/http.ts', source: 'axios.get("/cards")' },
    { path: 'apps/frontend/src/lib/beacon.ts', source: 'navigator.sendBeacon("/log")' },
  ]);

  assert.equal(problems.length, 3);
});

test('allows the transport in the single adapter', () => {
  const { problems } = analyzeFrontend([
    { path: ADAPTER, source: "import { client } from 'api-client'\nfetch('/health')" },
  ]);

  assert.deepEqual(problems, []);
});

test('requires at least one generated SDK import', () => {
  const { problems, sdkImports } = analyzeFrontend([
    { path: 'apps/frontend/src/App.tsx', source: 'export default function App() { return null }' },
  ]);

  assert.equal(sdkImports, 0);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /never imports the generated "api-client"/);
});

test('ignores raw calls in comments and string literals', () => {
  const { problems } = analyzeFrontend([
    {
      path: 'apps/frontend/src/lib/api.ts',
      source: [
        "import { client } from 'api-client'",
        '// fetch("/meeting-types") is replaced by the SDK',
        "const label = 'fetch(\"/bookings\")'",
        '/* axios.get("/cards") */',
      ].join('\n'),
    },
  ]);

  assert.deepEqual(problems, []);
});

test('accepts the real frontend tree', async () => {
  const result = await checkSdkUsage(ROOT);

  assert.deepEqual(result.problems, []);
  assert.ok(result.sdkImports > 0, 'expected at least one api-client import');
  assert.ok(result.files > 0, 'expected to scan frontend sources');
});

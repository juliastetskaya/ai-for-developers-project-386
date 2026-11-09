import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), 'utf8');

function miseTask(name) {
  const lines = read('mise.toml').split('\n');
  const header = new RegExp(`^\\[tasks\\.(?:"${name}"|${name})\\]\\s*$`);
  const start = lines.findIndex((line) => header.test(line));
  assert.notEqual(start, -1, `mise task "${name}" is missing`);

  let end = lines.findIndex((line, index) => index > start && /^\[/.test(line));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

function miseDepends(task) {
  const section = miseTask(task);
  const match = section.match(/depends\s*=\s*\[([^\]]*)\]/s);
  assert.ok(match, `mise task "${task}" has no depends list`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

test('mise check runs every gate: lint, typecheck, unit+e2e tests, build, SDK freshness', () => {
  const depends = miseDepends('check');
  for (const gate of ['lint', 'typecheck', 'test', 'build', 'check:sdk']) {
    assert.ok(depends.includes(gate), `mise check must depend on "${gate}"`);
  }
});

test('mise test includes backend e2e tests', () => {
  assert.match(miseTask('test'), /test:e2e/);
});

test('root scripts expose an independent backend e2e command', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.match(scripts['test:e2e'] ?? '', /--filter backend test:e2e/);
});

test('CI workflow runs setup and the shared check gate on push and pull_request', () => {
  const workflow = read('.github/workflows/check.yml');
  assert.match(workflow, /^on:/m);
  assert.match(workflow, /^ {2}push:/m);
  assert.match(workflow, /^ {2}pull_request:/m);
  assert.match(workflow, /run: mise run setup/);
  assert.match(workflow, /run: mise run check/);
});

test('CI workflow does not depend on repository secrets (fork-safe)', () => {
  const workflow = read('.github/workflows/check.yml');
  assert.doesNotMatch(workflow, /secrets\./);
});

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

  let end = lines.findIndex(
    (line, index) => index > start && line.startsWith('['),
  );
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

function miseDepends(task) {
  const section = miseTask(task);
  const match = section.match(/depends\s*=\s*\[([^\]]*)\]/s);
  assert.ok(match, `mise task "${task}" has no depends list`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

test('mise check runs every gate sequentially: lint, SDK freshness, typecheck, unit+e2e tests, build', () => {
  const section = miseTask('check');
  assert.doesNotMatch(
    section,
    /^\s*depends\s*=/m,
    'check must run its gates sequentially: check:sdk regenerates the SDK in place',
  );
  for (const gate of [
    'lint',
    'check:sdk',
    'check:sdk-usage',
    'typecheck',
    'test',
    'e2e:golden',
    'build',
  ]) {
    assert.ok(
      section.includes(`mise run ${gate}`),
      `mise check must run "${gate}"`,
    );
  }
});

test('CI installs Playwright before running the shared check gate', () => {
  const workflow = read('.github/workflows/check.yml');
  assert.match(workflow, /playwright install --with-deps chromium/);
});

test('CI builds the production Docker image in a separate pull-request job', () => {
  const workflow = read('.github/workflows/check.yml');
  const start = workflow.search(/^ {2}docker:/m);
  assert.notEqual(start, -1, 'check.yml must define a separate "docker" job');

  const dockerJob = workflow.slice(start);
  assert.match(
    dockerJob,
    /if:\s*github\.event_name == 'pull_request'/,
    'the docker job must run on pull requests only',
  );
  assert.match(dockerJob, /run: mise run docker:build/);
  assert.doesNotMatch(
    dockerJob,
    /run: mise run setup/,
    'the docker job builds inside the image, so it must not install workspace dependencies',
  );
});

test('mise test includes backend e2e tests', () => {
  assert.match(miseTask('test'), /test:e2e/);
});

test('build waits for typecheck so two tsc processes do not write the same build info', () => {
  assert.ok(miseDepends('build').includes('typecheck'));
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

test('lint and typecheck gates also cover the golden path and repo scripts', () => {
  const scripts = JSON.parse(read('package.json')).scripts;

  assert.match(scripts.lint ?? '', /pnpm lint:e2e/);
  assert.match(scripts.typecheck ?? '', /pnpm typecheck:e2e/);
  assert.match(scripts['lint:e2e'] ?? '', /oxlint/);
  assert.match(scripts['lint:e2e'] ?? '', /e2e/);
  assert.match(scripts['lint:e2e'] ?? '', /scripts/);
  assert.match(scripts['typecheck:e2e'] ?? '', /tsconfig\.e2e\.json/);
});

test('release-please prefers a PAT and falls back to GITHUB_TOKEN', () => {
  const workflow = read('.github/workflows/release-please.yml');

  assert.match(
    workflow,
    /token:\s*\$\{\{\s*secrets\.RELEASE_PLEASE_TOKEN\s*\|\|\s*secrets\.GITHUB_TOKEN\s*\}\}/,
  );
});

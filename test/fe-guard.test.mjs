import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPaths, evaluate, globToRegExp, leftoverVariants, matchAny, networkDelta, validateConfig } from '../skills/fe-guard/scripts/guard-core.mjs';
import { parseNameStatus, runGuard } from '../skills/fe-guard/scripts/guard.mjs';
import { spawnBounded } from '../scripts/run-bounded.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'skills/fe-guard/scripts/guard.mjs');
const config = {
  version: 1,
  ui: ['client/src/components/**', 'client/src/pages/**', 'client/src/index.css'],
  frozen: ['server/**', 'shared/**', 'migrations/**', 'client/src/lib/queryClient.*', 'package.json', '.env*'],
  protected: ['design/guard.json', 'docs/design/landmarks.lock.json', 'tests/landmarks*'],
  variants: ['client/src/**/__variants__/**']
};
const rules = (violations) => violations.map(v => `${v.rule}:${v.path}`).sort();
const diffOf = (file, lines) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n${lines.join('\n')}\n`;

test('fe-guard: globs match whole paths, ** crosses folders, * does not', () => {
  assert.ok(globToRegExp('server/**').test('server/google/auth.ts'));
  assert.ok(globToRegExp('client/src/**/__variants__/**').test('client/src/pages/home/__variants__/A.tsx'));
  assert.ok(globToRegExp('client/src/**/__variants__/**').test('client/src/__variants__/A.tsx'));
  assert.ok(!globToRegExp('client/src/*.css').test('client/src/styles/app.css'));
  assert.ok(!globToRegExp('server/**').test('client/server/x.ts'), 'a glob is anchored at the repository root');
  assert.ok(globToRegExp('.env*').test('.env.local'));
  assert.ok(!globToRegExp('package.json').test('packageXjson'), 'dots are literal');
  assert.ok(matchAny('.\\server\\index.ts'.replace('.\\', './'), ['server/**']), 'backslash paths are normalised');
});

test('fe-guard: config must list UI and frozen paths and may not allow everything', () => {
  assert.deepEqual(validateConfig(config), []);
  assert.ok(validateConfig({ ...config, version: 2 }).some(p => p.startsWith('version')));
  assert.ok(validateConfig({ ...config, frozen: [] }).some(p => p.startsWith('frozen')));
  assert.ok(validateConfig({ ...config, ui: ['**'] }).some(p => p.includes('catch-all')));
  assert.ok(validateConfig({ ...config, network_patterns: ['('] }).some(p => p.includes('regular expression')));
  assert.equal(evaluate({ changes: [], config: { version: 1 } }).ok, false, 'an invalid config never passes');
});

test('fe-guard: a UI-only change set passes', () => {
  const changes = [{ status: 'M', path: 'client/src/pages/home.tsx' }, { status: 'A', path: 'client/src/components/Card.tsx' }, { status: 'M', path: 'client/src/index.css' }];
  assert.deepEqual(classifyPaths(changes, config), []);
});

test('fe-guard: backend, schema, dependency and environment files fail', () => {
  const changes = ['server/routes.ts', 'shared/schema.ts', 'migrations/0042_add.sql', 'package.json', '.env.production', 'client/src/lib/queryClient.ts']
    .map(path => ({ status: 'M', path }));
  assert.deepEqual(rules(classifyPaths(changes, config)), changes.map(c => `frozen:${c.path}`).sort());
});

test('fe-guard: a path that is neither UI nor frozen fails, and frozen wins over UI', () => {
  assert.deepEqual(rules(classifyPaths([{ status: 'A', path: 'scripts/seed.ts' }], config)), ['outside-ui:scripts/seed.ts']);
  const overlap = { ...config, ui: ['client/src/**'] };
  assert.deepEqual(rules(classifyPaths([{ status: 'M', path: 'client/src/lib/queryClient.ts' }], overlap)), ['frozen:client/src/lib/queryClient.ts']);
});

test('fe-guard: renaming a frozen file into a UI folder is caught on its old path', () => {
  const changes = [{ status: 'R', from: 'server/helpers.ts', path: 'client/src/components/helpers.ts' }];
  assert.deepEqual(rules(classifyPaths(changes, config)), ['frozen:server/helpers.ts']);
});

test('fe-guard: the lock and guard config change only on their own', () => {
  const lock = { status: 'M', path: 'docs/design/landmarks.lock.json' };
  assert.deepEqual(classifyPaths([lock, { status: 'M', path: 'tests/landmarks.test.tsx' }], config), [], 'lock plus its test, nothing else');
  assert.deepEqual(rules(classifyPaths([lock, { status: 'M', path: 'client/src/pages/home.tsx' }], config)), ['protected:docs/design/landmarks.lock.json']);
});

test('fe-guard: a network line that moves unchanged is fine', () => {
  const diff = diffOf('client/src/pages/home.tsx', ['-  const { data } = useQuery({ queryKey: ["/api/cash"] });'])
    + diffOf('client/src/components/Balance.tsx', ['+const { data } = useQuery({ queryKey: ["/api/cash"] });']);
  assert.deepEqual(networkDelta(diff), []);
});

test('fe-guard: adding, altering or removing a network line fails', () => {
  assert.deepEqual(rules(networkDelta(diffOf('client/src/pages/home.tsx', ['+  const r = await fetch("/api/new");']))), ['network-added:client/src/pages/home.tsx']);
  const altered = networkDelta(diffOf('client/src/pages/home.tsx', ['-  useQuery({ queryKey: ["/api/cash"] });', '+  useQuery({ queryKey: ["/api/cash", userId] });']));
  assert.deepEqual(altered.map(v => v.rule).sort(), ['network-added', 'network-removed']);
  assert.deepEqual(networkDelta(diffOf('client/src/pages/home.tsx', ['-  apiRequest("POST", url, body);'])).map(v => v.rule), ['network-removed']);
  const twice = diffOf('a.tsx', ['-fetch("/api/x");', '+fetch("/api/x");', '+fetch("/api/x");']);
  assert.equal(networkDelta(twice).length, 1, 'a duplicated call is an added call');
});

test('fe-guard: layout-only lines, comments and ignored patterns are not network changes', () => {
  const diff = diffOf('client/src/pages/home.tsx', ['+  <div className="grid gap-4">', '-  <div className="flex">', '+  // fetch("/api/later") once the endpoint exists', '+  const label = "prefetch";']);
  assert.deepEqual(networkDelta(diff), []);
  const diffIgnored = diffOf('client/src/pages/home.tsx', ['+  <a href="/api/docs">Docs</a>']);
  assert.equal(networkDelta(diffIgnored).length, 1);
  assert.deepEqual(networkDelta(diffIgnored, undefined, ['href="/api/docs"']), []);
});

test('fe-guard: the app can list its own data hooks so new uses are caught', () => {
  const changes = [{ status: 'M', path: 'client/src/pages/home.tsx' }];
  const diff = diffOf('client/src/pages/home.tsx', ['+  const approve = useApproveRequest();']);
  assert.equal(evaluate({ changes, diff, config }).ok, true, 'unknown to the default patterns');
  const listed = { ...config, network_extra: ['\\buse(Approve|Cash)\\w*\\s*\\('] };
  assert.deepEqual(evaluate({ changes, diff, config: listed }).violations.map(v => v.rule), ['network-added']);
  assert.equal(evaluate({ changes, diff: diffOf('client/src/pages/home.tsx', ['+  fetch("/api/x");']), config: listed }).ok, false, 'defaults still apply');
  assert.ok(validateConfig({ ...config, network_extra: ['('] }).some(p => p.startsWith('network_extra')));
});

test('fe-guard: --final fails while variant code is still in the tree', () => {
  const tracked = ['client/src/pages/home.tsx', 'client/src/pages/home/__variants__/A.tsx'];
  assert.deepEqual(rules(leftoverVariants(tracked, config)), ['variant-leftover:client/src/pages/home/__variants__/A.tsx']);
  const changes = [{ status: 'A', path: 'client/src/pages/home/__variants__/A.tsx' }];
  assert.equal(evaluate({ changes, trackedFiles: tracked, config }).ok, true, 'variants are allowed while exploring');
  assert.equal(evaluate({ changes, trackedFiles: tracked, config, final: true }).ok, false);
});

test('fe-guard: git name-status output is parsed, including renames', () => {
  const parsed = parseNameStatus(['M', 'a.ts', 'R096', 'old.ts', 'new.ts', 'D', 'gone.ts', ''].join('\0'));
  assert.deepEqual(parsed, [{ status: 'M', path: 'a.ts' }, { status: 'R', from: 'old.ts', path: 'new.ts' }, { status: 'D', path: 'gone.ts' }]);
});

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'fe-guard-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Guard Test', '-c', 'user.email=guard@example.test', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (path, body) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), body); };
  git('init', '-q');
  write('design/guard.json', JSON.stringify(config, null, 2));
  write('server/routes.ts', 'export const routes = [];\n');
  write('client/src/pages/home.tsx', 'export function Home() {\n  const { data } = useQuery({ queryKey: ["/api/cash"] });\n  return <main className="flex">{data}</main>;\n}\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'redesign');
  return { dir, git, write };
}

test('fe-guard: end to end in a real repository', { timeout: 60_000 }, async () => {
  const { dir, git, write } = makeRepo();
  try {
    const run = (...extra) => spawnBounded(process.execPath, [script, '--base', 'main', ...extra], { cwd: dir, timeoutMs: 20_000 });
    const head = () => git('rev-parse', 'HEAD').trim();
    const before = head();

    // Layout change, the query line moves to a new untracked component: UI-only.
    write('client/src/pages/home.tsx', 'import { Balance } from "../components/Balance";\nexport function Home() {\n  return <main className="grid gap-4"><Balance /></main>;\n}\n');
    write('client/src/components/Balance.tsx', 'export function Balance() {\n  const { data } = useQuery({ queryKey: ["/api/cash"] });\n  return <p>{data}</p>;\n}\n');
    let result = await run();
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS: UI-only/);

    // A variant is fine while exploring and fails the final check.
    write('client/src/pages/home/__variants__/A.tsx', 'export const A = () => <main />;\n');
    assert.equal((await run()).code, 0);
    result = await run('--final');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Variant code still present/);
    rmSync(join(dir, 'client/src/pages/home/__variants__'), { recursive: true });
    assert.equal((await run('--final')).code, 0);

    // A new call to the backend from a UI file fails.
    write('client/src/components/Balance.tsx', 'export function Balance() {\n  const { data } = useQuery({ queryKey: ["/api/cash"] });\n  fetch("/api/track");\n  return <p>{data}</p>;\n}\n');
    result = await run();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Network-facing lines added or altered/);
    write('client/src/components/Balance.tsx', 'export function Balance() {\n  const { data } = useQuery({ queryKey: ["/api/cash"] });\n  return <p>{data}</p>;\n}\n');

    // Touching the server fails, committed or not.
    write('server/routes.ts', 'export const routes = ["/api/new"];\n');
    result = await run();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Frozen paths changed \(1\):\n {2}- server\/routes\.ts/);
    git('add', '-A');
    git('commit', '-q', '-m', 'mixed');
    assert.equal((await run()).code, 1, 'a committed backend change is still caught');

    // The guard only reads: it created no commit and left the index alone.
    const committed = head();
    await run();
    assert.equal(head(), committed);
    assert.notEqual(committed, before);
    assert.equal(git('status', '--porcelain').trim(), '');
    assert.equal(readFileSync(join(dir, 'server/routes.ts'), 'utf8'), 'export const routes = ["/api/new"];\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fe-guard: refuses to run without a base or a config', () => {
  const { dir } = makeRepo();
  try {
    assert.equal(runGuard({ cwd: dir }).code, 2);
    assert.equal(runGuard({ cwd: dir, base: 'main', configPath: 'design/missing.json' }).code, 2);
    assert.equal(runGuard({ cwd: dir, base: 'no-such-branch' }).code, 2);
    writeFileSync(join(dir, 'design/guard.json'), JSON.stringify({ version: 1, ui: ['**'], frozen: ['server/**'] }));
    assert.equal(runGuard({ cwd: dir, base: 'main' }).code, 2, 'a catch-all config cannot be used to pass');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fe-guard: shipped templates are valid', () => {
  const example = JSON.parse(readFileSync(join(root, 'skills/fe-guard/templates/guard.example.json'), 'utf8'));
  assert.deepEqual(validateConfig(example), []);
  for (const path of ['server/google/auth.ts', 'shared/schema.ts', 'package.json', '.env', '.github/workflows/ci.yml']) {
    assert.ok(matchAny(path, example.frozen), `${path} should be frozen in the example`);
  }
});

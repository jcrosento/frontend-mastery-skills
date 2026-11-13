import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditConfig, classifyPaths, dataNames, evaluate, globToRegExp, leftoverVariants, matchAny, networkDelta, topLevelSegments, validateConfig } from '../skills/fe-guard/scripts/guard-core.mjs';
import { parseNameStatus, runAudit, runGuard } from '../skills/fe-guard/scripts/guard.mjs';
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

// A small app with the shapes that matter: a data module, a helper that reaches the network through
// another function, pure helpers, a hook that lives beside a component, and a server file.
const app = {
  'client/src/lib/api.ts': [
    'import { apiRequest } from "./queryClient";',
    'import { peso } from "@/lib/format";',
    'export const cashQueryKey = (id: string) => ["/api/cash", id];',
    'export function useCash(id: string) {',
    '  return useQuery({ queryKey: cashQueryKey(id) });',
    '}',
    'export async function removeMember(id: string) {',
    '  return apiRequest("DELETE", "/api/team/" + id);',
    '}',
    'export function approveDraft(id: string) {',
    '  return removeMember(id);',
    '}',
    'export function label(amount: number) {',
    '  // fetch("/api/never") in a comment is not a call',
    '  return peso(amount);',
    '}',
    'function hidden() { return fetch("/api/private"); }',
    'export function describeFailure() {',
    '  throw new Error("removeMember must be called by an owner");',
    '}',
    ''
  ].join('\n'),
  'client/src/lib/queryClient.ts': 'export async function apiRequest(method: string, url: string) {\n  return fetch(url, { method });\n}\n',
  'client/src/lib/format.ts': 'export function peso(n: number) {\n  return "PHP " + n;\n}\n',
  'client/src/lib/session/index.ts': 'export function useSession() {\n  return useQuery({ queryKey: ["/api/me"] });\n}\n',
  'client/src/components/Notice.tsx': [
    'import { useCash } from "../lib/api";',
    'import { useSession } from "@/lib/session";',
    'export function useNoticeCount() {',
    '  return useQuery({ queryKey: ["/api/notices"] });',
    '}',
    'export function Notice() {',
    '  const { data } = useNoticeCount();',
    '  return <p className="text-sm">{data}</p>;',
    '}',
    'export function useTone() {',
    '  return "calm";',
    '}',
    ''
  ].join('\n'),
  'client/src/pages/home.tsx': 'import { Notice } from "../components/Notice";\nexport default function Home() {\n  return <main className="flex"><Notice /></main>;\n}\n',
  'server/routes.ts': 'export async function listCash() {\n  return fetch("https://bank.example/cash");\n}\n',
  'client/src/lib/orphan.ts': 'export function neverImported() {\n  return fetch("/api/orphan");\n}\n'
};
const appFiles = (overrides = {}) => Object.entries({ ...app, ...overrides }).map(([path, source]) => ({ path, source }));
const narrow = { ...config, frozen: [...config.frozen, 'client/src/lib/**'] };

test('fe-guard: a module is split into its top-level declarations', () => {
  const segments = topLevelSegments('import x from "y";\nexport function a() {\n  return 1;\n}\nconst b = () => {\n  return 2;\n};\nexport default class C {}\nexport { b as renamed };\ntype T = string;\nlet c = 3;\n');
  assert.deepEqual(segments.map(s => [s.name, s.exported]), [['a', true], ['b', true], ['C', true], ['c', false]]);
  assert.equal(segments[0].body, 'export function a() {\n  return 1;\n}');
});

test('fe-guard: data functions are found in the code, not typed by hand', () => {
  const { names, patterns } = dataNames(appFiles(), narrow);
  const found = names.map(n => `${n.name}@${n.where}`).sort();
  assert.deepEqual(found, [
    'apiRequest@outside-ui',     // calls fetch
    'approveDraft@outside-ui',   // reaches the network through removeMember
    'cashQueryKey@outside-ui',   // builds an /api path
    'neverImported@outside-ui',  // sits beside the screens; nothing imports it yet, and it is still watched
    'removeMember@outside-ui',   // reaches the network through apiRequest, imported from another module
    'useCash@outside-ui',        // reader hook
    'useNoticeCount@ui',         // a hook that lives beside a component
    'useSession@outside-ui'      // imported through an alias and an index file
  ]);
  for (const absent of ['label', 'peso', 'hidden', 'describeFailure', 'Notice', 'Home', 'useTone', 'listCash']) {
    assert.ok(!names.some(n => n.name === absent), `${absent} must not be listed`);
  }
  const hits = (line) => patterns.some(p => new RegExp(p).test(line));
  assert.ok(hits('const probe = () => removeMember("u");'));
  assert.ok(hits('onClick={approveDraft}'), 'passing the function is wiring it, call or not');
  assert.ok(!hits('<div className="removeMember-row useCash-box" />'), 'a class name is not a call');
  assert.ok(!hits('item.removeMember()'), 'a method of the same name on another object is not this function');
  assert.ok(!hits('const useCashier = 1; removeMembers();'), 'longer names do not match');
  assert.deepEqual(dataNames(appFiles(), narrow), dataNames(appFiles().reverse(), narrow), 'file order does not change the answer');
  // A capitalised name outside the UI (a provider, a client class) is watched as code, never as a word.
  const shell = dataNames(appFiles({ 'client/src/lib/shell.tsx': 'export function App() {\n  const me = useQuery({ queryKey: ["/api/me"] });\n  return <main>{me.data}</main>;\n}\nexport class Bank {\n  static pay() { return fetch("/api/pay"); }\n}\n' }), narrow);
  assert.deepEqual(shell.names.filter(n => n.file.endsWith('shell.tsx')).map(n => n.name), ['App', 'Bank']);
  const code = (line) => shell.patterns.some(p => new RegExp(p).test(line));
  for (const line of ['return <App />;', 'const bank = new Bank();', 'Bank.pay(100);', 'render(App({}));']) assert.ok(code(line), line);
  for (const line of ['<p>App settings for your Bank</p>', 'title="Open the App"', '<AppShell />', 'const label = "Bank.";']) assert.ok(!code(line), line);
  // A Next-style app has no shared parent folder, so reach is by import: `@/lib/api`, `$lib/api`, `../lib/api`.
  for (const spec of ['@/lib/api', '$lib/api', '../lib/api', 'lib/api.js']) {
    const flat = [{ path: 'app/page.tsx', source: `import { pay } from "${spec}";\nexport default function Page() {\n  return <main />;\n}\n` }, { path: 'lib/api.ts', source: 'export function pay() {\n  return fetch("/api/pay");\n}\n' }, { path: 'jobs/nightly.ts', source: 'export function sync() {\n  return fetch("/api/sync");\n}\n' }];
    assert.deepEqual(dataNames(flat, { version: 1, ui: ['app/**', 'components/**'], frozen: ['lib/**', 'jobs/**'] }).names.map(n => n.name), ['pay'], spec);
  }
});

test('fe-guard: wiring a found data function into a screen fails; a restyle passes; network_ignore switches a name off', () => {
  const { patterns } = dataNames(appFiles(), narrow);
  const changes = [{ status: 'M', path: 'client/src/pages/home.tsx' }];
  const wired = diffOf('client/src/pages/home.tsx', ['+  const onRemove = () => removeMember(id);']);
  assert.equal(evaluate({ changes, diff: wired, config: narrow }).ok, true, 'without the found names nobody listed removeMember, so it slips through');
  const caught = evaluate({ changes, diff: wired, config: narrow, derivedPatterns: patterns });
  assert.deepEqual(caught.violations.map(v => v.rule), ['network-added']);
  const unwired = diffOf('client/src/components/Notice.tsx', ['-  const { data } = useNoticeCount();', '+  const data = 0;']);
  assert.deepEqual(evaluate({ changes, diff: unwired, config: narrow, derivedPatterns: patterns }).violations.map(v => v.rule), ['network-removed']);
  const restyle = diffOf('client/src/pages/home.tsx', ['-  return <main className="flex"><Notice /></main>;', '+  return <main className="grid gap-4"><Notice /></main>;']);
  assert.equal(evaluate({ changes, diff: restyle, config: narrow, derivedPatterns: patterns }).ok, true);
  const moved = diffOf('client/src/pages/home.tsx', ['-  const { data } = useCash(id);', '+    const { data } = useCash(id);']);
  assert.equal(evaluate({ changes, diff: moved, config: narrow, derivedPatterns: patterns }).ok, true, 'a call that only moves is fine');
  assert.equal(evaluate({ changes, diff: wired, config: { ...narrow, network_ignore: ['\\bremoveMember\\('] }, derivedPatterns: patterns }).ok, true);
  assert.ok(validateConfig({ ...narrow, derive_data_names: 'no' }).some(p => p.startsWith('derive_data_names')));
});

test('fe-guard: the audit finds a config that lets a redesign reach routes, data and an untested lock', () => {
  const router = 'export default function App() {\n  return <Switch>\n    <Route path="/" component={Home} />\n    <Route path="/team"><Guard page="team"><Team /></Guard></Route>\n    <Route path="/pay" component={Pay} />\n  </Switch>;\n}\n';
  const files = appFiles({ 'client/src/App.tsx': router, 'tests/home.test.ts': 'import lock from "../docs/design/landmarks.lock.json";\n' });
  const tracked = [...files.map(f => f.path), 'design/guard.json', 'design/landmarks.lock.json', 'docs/design/landmarks.lock.json'];
  const wide = { ...config, ui: ['client/**'], frozen: ['server/**', 'client/src/lib/queryClient.*'], protected: ['design/guard.json', 'design/landmarks.lock.json', 'docs/design/landmarks.lock.json'] };
  const loose = auditConfig({ files, config: wide, trackedFiles: tracked });
  assert.equal(loose.ok, false);
  assert.deepEqual(loose.holes.map(h => `${h.rule}:${h.path}`).sort(), [
    'data-in-ui:client/src/lib/api.ts',
    'data-in-ui:client/src/lib/orphan.ts',
    'data-in-ui:client/src/lib/session/index.ts',
    'lock-not-tested:design/landmarks.lock.json',   // only docs/design/... is named by a test
    'routes-in-ui:client/src/App.tsx'
  ]);
  assert.deepEqual(loose.review.map(r => r.path), ['client/src/lib/format.ts'], 'plain code with no network call is listed for a person to read');
  const nav = 'export const ROLE_PAGES = { owner: ["team"], manager: [] };\nexport function canOpen(role: string, page: string) {\n  return ROLE_PAGES[role].includes(page);\n}\n';
  const maths = 'export function owed(amount: number, taxRate: number) {\n  const tax = amount * taxRate;\n  return amount + tax;\n}\n';
  const pointed = auditConfig({ files: appFiles({ 'client/src/lib/nav.ts': nav, 'client/src/lib/owed.ts': maths, 'client/src/lib/zeta.ts': 'export const gap = 4;\n' }), config: wide, trackedFiles: tracked }).review;
  assert.deepEqual(pointed.map(r => [r.path, r.flagged]), [['client/src/lib/nav.ts', true], ['client/src/lib/owed.ts', true], ['client/src/lib/format.ts', false], ['client/src/lib/zeta.ts', false]], 'role tables and money maths are pointed out first');
  assert.match(pointed[0].detail, /roles or permissions/);
  assert.match(pointed[1].detail, /amounts/);

  const tight = { ...narrow, protected: wide.protected };
  const fixed = auditConfig({ files: [...files, { path: 'tests/fe.test.ts', source: 'readFileSync(path.resolve(dir, "../design/landmarks.lock.json"))' }], config: tight, trackedFiles: tracked });
  assert.deepEqual(fixed.holes, []);
  assert.equal(fixed.ok, true);
  assert.ok(fixed.names.some(n => n.name === 'removeMember'));

  assert.deepEqual(auditConfig({ files, config: { ...tight, protected: [] }, trackedFiles: tracked }).holes.map(h => h.rule).sort(), ['config-unprotected', 'lock-not-tested', 'lock-unprotected', 'lock-unprotected']);
  assert.deepEqual(auditConfig({ files, config: { ...tight, network_ignore: ['\\buseCash\\('] }, trackedFiles: tracked }).silenced, ['useCash']);
  assert.equal(auditConfig({ files, config: { version: 1, ui: ['**'], frozen: ['server/**'] }, trackedFiles: tracked }).ok, false, 'an invalid config never audits clean');
});

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'fe-guard-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Guard Test', '-c', 'user.email=guard@example.test', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (path, body) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), body); };
  git('init', '-q');
  write('design/guard.json', JSON.stringify(config, null, 2));
  write('server/routes.ts', 'export const routes = [];\n');
  write('client/src/lib/api.ts', 'export async function apiRequest(method, url) {\n  return fetch(url, { method });\n}\nexport function removeMember(id) {\n  return apiRequest("DELETE", "/api/team/" + id);\n}\nexport function useCash() {\n  return useQuery({ queryKey: ["/api/cash"] });\n}\n');
  write('client/src/pages/home.tsx', 'export function Home() {\n  const { data } = useQuery({ queryKey: ["/api/cash"] });\n  return <main className="flex">{data}</main>;\n}\n');
  write('client/src/components/Count.tsx', 'export function useCount() {\n  return useQuery({ queryKey: ["/api/count"] });\n}\n');
  write('client/src/pages/team.tsx', 'import { useCount } from "../components/Count";\nexport function Team() {\n  const count = useCount();\n  return <p>{count.data}</p>;\n}\n');
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

    // A data function nobody listed by hand is still caught, because it is read from the code.
    write('client/src/components/Balance.tsx', 'import { removeMember } from "../lib/api";\nexport function Balance() {\n  const { data } = useQuery({ queryKey: ["/api/cash"] });\n  return <p onClick={() => removeMember("u1")}>{data}</p>;\n}\n');
    result = await run();
    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Network-facing lines added or altered[^]*removeMember/);
    write('client/src/components/Balance.tsx', 'export function Balance() {\n  const { data } = useQuery({ queryKey: ["/api/cash"] });\n  return <p>{data}</p>;\n}\n');
    result = await run();
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /4 data function\(s\) found in the code and watched/);

    // Renaming a hook and dropping its use in the same change does not hide the dropped call:
    // the names are also read from the code as it was before the change.
    const countFile = readFileSync(join(dir, 'client/src/components/Count.tsx'), 'utf8'), teamFile = readFileSync(join(dir, 'client/src/pages/team.tsx'), 'utf8');
    write('client/src/components/Count.tsx', countFile.replace('useCount', 'useTotal'));
    write('client/src/pages/team.tsx', 'export function Team() {\n  return <p>0</p>;\n}\n');
    result = await run();
    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Network-facing lines removed or altered[^]*const count = useCount\(\);/);
    write('client/src/components/Count.tsx', countFile);
    write('client/src/pages/team.tsx', teamFile);
    assert.equal((await run()).code, 0);

    // The audit reads the same repository and reports on the config itself.
    result = await spawnBounded(process.execPath, [script, '--audit', '--names'], { cwd: dir, timeoutMs: 20_000 });
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /client\/src\/lib\/api\.ts: apiRequest, removeMember, useCash/);
    assert.match(result.stdout, /PASS: no holes found/);

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
    assert.equal(runAudit({ cwd: dir, configPath: 'design/missing.json' }).code, 2);
    writeFileSync(join(dir, 'design/guard.json'), JSON.stringify({ ...config, ui: ['client/**'], frozen: ['server/**'] }));
    const audit = runAudit({ cwd: dir });
    assert.equal(audit.code, 1, 'a config that calls the whole client folder UI has holes');
    assert.ok(audit.lines.some(line => line.includes('client/src/lib/api.ts is not a screen file and talks to the network')));
    writeFileSync(join(dir, 'design/guard.json'), JSON.stringify({ version: 1, ui: ['**'], frozen: ['server/**'] }));
    assert.equal(runGuard({ cwd: dir, base: 'main' }).code, 2, 'a catch-all config cannot be used to pass');
    assert.equal(runAudit({ cwd: dir }).code, 2);
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

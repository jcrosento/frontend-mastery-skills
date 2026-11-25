import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnBounded } from '../scripts/run-bounded.mjs';
import { NEEDED, RULE_PATH, check, planFor, readProject, ruleText, setup, skillsPath } from '../skills/fe-master/scripts/project.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(root, 'skills');
const script = join(skillsDir, 'fe-master/scripts/project.mjs');
const front = name => readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8').match(/description: "(.*)"/)[1];

function project(pkg, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fe-project-'));
  if (pkg) writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
  return dir;
}

test('day to day: the two phrases are where an agent will meet them, and everything the rule names exists', () => {
  assert.match(front('fe-master'), /improve this project/i, 'fe-master must be picked for "Improve this project"');
  assert.match(front('fe-pinterest'), /Pinterest board/, 'fe-pinterest must be picked for "Pinterest board"');
  const rule = ruleText('.agents/skills');
  assert.match(rule, /^---\ndescription: .+\nalwaysApply: true\n---\n/, 'Cursor applies a rule to every chat only with alwaysApply: true');
  for (const phrase of ['## "Improve this project"', '## "Pinterest board"']) assert.ok(rule.includes(phrase), phrase);
  assert.equal(rule.includes('{{'), false);
  // The lines that keep a phrase from doing damage. Each is a promise made to the user, so each is pinned.
  for (const promise of [
    'Never commit to the default branch.',
    'UI only. Do not change server code, the database schema, auth, environment values or any network call',
    'You do not grade your own work.',
    'If its number did not move, undo that commit and say so.',
    'Stop here and wait for "approve".',
    'Never open pinterest.com with a script or a browser tool, and never guess a palette by eye',
    'Layout and behaviour do not.',
    'the tools refuse the name `localhost`',
  ]) assert.ok(rule.includes(promise), `the rule lost a promise: ${promise}`);
  const improve = rule.slice(rule.indexOf('## "Improve this project"'), rule.indexOf('## "Pinterest board"'));
  assert.ok(improve.indexOf('project.mjs check') < improve.indexOf('project.mjs brief') && improve.indexOf('project.mjs brief') < improve.indexOf('Tell the user, before editing'), 'check, then brief, then tell, then edit');
  const board = rule.slice(rule.indexOf('## "Pinterest board"'));
  assert.ok(board.indexOf('palette.mjs') < board.indexOf('wait for "approve"') && board.indexOf('wait for "approve"') < board.indexOf('layers.mjs colour'), 'nothing is applied before the user approves the guide');
  assert.ok(rule.split('\n').length < 80, 'the rule is loaded in every chat, so it stays short');
  const skills = readdirSync(skillsDir);
  for (const name of new Set(rule.match(/\bfe-[a-z-]+\b/g))) assert.ok(skills.includes(name), `the rule names ${name}, which is not a skill`);
  for (const [, path] of rule.matchAll(/\.agents\/skills\/([\w./-]+\.(?:mjs|md))/g)) assert.ok(existsSync(join(skillsDir, path)), `the rule names ${path}, which does not exist`);
  for (const name of NEEDED) assert.ok(skills.includes(name), name);
  for (const name of new Set(rule.match(/\bfe-[a-z-]+\b/g))) assert.ok(NEEDED.includes(name), `check must look for ${name}, because the rule uses it`);
});

test('day to day: the project is read from its files, and a backend is guarded before anything else', () => {
  const empty = project(null);
  const site = project({ name: 'inn', scripts: { dev: 'astro dev' }, devDependencies: { astro: '5' } });
  const app = project({ name: 'ledger', scripts: { dev: 'vite --port 5199', test: 'vitest run' }, dependencies: { react: '19', 'drizzle-orm': '1' }, devDependencies: { vite: '6' } }, { 'server/index.ts': '', 'design/layers/home/spec.json': '{}', 'design/layers/draft/spec.draft.json': '{}' });
  try {
    assert.equal(readProject(empty).empty, true);
    assert.equal(planFor(readProject(empty), 's').length, 1, 'nothing to measure in an empty folder');
    writeFileSync(join(empty, 'index.html'), '<!doctype html>');
    const plain = readProject(empty);
    assert.deepEqual([plain.empty, plain.framework, plain.profile, plain.dev.url], [false, 'plain HTML', 'site', 'http://127.0.0.1:3000'], 'plain files are a site that can be served');
    const s = readProject(site);
    assert.deepEqual([s.profile, s.framework, s.dev.url, s.backend.length], ['site', 'Astro', 'http://127.0.0.1:4321', 0]);
    const sitePlan = planFor(s, '.agents/skills');
    assert.equal(sitePlan.some(step => /fe-guard/.test(step)), false);
    assert.ok(sitePlan.some(step => step.includes('node .agents/skills/fe-ux-audit/scripts/ux-audit.mjs http://127.0.0.1:4321/ --device mobile --allow-loopback-fixture')));
    assert.ok(sitePlan.some(step => /do not invent a new look/.test(step)));
    const a = readProject(app);
    assert.deepEqual([a.profile, a.dev.url, a.react, a.tests], ['app', 'http://127.0.0.1:5199', true, true]);
    assert.deepEqual(a.backend, ['package drizzle-orm', 'folder server/']);
    assert.deepEqual(a.has.specs, ['design/layers/home/spec.json'], 'a draft is not an approved look');
    const plan = planFor(a, '.agents/skills');
    const at = pattern => plan.findIndex(step => pattern.test(step));
    assert.ok(at(/Set up fe-guard first/) > -1 && at(/Set up fe-guard first/) < at(/app-map\.mjs/) && at(/app-map\.mjs/) < at(/npm test/) && at(/npm test/) < at(/Start the app/), plan.join('\n'));
    assert.ok(plan.some(step => step.includes('layers.mjs gate http://127.0.0.1:5199 --spec design/layers/home/spec.json')));
    assert.deepEqual(planFor(a, 'x'), planFor(readProject(app), 'x'), 'the same project gives the same steps');
    for (const steps of [plan, sitePlan, planFor(plain, 's')]) assert.doesNotMatch(steps.join(' '), /https?:\/\/localhost/, 'the tools refuse the name localhost, so no step may print it as an address');
    for (const [, skill, file] of plan.join('\n').matchAll(/\.agents\/skills\/([\w-]+)\/scripts\/([\w.-]+)/g)) assert.ok(existsSync(join(skillsDir, skill, 'scripts', file)), `${skill}/${file}`);
  } finally { for (const dir of [empty, site, app]) rmSync(dir, { recursive: true, force: true }); }
});

test('day to day: setup writes the rule once, keeps private folders out of git, and never replaces a rule it did not write', () => {
  const dir = project({ name: 'x' }, { '.gitignore': 'node_modules/\ndesign/reports/' });
  try {
    assert.deepEqual(setup(dir, { skillsDir: join(dir, '.agents/skills') }).wrote, [RULE_PATH, '.gitignore']);
    const rule = readFileSync(join(dir, RULE_PATH), 'utf8');
    assert.ok(rule.includes('node .agents/skills/fe-master/scripts/project.mjs check'), 'paths are written as typed from the project root');
    assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), "node_modules/\ndesign/reports/\n# front-end skills: scan output, saved pins and the scripts' own packages stay out of git\ndesign/pins/\n.agents/node_modules/\n");
    assert.deepEqual(setup(dir, { skillsDir: join(dir, '.agents/skills') }).wrote, []);
    writeFileSync(join(dir, RULE_PATH), 'my own rule');
    assert.equal(setup(dir).ok, false);
    assert.equal(readFileSync(join(dir, RULE_PATH), 'utf8'), 'my own rule');
    assert.equal(setup(dir, { force: true }).ok, true);
    assert.match(skillsPath(dir, join(dir, '.cursor/skills')), /^\.cursor\/skills$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('day to day: check says NOT READY with the line to run, and READY only when the browser starts and the installed scripts pass', { timeout: 240_000 }, async () => {
  const dir = project({ name: 'x' });
  const bare = join(dir, '.agents/skills'); mkdirSync(join(bare, 'fe-master'), { recursive: true }); writeFileSync(join(bare, 'fe-master/SKILL.md'), 'x');
  try {
    const lines = await check(dir, { skillsDir: bare });
    const failed = lines.filter(([, ok]) => !ok);
    assert.ok(failed.some(([name, , fix]) => /skills the phrases use/.test(name) && fix.includes('npx skills add jcrosento/frontend-mastery-skills') && fix.includes('fe-layers')));
    assert.ok(failed.some(([name, , fix]) => /playwright/.test(name) && fix.includes('npm i --prefix .agents playwright axe-core')));
    assert.ok(failed.some(([name, , fix]) => /rule/.test(name) && fix.endsWith('project.mjs setup')));

    // The real skills, a current rule: every line must hold, including a real browser start and each script's own checks.
    setup(dir);
    const ready = await check(dir);
    assert.deepEqual(ready.filter(([, ok]) => !ok), []);
    assert.ok(ready.some(([name]) => name === 'the browser starts') && ready.filter(([name]) => /passes its own checks/.test(name)).length === 3);
    const cli = await spawnBounded(process.execPath, [script, 'check', '--quick'], { cwd: dir, timeoutMs: 60_000 });
    assert.equal(cli.code, 0, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /READY {2}"Improve this project" and "Pinterest board" can run here\./);
    writeFileSync(join(dir, RULE_PATH), `${readFileSync(join(dir, RULE_PATH), 'utf8')}\nextra`);
    const stale = await spawnBounded(process.execPath, [script, 'check', '--quick'], { cwd: dir, timeoutMs: 60_000 });
    assert.equal(stale.code, 1, 'a rule that no longer matches the installed skills is not ready');
    const inRepo = await spawnBounded(process.execPath, [script, 'setup'], { cwd: root, timeoutMs: 30_000 });
    assert.equal(inRepo.code, 2, 'setup must not write a rule into the skills repository itself');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

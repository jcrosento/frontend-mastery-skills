#!/usr/bin/env node
// Run from the root of the project being worked on:
//   node <skills>/fe-master/scripts/project.mjs setup [--force]   write the always-on Cursor rule; keep private folders out of git
//   node <skills>/fe-master/scripts/project.mjs check             is everything the day-to-day phrases need here, and does it run?
//   node <skills>/fe-master/scripts/project.mjs brief [--json]    what kind of project this is, and the steps "Improve this project" runs
//   node <skills>/fe-master/scripts/project.mjs --selftest
// setup writes .cursor/rules/frontend-mastery.mdc and adds lines to .gitignore. check and brief write nothing.
// Exit 0 ok or READY, 1 NOT READY, 2 could not run.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SKILLS_DIR = resolve(HERE, '..', '..');
export const RULE_PATH = join('.cursor', 'rules', 'frontend-mastery.mdc');
const MARK = 'frontend-mastery-skills rule';
const IGNORED = ['design/reports/', 'design/pins/', '.agents/node_modules/'];
// The skills the two day-to-day phrases reach. A partial install that lacks one of these would stop halfway.
export const NEEDED = ['fe-master', 'fe-scan', 'fe-audit', 'fe-ux-audit', 'fe-responsive', 'fe-guard', 'fe-build', 'fe-system', 'fe-pinterest', 'fe-layers', 'fe-second-eye', 'fe-last-eye', 'fe-memory'];
const INSTALL = 'npx skills add jcrosento/frontend-mastery-skills -a cursor -y';

const BACKEND_PACKAGES = /^(prisma|@prisma\/client|drizzle-orm|mongoose|mongodb|pg|mysql2|better-sqlite3|@neondatabase\/serverless|@supabase\/supabase-js|firebase|firebase-admin|express|fastify|hono|koa|@trpc\/server|next-auth|@auth\/core|@clerk\/.+|lucia|stripe|convex|@vercel\/postgres|@upstash\/redis)$/;
const BACKEND_FOLDERS = ['server', 'api', 'prisma', 'supabase', 'drizzle', 'convex', 'functions', 'app/api', 'pages/api', 'src/app/api', 'src/pages/api', 'src/server'];
const FRAMEWORKS = [['next', 'Next.js', 3000], ['astro', 'Astro', 4321], ['@remix-run/react', 'Remix', 5173], ['nuxt', 'Nuxt', 3000], ['@sveltejs/kit', 'SvelteKit', 5173], ['gatsby', 'Gatsby', 8000], ['vite', 'Vite', 5173], ['react-scripts', 'Create React App', 3000]];

// How the skills folder is written in a command typed from the project root.
export function skillsPath(root, skillsDir = SKILLS_DIR) {
  const rel = relative(resolve(root), skillsDir);
  if (rel && !rel.startsWith('..')) return rel.split(sep).join('/');
  return skillsDir.startsWith(homedir()) ? `~${skillsDir.slice(homedir().length).split(sep).join('/')}` : skillsDir.split(sep).join('/');
}

// Reads the project from its files. Nothing is run.
export function readProject(root) {
  const at = (...parts) => join(root, ...parts);
  const pkg = existsSync(at('package.json')) ? JSON.parse(readFileSync(at('package.json'), 'utf8')) : null;
  const deps = pkg ? Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }) : [];
  const hit = FRAMEWORKS.find(([name]) => deps.includes(name));
  const backend = [...deps.filter(name => BACKEND_PACKAGES.test(name)).map(name => `package ${name}`), ...BACKEND_FOLDERS.filter(folder => existsSync(at(folder))).map(folder => `folder ${folder}/`)];
  const script = pkg?.scripts?.dev ? 'dev' : pkg?.scripts?.start ? 'start' : null;
  const port = Number((String(pkg?.scripts?.[script] || '').match(/(?:--port[= ]|-p |PORT=)(\d{2,5})/) || [])[1]) || (hit ? hit[2] : 3000);
  const plain = !script && existsSync(at('index.html')); // a site of plain files: served as it is, nothing to build
  const folders = path => (existsSync(at(path)) ? readdirSync(at(path), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name) : []);
  const specs = folders('design/layers').filter(name => existsSync(at('design/layers', name, 'spec.json'))).map(name => `design/layers/${name}/spec.json`);
  return {
    empty: !pkg && !plain, name: pkg?.name || null, framework: hit ? hit[1] : plain ? 'plain HTML' : null, react: deps.includes('react'),
    profile: backend.length ? 'app' : 'site', backend,
    dev: script ? { command: `npm run ${script}`, url: `http://127.0.0.1:${port}` } : plain ? { command: 'npx --yes serve -l tcp://127.0.0.1:3000 .', url: 'http://127.0.0.1:3000' } : null,
    tests: Boolean(pkg?.scripts?.test && !/no test specified/.test(pkg.scripts.test)),
    has: { specs, guides: folders('design/style-guide').map(name => `design/style-guide/${name}`), guard: existsSync(at('design/guard.json')), lessons: existsSync(at('design/LESSONS.md')), rule: existsSync(at(RULE_PATH)) },
  };
}

// The ordered steps for "Improve this project". Every line is a command or a named skill, so two runs do the same thing.
export function planFor(project, skills) {
  if (project.empty) return ['There is no package.json and no index.html here, so there is nothing to measure yet. Ask the user what to build; a new site starts with fe-master (site profile) and, if they have a reference site, fe-layers read.'];
  if (!project.dev) return ['package.json has no "dev" or "start" script, so no screen can be opened. Ask the user how the project is run before anything else.'];
  const url = project.dev.url; const run = (skill, file, rest = '') => `node ${skills}/${skill}/scripts/${file}${rest ? ` ${rest}` : ''}`;
  const steps = [`Read design/LESSONS.md and design/memory/ if they exist (fe-memory), so a past miss is not repeated.`];
  if (project.profile === 'app') {
    steps.push(`Backend found (${project.backend.slice(0, 3).join(', ')}). UI only from here on.`);
    steps.push(project.has.guard ? `${run('fe-guard', 'guard.mjs', '--audit')}  must report no holes.` : 'Set up fe-guard first, in its own commit (design/guard.json from its template), then run guard.mjs --audit. No UI change before this passes.');
    steps.push(`${run('fe-scan', 'app-map.mjs', '--strict')}  the screens and links, read from the code.`);
    if (project.tests) steps.push('npm test  on the untouched branch. If it fails now, say so and stop: a broken start cannot be judged.');
  }
  steps.push(`Start the app: ${project.dev.command}  and wait for ${url}  (the tools refuse the name "localhost", so keep the number; if nothing answers there, use http://[::1]:${new URL(url).port} instead)`);
  steps.push(`${run('fe-ux-audit', 'ux-audit.mjs', `${url}/ --device mobile --allow-loopback-fixture`)}  then the same for the two screens used most. This is the "before".`);
  for (const spec of project.has.specs) steps.push(`${run('fe-layers', 'layers.mjs', `gate ${url} --spec ${spec} --allow-loopback-fixture`)}  follow its VERDICT line exactly.`);
  if (!project.has.specs.length) steps.push('No approved look yet (no design/layers/<name>/spec.json). Fix what the audit found; do not invent a new look. A look comes from "Pinterest board" or from fe-layers read on a reference site.');
  if (project.profile === 'site') steps.push('fe-responsive on the home page (320 to 1920 wide), then fe-audit to rank what was found. fe-seo and fe-perf need the deployed address, not the dev server: name them as not checked.');
  steps.push('Rank the findings by severity, take the top three, and continue with step 3 of the rule.');
  return steps;
}

export function ruleText(skills) {
  return readFileSync(join(HERE, '..', 'templates', 'frontend-mastery.mdc'), 'utf8').replaceAll('{{SKILLS}}', skills);
}

export function setup(root, { skillsDir = SKILLS_DIR, force = false } = {}) {
  const target = join(root, RULE_PATH); const wrote = [];
  if (existsSync(target) && !readFileSync(target, 'utf8').includes(MARK) && !force) return { ok: false, reason: `${RULE_PATH} exists and was not written by this script. Move it, or pass --force to replace it.` };
  const text = ruleText(skillsPath(root, skillsDir));
  if (!existsSync(target) || readFileSync(target, 'utf8') !== text) { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, text); wrote.push(RULE_PATH); }
  const ignore = join(root, '.gitignore'); const now = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  const lines = now.split(/\r?\n/).map(line => line.trim()); const missing = IGNORED.filter(line => !lines.includes(line));
  if (missing.length) { writeFileSync(ignore, `${now}${now && !now.endsWith('\n') ? '\n' : ''}${now.includes('# front-end skills') ? '' : '# front-end skills: scan output, saved pins and the scripts\' own packages stay out of git\n'}${missing.join('\n')}\n`); wrote.push('.gitignore'); }
  return { ok: true, wrote };
}

// Each line is [name, ok, how to fix it]. `deep` also starts the browser and runs the installed scripts' own checks.
export async function check(root, { skillsDir = SKILLS_DIR, deep = true } = {}) {
  const skills = skillsPath(root, skillsDir); const out = [];
  const prefix = skills.replace(/\/skills$/, '') || '.';
  const packages = `npm i --prefix ${prefix} playwright axe-core && ${prefix}/node_modules/.bin/playwright install chromium   (on a fresh Linux machine that lacks browser libraries, add --with-deps)`;
  out.push(['Node 22 or newer', Number(process.versions.node.split('.')[0]) >= 22, 'Install Node 22 (nvm install 22).']);
  const missing = NEEDED.filter(name => !existsSync(join(skillsDir, name, 'SKILL.md')));
  out.push([`the ${NEEDED.length} skills the phrases use`, !missing.length, `${INSTALL}   (missing: ${missing.join(', ')})`]);
  const rule = join(root, RULE_PATH);
  const current = existsSync(rule) && readFileSync(rule, 'utf8') === ruleText(skills);
  out.push(['the always-on rule is in place and current', current, `node ${skills}/fe-master/scripts/project.mjs setup`]);
  const need = createRequire(join(skillsDir, 'fe-scan', 'scripts', 'x.mjs'));
  const find = name => { try { return need.resolve(name); } catch { return null; } };
  out.push(['axe-core is installed beside the skills', Boolean(find('axe-core')), packages]);
  const playwright = find('playwright');
  out.push(['playwright is installed beside the skills', Boolean(playwright), packages]);
  if (deep && playwright) {
    let launched = false; let why = '';
    try { const { chromium } = need('playwright'); const browser = await chromium.launch(); await browser.close(); launched = true; } catch (error) { why = String(error.message || error).split('\n')[0].slice(0, 140); }
    out.push(['the browser starts', launched, `${packages}${why ? `   (${why})` : ''}`]);
    if (launched && !missing.length) for (const [skill, file] of [['fe-layers', 'layers.mjs'], ['fe-pinterest', 'palette.mjs'], ['fe-ux-audit', 'ux-audit.mjs']]) {
      const result = spawnSync(process.execPath, [join(skillsDir, skill, 'scripts', file), '--selftest'], { encoding: 'utf8', timeout: 120_000 });
      out.push([`${skill} passes its own checks from where it is installed`, result.status === 0, `Reinstall the skills: ${INSTALL}   (${String(result.stderr || result.stdout || '').trim().split('\n').pop().slice(0, 120)})`]);
    }
  }
  return out;
}

function selftest() {
  const root = mkdtempSync(join(tmpdir(), 'fe-project-'));
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  try {
    const empty = readProject(root);
    write('index.html', '<!doctype html>'); const plain = readProject(root); rmSync(join(root, 'index.html'));
    write('package.json', JSON.stringify({ name: 'site', scripts: { dev: 'astro dev' }, devDependencies: { astro: '5' } }));
    const site = readProject(root);
    write('package.json', JSON.stringify({ name: 'app', scripts: { dev: 'vite --port 5199', test: 'vitest' }, dependencies: { react: '19', '@prisma/client': '6' }, devDependencies: { vite: '6' } }));
    write('design/layers/home/spec.json', '{}');
    const app = readProject(root); const steps = planFor(app, '.agents/skills');
    const first = setup(root); const rule = readFileSync(join(root, RULE_PATH), 'utf8'); const again = setup(root);
    writeFileSync(join(root, RULE_PATH), 'my own rule'); const mine = setup(root);
    const checks = [
      ['a folder with no package.json is called empty and gets no measuring steps', empty.empty && planFor(empty, 's').length === 1],
      ['a folder of plain HTML files is a site that can be served and measured', !plain.empty && plain.framework === 'plain HTML' && planFor(plain, 's').some(step => /ux-audit\.mjs http:\/\/127\.0\.0\.1:3000\//.test(step))],
      ['no step names "localhost" as an address: the tools refuse that name', !/https?:\/\/localhost/.test([...planFor(plain, 's'), ...steps].join(' '))],
      ['a project with no backend is a site, on its framework\'s port', site.profile === 'site' && site.framework === 'Astro' && site.dev.url === 'http://127.0.0.1:4321'],
      ['a database package makes it an app, and the port comes from the dev script', app.profile === 'app' && app.dev.url === 'http://127.0.0.1:5199' && app.backend.includes('package @prisma/client')],
      ['an app is guarded before any screen is opened', steps.findIndex(s => /fe-guard/.test(s)) > -1 && steps.findIndex(s => /fe-guard/.test(s)) < steps.findIndex(s => /Start the app/.test(s))],
      ['an approved spec is gated', steps.some(s => s.includes('layers.mjs gate http://127.0.0.1:5199 --spec design/layers/home/spec.json'))],
      ['setup writes an always-on rule that names both phrases', first.ok && /alwaysApply: true/.test(rule) && rule.includes('"Improve this project"') && rule.includes('"Pinterest board"') && !rule.includes('{{')],
      ['setup twice changes nothing, and private folders are ignored once', again.ok && again.wrote.length === 0 && readFileSync(join(root, '.gitignore'), 'utf8').split('design/pins/').length === 2],
      ['a rule somebody else wrote is not replaced', !mine.ok && readFileSync(join(root, RULE_PATH), 'utf8') === 'my own rule'],
    ];
    checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
    const failed = checks.filter(([, ok]) => !ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} selftest checks passed`);
    return failed ? 1 : 0;
  } finally { rmSync(root, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const root = process.cwd(); const command = args[0];
  if (args.includes('--selftest')) process.exit(selftest());
  if (resolve(root) === resolve(SKILLS_DIR, '..') && existsSync(join(root, 'scripts', 'grade-skills.mjs'))) { console.error('This is the skills repository itself. Run this from the project you are working on.'); process.exit(2); }
  const skills = skillsPath(root);
  if (command === 'setup') {
    const result = setup(root, { force: args.includes('--force') });
    if (!result.ok) { console.error(result.reason); process.exit(2); }
    console.log(result.wrote.length ? `WROTE ${result.wrote.join(' and ')}` : 'Nothing to change: the rule and .gitignore are already current.');
    console.log(`Next: node ${skills}/fe-master/scripts/project.mjs check`);
    process.exit(0);
  }
  if (command === 'check') {
    const lines = await check(root, { deep: !args.includes('--quick') });
    const bad = lines.filter(([, ok]) => !ok);
    for (const [name, ok] of lines) console.log(`${ok ? 'OK  ' : 'MISS'}  ${name}`);
    if (!bad.length) { console.log('READY  "Improve this project" and "Pinterest board" can run here.'); process.exit(0); }
    console.log('NOT READY  Run these, in order, then check again:');
    [...new Set(bad.map(([, , fix]) => fix))].forEach((fix, i) => console.log(`  ${i + 1}. ${fix}`));
    process.exit(1);
  }
  if (command === 'brief') {
    const project = readProject(root); const steps = planFor(project, skills);
    if (args.includes('--json')) { console.log(JSON.stringify({ project, steps }, null, 2)); process.exit(0); }
    console.log(`PROJECT ${project.name || '(unnamed)'}  ${project.empty ? 'empty' : `${project.framework || 'unknown framework'}${project.react ? ', React' : ''}  profile: ${project.profile}`}`);
    if (project.backend.length) console.log(`  backend   ${project.backend.join(', ')}`);
    if (project.dev) console.log(`  runs with ${project.dev.command}  at ${project.dev.url}`);
    console.log(`  look      ${project.has.specs.length ? project.has.specs.join(', ') : 'none approved yet'}${project.has.guides.length ? `; style guides: ${project.has.guides.join(', ')}` : ''}`);
    console.log('STEPS');
    steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
    process.exit(0);
  }
  console.error('Usage: node project.mjs setup | check | brief   (run from the project root)'); process.exit(2);
}

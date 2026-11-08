#!/usr/bin/env node
// Usage: npm run scan -- <url> [--pages 8] [--monkey 30] [--runs 1] [--keywords "a,b"] [--baseline]
// Runs crawlers -> deep-scan (--no-forms) -> elements -> trace -> seo-hygiene -> psi (if PSI_API_KEY) -> compare vs BASELINE/previous.
// Writes manifest.json (steps, exit codes, durations, coverage) + run.log in the dated local folder.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertRequestAllowed } from './network-policy.mjs';
import { writeArtifact } from './artifacts.mjs';

const args = process.argv.slice(2); const url = args[0];
if (!url || args.includes('--help')) { console.error('Usage: npm run scan -- <url> [--pages N] [--monkey S] [--runs N] [--keywords "a,b"] [--baseline] [--dry-run]'); process.exit(url ? 0 : 1); }
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
const pages = opt('pages', '8'), monkey = opt('monkey', '30'), runs = Number(opt('runs', '1')), keywords = opt('keywords', '');
const baseline = args.includes('--baseline'); const dry = args.includes('--dry-run');
if (!dry) await assertRequestAllowed(url);
const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const d = new Date(); const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const siteDir = join('design', 'reports', 'scan', site); const out = join(siteDir, stamp); mkdirSync(out, { recursive: true });
const log = join(out, 'run.log'); const manifest = { url, stamp, startedAt: new Date().toISOString(), node: process.version, dryRun: dry, steps: [] };
const S = 'skills/fe-scan/scripts';
const step = (name, cmd, cmdArgs, optional = false) => {
  const t = Date.now(); writeArtifact(log, `\n[${new Date().toISOString()}] ${name}: ${cmd} ${cmdArgs.join(' ')}\n`, { append: true });
  if (dry) { manifest.steps.push({ name, exit: null, skipped: 'dry-run', optional }); console.log(`DRY  ${name}`); return true; }
  const r = spawnSync(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FE_SCAN_STAMP: stamp } });
  writeArtifact(log, (r.stdout || '') + (r.stderr || ''), { append: true });
  const rec = { name, exit: r.status, ms: Date.now() - t, optional }; manifest.steps.push(rec);
  console.log(`${rec.exit === 0 ? 'OK  ' : optional ? 'SKIP' : 'FAIL'} ${name} (${Math.round(rec.ms / 1000)}s)`);
  return r.status === 0;
};
step('crawlers', 'node', [`${S}/crawlers.mjs`, url]);
for (let i = 0; i < runs; i++) step(`deep-scan#${i + 1}`, 'node', [`${S}/deep-scan.mjs`, url, '--pages', pages, '--monkey', monkey, '--no-forms']);
step('elements', 'node', [`${S}/elements.mjs`, url]);
for (let i = 0; i < runs; i++) step(`trace#${i + 1}`, 'node', [`${S}/trace.mjs`, url]);
step('seo-hygiene', 'node', [`${S}/seo-hygiene.mjs`, url, ...(keywords ? ['--keywords', keywords] : [])]);
if (process.env.PSI_API_KEY) step('psi', 'node', [`${S}/psi.mjs`, url, '--strategy', 'both'], true); else manifest.steps.push({ name: 'psi', exit: null, skipped: 'no PSI_API_KEY', optional: true });
const prev = readdirSync(siteDir).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f) && f !== stamp).sort().pop();
const baseFile = join(siteDir, 'BASELINE');
if (baseline) { writeArtifact(baseFile, stamp); console.log(`baseline set to ${stamp}`); }
let compareTo = prev; if (existsSync(baseFile)) { const b = readFileSync(baseFile, 'utf8').trim(); if (b && b !== stamp && existsSync(join(siteDir, b))) compareTo = b; }
if (compareTo && compareTo !== stamp) step('compare', 'node', [`${S}/compare.mjs`, join(siteDir, compareTo), out], true); else manifest.steps.push({ name: 'compare', exit: null, skipped: 'no previous run', optional: true });
manifest.finishedAt = new Date().toISOString();
manifest.coverage = { pages: Number(pages), devices: ['pixel-7', 'iphone-14', 'ipad', 'laptop', 'desktop'], monkeySeconds: Number(monkey), runs, forms: 'blocked (--no-forms)', psi: !!process.env.PSI_API_KEY, fieldData: !!process.env.PSI_API_KEY, heatmaps: 'PREDICTED + MONKEY click only', analytics: 'not connected in this run', notCovered: ['form submission and CRM hand-off', 'authenticated pages', 'real-user heatmaps', 'multi-run medians unless --runs > 1'] };
writeArtifact(join(out, 'manifest.json'), manifest);
console.log(`\nmanifest: ${out}/manifest.json`);
const failed = manifest.steps.filter(s => s.exit !== 0 && s.exit !== null && !s.optional); process.exit(failed.length ? 2 : 0);

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnBounded } from '../scripts/run-bounded.mjs';
import { fromCensus, summarize } from '../skills/fe-ux-audit/scripts/ux-audit-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'skills/fe-ux-audit/scripts/ux-audit.mjs');
const pages = join(root, 'test/fixtures/pages');

function serve() {
  const server = createServer((req, res) => {
    if (req.method !== 'GET') { server.writes = (server.writes || 0) + 1; }
    const name = req.url.split('?')[0].replace(/^\//, '');
    if (!/^ux-(defects|clean)\.html$/.test(name)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(readFileSync(join(pages, name)));
  });
  return new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => done(server)); });
}

async function audit(server, page, out, extra = ['--allow-loopback-fixture']) {
  const url = `http://127.0.0.1:${server.address().port}/${page}`;
  return spawnBounded(process.execPath, [script, url, ...extra], { cwd: out, env: { ...process.env, FE_SCAN_STAMP: 'fixture' }, timeoutMs: 60_000 });
}

test('fe-ux-audit: a phone needs 44px targets, a desktop needs 24px', () => {
  const census = { targets: [{ label: 'Save', w: 30, h: 30 }], smallText: [], zoomInputs: [], overflowPx: 0, widest: [], dead: [], h1: 1, unsizedImages: 0 };
  assert.ok(fromCensus(census, { mobile: true }).some(item => item.check === 'tap:under-44'));
  assert.equal(fromCensus(census, { mobile: false }).length, 0);
  assert.equal(summarize([], { axe: 'skipped' }).verdict, 'UNVERIFIED');
});

test('fe-ux-audit: a real browser finds every seeded defect, fails the screen, and writes the findings', { timeout: 90_000 }, async () => {
  const server = await serve();
  const out = mkdtempSync(join(tmpdir(), 'fe-ux-audit-'));
  try {
    const run = await audit(server, 'ux-defects.html', out);
    assert.equal(run.timedOut, false, run.stderr);
    assert.equal(run.code, 1, `a screen with severity 3 findings must exit 1: ${run.stdout}${run.stderr}`);
    const report = JSON.parse(readFileSync(join(out, 'design/reports/ux-audit/127.0.0.1/fixture/findings-mobile.json'), 'utf8'));
    assert.equal(report.verdict, 'FAIL');
    assert.equal(report.axe, 'ran');
    const found = report.findings.map(item => item.check);
    for (const check of ['axe:button-name', 'axe:color-contrast', 'control:dead', 'layout:sideways-scroll', 'tap:under-24', 'tap:under-44', 'text:under-12', 'input:zooms', 'leak:a doubled currency sign', 'leak:the word "undefined"', 'heading:h1']) {
      assert.ok(found.includes(check), `missed ${check}; found ${found.join(', ')}`);
    }
    assert.ok(report.findings.every(item => /^H(10|[1-9])$/.test(item.heuristic) && item.severity >= 1 && item.severity <= 4));
    assert.equal(server.writes || 0, 0, 'the audit must never send a write');
  } finally { server.close(); rmSync(out, { recursive: true, force: true }); }
});

test('fe-ux-audit: a clean screen passes, and a local address is refused without the flag', { timeout: 90_000 }, async () => {
  const server = await serve();
  const out = mkdtempSync(join(tmpdir(), 'fe-ux-audit-'));
  try {
    const clean = await audit(server, 'ux-clean.html', out);
    assert.equal(clean.code, 0, `${clean.stdout}${clean.stderr}`);
    assert.match(clean.stdout, /VERDICT PASS/);
    const refused = await audit(server, 'ux-clean.html', out, []);
    assert.equal(refused.code, 2);
    assert.match(refused.stderr, /refused/i);
  } finally { server.close(); rmSync(out, { recursive: true, force: true }); }
});

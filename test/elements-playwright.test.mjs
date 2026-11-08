import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnBounded } from '../scripts/run-bounded.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'test/fixtures/pages/elements-consent.html');
const script = join(root, 'skills/fe-scan/scripts/elements.mjs');
const EMAIL = 'owner@example.test';
const TOKEN = 'sk_test_FAKE1234567890';

function listen(server, port, host) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListen);
  });
}

test('async harness escalates a forced timeout to SIGKILL and never reports green', { timeout: 5_000 }, async () => {
  const started = Date.now();
  const result = await spawnBounded(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], {
    cwd: root, env: process.env, timeoutMs: 250, killGraceMs: 150
  });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0, 'a timed-out process must never be reported as green');
  assert.equal(result.signal, 'SIGKILL', 'a child that ignores the abort signal must be force-killed after the grace period');
  assert.ok(Date.now() - started < 5_000, 'forced termination must complete within the test deadline');
});

test('elements scanner passes three seeded runs with network, consent, animation, and redaction checks', { timeout: 90_000 }, async () => {
  let postHits = 0, redirectHits = 0, html = '', privateOrigin = '';
  const main = createServer((req, res) => {
    if (req.method === 'POST') postHits++;
    if (req.url === '/redirect-private') {
      redirectHits++;
      res.writeHead(302, { location: `${privateOrigin}/private-final` });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
  const out = mkdtempSync(join(tmpdir(), 'fe-elements-test-'));
  const stable = [];
  try {
    await listen(main, 0, '127.0.0.1');
    const { port } = main.address();
    privateOrigin = 'http://169.254.169.254';
    const origin = `http://127.0.0.1:${port}`;
    html = readFileSync(fixture, 'utf8').replaceAll('__ORIGIN__', origin).replaceAll('__PRIVATE_ORIGIN__', privateOrigin).replaceAll('__EMAIL__', EMAIL).replaceAll('__TOKEN__', TOKEN);
    for (let index = 1; index <= 3; index++) {
      const stamp = `playwright-fixture-${index}`;
      const url = `${origin}/?access_token=abcdefghijk12345&email=${EMAIL}`;
      const run = await spawnBounded(process.execPath, [script, url, '--device', 'desktop', '--allow-loopback-fixture', '--dismiss-consent'], {
        cwd: out, env: { ...process.env, FE_SCAN_STAMP: stamp }, timeoutMs: 25_000
      });
      assert.equal(run.timedOut, false, `run ${index} timed out: ${run.stderr}`);
      assert.equal(run.code, 0, `run ${index} failed (${run.signal || run.code}): ${run.stderr}\n${run.stdout}`);
      const reportPath = join(out, 'design/reports/scan/127.0.0.1', stamp, 'elements.json');
      const reportText = readFileSync(reportPath, 'utf8');
      const report = JSON.parse(reportText);
      const desktop = report.desktop;
      assert.equal(desktop.banner.found, true, `run ${index}: consent child selector should be detected`);
      assert.match(desktop.banner.selector, /cookie-child/, `run ${index}: report should identify the matched child selector`);
      assert.equal(desktop.banner.chosen, 'Essential only');
      assert.equal(desktop.banner.dismissed, 'clicked', 'only the synthetic fixture opts into consent dismissal');
      assert.ok(desktop.buttonStatesBlocked.some(state => state.status === 'blocked'), 'pre-dismiss overlay must be reported as blocked');
      const timeoutState = desktop.buttonStates.find(state => state.text === 'Unhoverable test target');
      assert.equal(timeoutState?.status, 'unknown', 'an unhoverable target must not be counted as a pass');
      assert.equal(timeoutState?.errorKind, 'timeout');
      assert.ok(desktop.findings.some(finding => finding.includes('interaction probe(s) unknown')));
      const animated = desktop.census.buttons.find(button => button.text === 'Frozen animation target');
      assert.equal(animated?.transition, '0s', 'CSS transitions must be frozen before sampling');
      const animatedState = desktop.buttonStates.find(state => state.text === 'Frozen animation target');
      assert.ok(animatedState?.activeChanges.includes('transform'), 'forced :active state should be observed without a real click');
      assert.ok(desktop.network.blockedRequests.some(item => /method/i.test(item.reason)), 'POST must be stopped by the browser request guard');
      assert.ok(desktop.network.blockedRequests.some(item => /non-public/i.test(item.reason)), 'private-IP subresource and redirect must be stopped');
      assert.equal(reportText.includes(EMAIL), false, 'email must not appear in scanner JSON');
      assert.equal(reportText.includes(TOKEN), false, 'fake token must not appear in scanner JSON');
      assert.equal(reportText.includes('abcdefghijk12345'), false, 'query token must not appear in scanner JSON');
      stable.push(JSON.stringify(desktop.buttonStates.map(({ text, status, errorKind, hoverChanges, activeChanges, focusVisible }) => ({ text, status, errorKind, hoverChanges, activeChanges, focusVisible }))));
    }
    assert.equal(new Set(stable).size, 1, 'three consecutive runs must have identical interaction results');
    assert.equal(postHits, 0, 'no POST request may reach the fixture server');
    assert.equal(redirectHits, 3, 'each seeded page should exercise the redirect guard');
    const artifactTexts = [];
    const visit = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) visit(path); else if (/\.(?:json|md|svg|log)$/i.test(entry.name)) artifactTexts.push(readFileSync(path, 'utf8')); } };
    visit(out);
    assert.ok(artifactTexts.length >= 6, 'all three runs should leave JSON and Markdown evidence for redaction checks');
    for (const text of artifactTexts) {
      assert.equal(text.includes(EMAIL), false, 'email must be absent from every generated text artifact');
      assert.equal(text.includes(TOKEN), false, 'token must be absent from every generated text artifact');
    }
  } finally {
    main.closeAllConnections?.();
    await new Promise(resolveClose => main.listening ? main.close(resolveClose) : resolveClose());
    rmSync(out, { recursive: true, force: true });
  }
});

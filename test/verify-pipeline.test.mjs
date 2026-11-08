import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { spawnBounded } from '../scripts/run-bounded.mjs';
import { compareFolders } from '../skills/fe-scan/scripts/compare.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scanner = resolve(root, 'skills/fe-scan/scripts/elements.mjs');
const validator = resolve(root, 'scripts/validate-evidence.mjs');
const policyCli = resolve(root, 'scripts/evaluate-policy.mjs');
const unique = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
}
function close(server) {
  return new Promise(resolveClose => {
    server.closeAllConnections?.();
    if (server.listening) server.close(resolveClose);
    else resolveClose();
  });
}
function capturedAt() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function comparisonDocument({ runId, beforeId, afterId, beforeFile, afterFile, beforeCount, afterCount }) {
  const absolute = afterCount - beforeCount;
  const percent = beforeCount === 0 ? null : Math.round((absolute / Math.abs(beforeCount)) * 10_000) / 100;
  const verdict = beforeCount === afterCount ? 'unchanged' : afterCount > beforeCount ? 'improved' : 'regressed';
  const time = capturedAt();
  return {
    schemaVersion: '1.0.0',
    runId,
    subject: { alias: 'seeded-fixture', platform: 'custom' },
    baseline: { id: beforeId, capturedAt: time, reference: 'independent seeded local browser scan' },
    candidate: { id: afterId, capturedAt: time, reference: 'independent seeded local browser scan' },
    coverage: {
      plannedProfiles: ['desktop'], completedProfiles: ['desktop'], skippedProfiles: [],
      checks: { planned: 1, passed: 1, failed: 0, skipped: 0 }
    },
    metrics: [{
      key: 'visible_button_count', unit: 'buttons', aggregation: 'single', direction: 'higher-is-better',
      before: { value: beforeCount, status: 'measured' },
      after: { value: afterCount, status: 'measured' },
      delta: { absolute, percent, verdict },
      evidence: {
        before: [{ file: beforeFile, pointer: '/desktop/census/buttons', transform: 'count' }],
        after: [{ file: afterFile, pointer: '/desktop/census/buttons', transform: 'count' }]
      }
    }],
    findings: { resolved: [], new: [], unchanged: [] },
    limitations: [{ area: 'production-site-impact', status: 'not-run', reason: 'Synthetic local fixture only; no live site or business outcome was measured.' }],
    privacy: { sourceClass: 'synthetic', containsPersonalData: false, containsSecrets: false, sanitized: true }
  };
}

// The fixture server is deliberately loopback-only and the browser scanner must
// opt in explicitly. Its POST counter proves the request guard blocks mutations.
let postHits = 0, pageHits = 0;
const fixtureServer = createServer((request, response) => {
  if (request.method === 'GET' && new URL(request.url, `http://${request.headers.host}`).pathname === '/') pageHits++;
  if (request.method === 'POST') {
    postHits++;
    response.writeHead(204);
    return response.end();
  }
  const variant = new URL(request.url, `http://${request.headers.host}`).searchParams.get('variant');
  const count = variant === 'candidate' ? 2 : 4;
  const buttons = Array.from({ length: count }, (_, index) => `<button style="height:40px" type="button">Synthetic action ${index + 1}</button>`).join('\n');
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`<!doctype html><html><head><title>Seeded test page</title><style>body{font:16px sans-serif}button{margin:8px}</style></head><body><main><h1>Seeded fixture</h1>${buttons}<img alt="" src="http://169.254.169.254/latest/meta-data"><script>fetch('/',{method:'POST',body:'synthetic'}).catch(()=>{});</script></main></body></html>`);
});

test('scanner rejects loopback destinations without explicit fixture opt-in before any request', { timeout: 8_000 }, async () => {
  let hits = 0;
  const server = createServer((_request, response) => { hits++; response.end('must not be reached'); });
  const out = mkdtempSync(join(tmpdir(), 'fe-loopback-negative-'));
  await listen(server);
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const stamp = `negative-${unique}`;
    const result = await spawnBounded(process.execPath, [scanner, url, '--device', 'desktop'], {
      cwd: out, env: { ...process.env, FE_SCAN_STAMP: stamp }, timeoutMs: 5_000
    });
    assert.equal(result.timedOut, false);
    assert.equal(result.code, 2, 'loopback scan without opt-in must exit with a policy refusal');
    const refusal = JSON.parse(result.stderr.trim().split(/\r?\n/).at(-1));
    assert.deepEqual(refusal, {
      event: 'target-policy', status: 'blocked', code: 'ERR_TARGET_POLICY',
      reason: 'Target rejected by read-only network policy before network access.'
    });
    const manifest = JSON.parse(readFileSync(join(out, 'design/reports/scan/policy-blocked', stamp, 'manifest.json'), 'utf8'));
    assert.equal(manifest.targetPolicy.code, 'ERR_TARGET_POLICY', 'refusal reason must be recorded in the local machine-readable manifest');
    assert.equal(hits, 0, 'rejected fixture URL must be blocked before making an HTTP request');
  } finally { await close(server); rmSync(out, { recursive: true, force: true }); }
});

test('end-to-end: real scanner output validates, compares two independent attempts, and escalates policy', { timeout: 180_000 }, async () => {
  const scanRoot = mkdtempSync(join(tmpdir(), 'fe-verify-scan-'));
  const evidenceDir = join(root, 'test/fixtures', `.verify-pipeline-${unique}`);
  await listen(fixtureServer);
  const origin = `http://127.0.0.1:${fixtureServer.address().port}`;
  const scans = [];
  try {
    mkdirSync(evidenceDir, { recursive: true });
    for (let attempt = 1; attempt <= 2; attempt++) {
      const beforeId = `pipeline-${unique}-${attempt}-before`;
      const afterId = `pipeline-${unique}-${attempt}-after`;
      const runScan = async (id, variant) => {
        const stamp = `${id}`;
        const url = `${origin}/?variant=${variant}&attempt=${attempt}`;
        const result = await spawnBounded(process.execPath, [scanner, url, '--device', 'desktop', '--allow-loopback-fixture'], {
          cwd: scanRoot,
          env: { ...process.env, FE_SCAN_STAMP: stamp },
          timeoutMs: 25_000
        });
        assert.equal(result.timedOut, false, `${id} scanner timed out: ${result.stderr}`);
        assert.equal(result.code, 0, `${id} scanner failed (${result.signal || result.code}): ${result.stderr}\n${result.stdout}`);
        const generated = join(scanRoot, 'design/reports/scan/127.0.0.1', stamp, 'elements.json');
        assert.ok(existsSync(generated), `${id} should produce actual elements.json`);
        const report = JSON.parse(readFileSync(generated, 'utf8'));
        const copied = join(evidenceDir, `${id}.json`);
        copyFileSync(generated, copied);
        return { id, generatedDir: dirname(generated), report, evidenceFile: `test/fixtures/.verify-pipeline-${unique}/${id}.json` };
      };
      const before = await runScan(beforeId, 'baseline');
      const after = await runScan(afterId, 'candidate');
      const beforeCount = before.report.desktop.census.buttons.length;
      const afterCount = after.report.desktop.census.buttons.length;
      assert.equal(beforeCount, 4, 'baseline measure must come from four scanner-observed buttons');
      assert.equal(afterCount, 2, 'candidate measure must come from two scanner-observed buttons');
      const elementComparison = compareFolders(before.generatedDir, after.generatedDir);
      assert.equal(elementComparison.covered.elements, true, 'repo compare implementation should cover the actual scanner outputs');
      assert.ok(existsSync(join(after.generatedDir, 'compare.json')), 'repo compare must write an output for the preserved attempts');
      const document = comparisonDocument({
        runId: `pipeline-comparison-${unique}-${attempt}`,
        beforeId, afterId,
        beforeFile: before.evidenceFile,
        afterFile: after.evidenceFile,
        beforeCount, afterCount
      });
      const comparisonFile = join(evidenceDir, `comparison-${attempt}.json`);
      writeFileSync(comparisonFile, `${JSON.stringify(document, null, 2)}\n`);
      scans.push(comparisonFile);
      const validated = await spawnBounded(process.execPath, [validator, comparisonFile], { cwd: root, timeoutMs: 8_000 });
      assert.equal(validated.code, 0, `evidence validation failed: ${validated.stderr}\n${validated.stdout}`);
    }
    const policy = await spawnBounded(process.execPath, [policyCli, ...scans], { cwd: root, timeoutMs: 8_000 });
    assert.equal(policy.code, 2, `two independently scanned regressions should produce policy escalation: ${policy.stdout}\n${policy.stderr}`);
    assert.match(policy.stdout, /Policy ESCALATION: visible_button_count regressed/);
    assert.equal(pageHits, 4, 'the explicit fixture opt-in should permit exactly four expected page navigations');
    assert.equal(postHits, 0, 'non-GET browser requests must not reach the local server');
  } finally {
    await close(fixtureServer);
    rmSync(scanRoot, { recursive: true, force: true });
    rmSync(evidenceDir, { recursive: true, force: true });
    postHits = 0;
    pageHits = 0;
  }
});

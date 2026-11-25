import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnBounded } from '../scripts/run-bounded.mjs';
import { serveLayersSite } from './helpers/layers-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'skills/fe-inspect/scripts/capture.mjs');

test('fe-inspect capture: a local address is refused without the flag; with it one page is read at six widths and nothing is written to the site', { timeout: 120_000 }, async () => {
  const server = await serveLayersSite('ref');
  const out = mkdtempSync(join(tmpdir(), 'fe-inspect-capture-'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const run = extra => spawnBounded(process.execPath, [script, url, 'inn', ...extra], { cwd: out, timeoutMs: 100_000 });
  try {
    const refused = await run([]);
    assert.equal(refused.code, 2, refused.stdout + refused.stderr);
    assert.equal(existsSync(join(out, 'design')), false, 'a refused capture writes nothing');
    const read = await run(['--allow-loopback-fixture']);
    assert.equal(read.code, 0, read.stdout + read.stderr);
    const report = JSON.parse(readFileSync(join(out, 'design/inspection/inn/capture.json'), 'utf8'));
    assert.deepEqual(Object.keys(report.breakpoints), ['320', '390', '768', '1024', '1280', '1920']);
    assert.equal(report.breakpoints['390'].styles.h1.fontSize, '32px');
    assert.equal(report.breakpoints['390'].styles.horizontalOverflow, false);
    assert.ok(existsSync(join(out, 'design/inspection/inn/390-full.png')));
    assert.equal(server.writes, 0);
  } finally { server.close(); rmSync(out, { recursive: true, force: true }); }
});

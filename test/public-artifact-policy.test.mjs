import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertNoGeneratedScanArtifacts, generatedScanPaths } from '../scripts/public-artifact-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('published worked example stays synthetic and omits site identifiers', () => {
  const example = readFileSync(resolve(root, 'examples/synthetic-expedition/audit.md'), 'utf8');
  assert.match(example, /fully synthetic teaching fixture/i);
  assert.doesNotMatch(example, /https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|seatours|seatourspalawan/i);
});

test('public artifact policy rejects raw scan paths without printing their names', () => {
  const paths = ['scripts/verify.mjs', 'design/reports/scan/private-example/raw.json'];
  assert.deepEqual(generatedScanPaths(paths), ['design/reports/scan/private-example/raw.json']);
  assert.throws(() => assertNoGeneratedScanArtifacts(paths), /1 generated scan artifact path/);
});

test('gitignore excludes newly generated scan output without deleting tracked history', () => {
  const ignored = execFileSync('git', ['check-ignore', '-v', '--no-index', 'design/reports/scan/synthetic.example/never-commit.json'], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(ignored, /^\.gitignore:\d+:design\/reports\/scan\//);
  const trackedCount = execFileSync('git', ['ls-files', 'design/reports/scan'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean).length;
  assert.ok(trackedCount > 0, 'existing tracked scan artifacts remain intact; this change does not purge history');
});

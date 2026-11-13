import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBTRACTION_SHARE, checkCitations, checkMatrix, checkSubtraction, checkTokens, citablePatterns } from '../skills/fe-reference/scripts/gates.mjs';
import { validateManifest } from '../skills/fe-inspect/scripts/shot-manifest.mjs';
import { spawnBounded } from '../scripts/run-bounded.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const refs = join(root, 'skills/fe-reference/references');
const script = join(root, 'skills/fe-reference/scripts/gates.mjs');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const folders = readdirSync(refs).filter(n => statSync(join(refs, n)).isDirectory());

const criteria = [['familiarity', 30], ['task_shape', 25], ['speed', 20], ['minimalism_headroom', 15], ['aesthetic_ceiling', 10]].map(([id, weight]) => ({ id, weight }));
const scores = (values) => Object.fromEntries(criteria.map((c, i) => [c.id, { value: values[i], source: 'owner interview 2026-11-13' }]));
const matrix = (winner, a = [5, 4, 4, 3, 3], b = [3, 5, 4, 4, 4]) => ({ flow: 'send-money', venture: 'kael', criteria: structuredClone(criteria), winner, candidates: [{ id: 'gcash', scores: scores(a) }, { id: 'ios-camera', scores: scores(b) }] });

test('fe-reference gates: the recorded winner must be the one the scores select', () => {
  // gcash: 150+100+80+45+30 = 405; ios-camera: 90+125+80+60+40 = 395
  assert.deepEqual(checkMatrix(matrix('gcash')), []);
  assert.match(checkMatrix(matrix('ios-camera'))[0], /scores select "gcash"/);
});

test('fe-reference gates: a tie, a changed weight, a missing source and a lone candidate all fail', () => {
  assert.match(checkMatrix(matrix('gcash', [4, 4, 4, 4, 4], [4, 4, 4, 4, 4]))[0], /tie between/);
  const reweighted = matrix('gcash');
  reweighted.criteria[4].weight = 40;
  assert.ok(checkMatrix(reweighted).some(f => f.includes('fixed at 10')));
  const unsourced = matrix('gcash');
  unsourced.candidates[0].scores.familiarity.source = '';
  assert.ok(checkMatrix(unsourced).some(f => f.includes('has no source')));
  const outOfRange = matrix('gcash');
  outOfRange.candidates[0].scores.speed.value = 9;
  assert.ok(checkMatrix(outOfRange).some(f => f.includes('whole-number score from 1 to 5')));
  const lone = matrix('gcash');
  lone.candidates.pop();
  assert.ok(checkMatrix(lone).some(f => f.includes('at least two')));
});

test('fe-reference gates: subtraction needs 20% fewer controls, or no more than the reference, and never more than before', () => {
  assert.equal(SUBTRACTION_SHARE, 0.2);
  assert.deepEqual(checkSubtraction({ before: 19, after: 15 }), [], '19 -> 15 is 21% fewer');
  assert.equal(checkSubtraction({ before: 19, after: 16 }).length, 1, '19 -> 16 is only 16% fewer');
  assert.equal(checkSubtraction({ before: 19, after: 19 }).length, 1, 'a reskin that removes nothing fails');
  assert.deepEqual(checkSubtraction({ before: 10, after: 9, reference: 9 }), [], 'already as light as the reference');
  assert.equal(checkSubtraction({ before: 10, after: 9, reference: 8 }).length, 1);
  assert.match(checkSubtraction({ before: 10, after: 11, reference: 20 })[0], /more controls than before/);
  assert.equal(checkSubtraction({ before: 10 }).length, 1);
  assert.equal(checkSubtraction({ before: 10, after: 7.5 }).length, 1);
  assert.equal(checkSubtraction({ before: 10, after: 8, reference: 'few' }).length, 1);
});

test('fe-reference gates: only measured patterns can be cited', () => {
  const library = citablePatterns(refs);
  assert.equal(library.get('cam-01').measured, true);
  assert.equal(library.get('cs-01').measured, true);
  assert.equal(library.get('cs-04').measured, false, 'no Home screenshot was supplied');
  assert.equal(library.get('fb-01').measured, false);
  assert.equal(library.get('gc-04').measured, false);

  assert.deepEqual(checkCitations('Borrow: shutter position (cam-01), swipe actions (cs-01).', refs), []);
  assert.match(checkCitations('Borrow the review screen (gc-04).', refs)[0], /gc-04: still unmeasured/);
  assert.match(checkCitations('Borrow the quick-action grid (cs-04).', refs)[0], /cs-04: still unmeasured/);
  assert.match(checkCitations('Borrow cam-99.', refs)[0], /cam-99: not in the reference library/);
  assert.match(checkCitations('Make it feel like a camera app.', refs)[0], /cites no pattern id/);
  assert.deepEqual(checkCitations('Uses utf-08 and iso-27 encodings; borrows cam-02.', refs), [], 'ids with unknown prefixes are not citations');
});

test('fe-reference library: candidates are unmeasured and say so; measured folders carry tokens and a manifest', () => {
  for (const folder of folders) {
    const md = readFileSync(join(refs, folder, 'patterns.md'), 'utf8');
    const blocks = md.split(/^### /m).slice(1);
    const hasTokens = existsSync(join(refs, folder, 'tokens.json'));
    const measured = blocks.filter(b => !/^- measured:\s*TODO/m.test(b));
    if (!hasTokens) {
      assert.equal(measured.length, 0, `${folder}: no tokens.json, so no pattern may claim a measurement`);
      assert.match(md, /Status: candidate, unmeasured/, `${folder}: must be labelled as a candidate`);
      continue;
    }
    assert.ok(existsSync(join(refs, folder, 'shots.json')), `${folder}: tokens need the manifest they were measured from`);
    assert.ok(measured.length > 0, `${folder}: tokens exist but no pattern uses them`);
    const names = new Set(read(join(refs, folder, 'tokens.json')).tokens.map(t => t.name));
    for (const block of measured) {
      const id = block.split(/\s+/)[0];
      const line = block.match(/^- measured:\s*(.*)$/m)[1];
      const cited = [...line.matchAll(/\[([a-z0-9., -]+)\]/g)].flatMap(m => m[1].split(',').map(s => s.trim()));
      assert.ok(cited.length > 0, `${folder}/${id}: a measured line must name the tokens it comes from`);
      for (const name of cited) assert.ok(names.has(name), `${folder}/${id}: token "${name}" is not in tokens.json`);
    }
  }
});

test('fe-reference library: committed tokens pass provenance and calibration, and match their manifest', () => {
  const measuredFolders = folders.filter(f => existsSync(join(refs, f, 'tokens.json')));
  assert.deepEqual(measuredFolders.sort(), ['camscanner', 'ios-camera']);
  for (const folder of measuredFolders) {
    const tokens = read(join(refs, folder, 'tokens.json'));
    const manifest = read(join(refs, folder, 'shots.json'));
    assert.deepEqual(checkTokens(tokens), [], folder);
    assert.equal(tokens.app, folder);
    assert.deepEqual(validateManifest(manifest, { project: 'kael' }), [], `${folder}: manifest is well formed`);
    const shots = new Map(manifest.shots.map(s => [s.id, s]));
    for (const token of tokens.tokens) {
      const shot = shots.get(token.measured_from.shot);
      assert.ok(shot, `${folder}/${token.name}: shot ${token.measured_from.shot} is not in the manifest`);
      assert.equal(token.measured_from.sha256, shot.sha256, `${folder}/${token.name}: hash differs from the manifest`);
      assert.ok(shot.regions.some(r => r.name === token.name), `${folder}/${token.name}: no such region in the manifest`);
      const [x, y, w, h] = token.measured_from.box, [iw, ih] = token.measured_from.image;
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= iw && y + h <= ih, `${folder}/${token.name}: box lies outside the image`);
      assert.ok(Math.abs(token.pt.w - w * tokens.viewport_pt[0] / iw) <= 0.06, `${folder}/${token.name}: points do not follow from pixels`);
    }
  }
});

test('fe-reference library: no image or personal file is committed with the measurements', () => {
  for (const folder of folders) {
    for (const name of readdirSync(join(refs, folder))) {
      assert.match(name, /^(patterns\.md|applies-to\.md|tokens\.json|shots\.json)$/, `${folder}/${name} does not belong in the reference library`);
    }
    if (!existsSync(join(refs, folder, 'shots.json'))) continue;
    for (const shot of read(join(refs, folder, 'shots.json')).shots) {
      assert.match(shot.file, /^IMG_\d+\.jpe?g$/, `${folder}: file names must be neutral camera-roll names`);
    }
  }
});

test('fe-reference gates: tokens from the product itself, uncalibrated or without provenance fail', () => {
  const good = read(join(refs, 'ios-camera/tokens.json'));
  assert.ok(checkTokens({ ...good, kind: 'own' }).some(f => f.startsWith('kind')));
  assert.ok(checkTokens({ ...good, calibration: undefined }).some(f => f.startsWith('G2')));
  assert.ok(checkTokens({ ...good, calibration: { max_error_px: 3.5 } }).some(f => f.includes('exceeds')));
  assert.ok(checkTokens({ ...good, tokens: [] }).some(f => f.startsWith('G1')));
  const noHash = structuredClone(good);
  delete noHash.tokens[0].measured_from.sha256;
  assert.ok(checkTokens(noHash).some(f => f.includes('lacks measured_from')));
  const guessedPoints = structuredClone(good);
  guessedPoints.viewport_pt = null;
  assert.ok(checkTokens(guessedPoints).some(f => f.includes('viewport is unknown')));
});

test('fe-reference gates: command line exits 0 on a passing brief and 1 on a failing one', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-gates-'));
  try {
    writeFileSync(join(dir, 'matrix.json'), JSON.stringify(matrix('gcash')));
    writeFileSync(join(dir, 'brief.md'), '## Borrow\n- one primary action in the thumb zone (cam-01)\n## Tweak\n- per-row actions (cs-01)\n');
    writeFileSync(join(dir, 'counts.json'), JSON.stringify({ before: 19, after: 14 }));
    writeFileSync(join(dir, 'reskin.json'), JSON.stringify({ before: 19, after: 19 }));
    writeFileSync(join(dir, 'candidate.md'), '- review before send (gc-04)\n');
    const run = (...args) => spawnBounded(process.execPath, [script, ...args], { cwd: dir, timeoutMs: 20_000 });
    let result = await run('--matrix', 'matrix.json', '--tokens', join(refs, 'camscanner/tokens.json'), '--brief', 'brief.md', '--counts', 'counts.json');
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.match(/^PASS /gm).length, 4);
    result = await run('--brief', 'candidate.md', '--counts', 'reskin.json');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /FAIL citations/);
    assert.match(result.stderr, /FAIL subtraction \(G3\)/);
    assert.equal((await run()).code, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

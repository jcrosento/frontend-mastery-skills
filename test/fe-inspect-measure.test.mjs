import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ringBackground, snapBox, splitRuns, toUnits } from '../skills/fe-inspect/scripts/measure-core.mjs';
import { sha256File, validateManifest } from '../skills/fe-inspect/scripts/shot-manifest.mjs';
import { TOLERANCE_PX, calibrate, measureManifest, openOfflinePage } from '../skills/fe-inspect/scripts/measure-shot.mjs';
import { checkTokens } from '../skills/fe-reference/scripts/gates.mjs';
import { spawnBounded } from '../scripts/run-bounded.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'skills/fe-inspect/scripts/measure-shot.mjs');

// A flat canvas with rectangles painted on it. Rects: [x, y, w, h, [r, g, b]].
function canvas(width, height, background, rects) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([...background, 255], i * 4);
  for (const [x, y, w, h, colour] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) rgba.set([...colour, 255], (yy * width + xx) * 4);
  }
  return rgba;
}
const DARK = [28, 28, 30];

test('fe-inspect measure: a rough search box snaps to the exact shape', () => {
  const rgba = canvas(200, 300, DARK, [[60, 100, 80, 40, [255, 255, 255]]]);
  for (const search of [[20, 60, 160, 120], [50, 95, 100, 50], [0, 0, 200, 300]]) {
    const got = snapBox(rgba, 200, 300, search);
    assert.equal(got.found, true);
    assert.deepEqual(got.box, [60, 100, 80, 40], `search ${search} must give the same box`);
    assert.deepEqual(got.clipped, []);
  }
  assert.deepEqual(ringBackground(rgba, 200, 300, [20, 60, 160, 120]), DARK);
});

test('fe-inspect measure: a shape cut by the search box is reported as clipped, and an empty area as not found', () => {
  const rgba = canvas(200, 300, DARK, [[60, 100, 80, 40, [255, 255, 255]]]);
  const cut = snapBox(rgba, 200, 300, [20, 60, 90, 120], { mode: 'brighter', threshold: 128 });
  assert.equal(cut.found, true);
  assert.deepEqual(cut.clipped, ['right']);
  assert.equal(snapBox(rgba, 200, 300, [0, 200, 200, 80]).found, false);
  assert.throws(() => snapBox(rgba, 200, 300, [500, 500, 10, 10]), /outside the 200x300 image/);
  assert.throws(() => snapBox(rgba, 200, 300, [0, 0, 100, 100], { mode: 'guess' }), /unknown mode/);
});

test('fe-inspect measure: match mode separates a cell from a neighbour of another colour', () => {
  const rgba = canvas(300, 100, DARK, [[50, 20, 60, 60, [239, 107, 107]], [110, 20, 60, 60, [61, 148, 193]]]);
  assert.deepEqual(snapBox(rgba, 300, 100, [20, 5, 260, 90]).box, [50, 20, 120, 60], 'contrast alone merges touching cells');
  assert.deepEqual(snapBox(rgba, 300, 100, [20, 5, 260, 90], { mode: 'match', sample: [80, 50], threshold: 20 }).box, [50, 20, 60, 60]);
  assert.deepEqual(snapBox(rgba, 300, 100, [20, 5, 260, 90], { mode: 'match', sample: [140, 50], threshold: 20 }).box, [110, 20, 60, 60]);
});

test('fe-inspect measure: a row splits into its items', () => {
  const chip = [72, 72, 74];
  const rgba = canvas(400, 60, DARK, [[10, 10, 90, 30, chip], [110, 10, 50, 30, chip], [170, 10, 120, 30, chip]]);
  assert.deepEqual(splitRuns(rgba, 400, 60, [0, 0, 400, 60], { threshold: 20 }), [{ start: 10, size: 90 }, { start: 110, size: 50 }, { start: 170, size: 120 }]);
  assert.deepEqual(splitRuns(rgba, 400, 60, [0, 0, 400, 60], { threshold: 20, join: 12 }), [{ start: 10, size: 280 }], 'a join wider than the gap merges the items');
});

test('fe-inspect measure: points are reported only when the viewport is known and fits the image', () => {
  const image = { width: 923, height: 2000 };
  const known = toUnits([389, 1597, 145, 145], image, [430, 932]);
  assert.equal(known.pt.w, 67.6);
  assert.equal(known.px.bottom, 258);
  assert.equal(known.ratio.w, 0.1571);
  assert.equal(toUnits([389, 1597, 145, 145], image, null).pt, null, 'unknown viewport: no points, never a guess');
  assert.throws(() => toUnits([0, 0, 10, 10], image, [430, 800]), /does not match/);
});

const manifest = (over = {}, shotOver = {}) => ({
  app: 'ios-camera', kind: 'reference', source: 'user-capture', platform: 'iOS 26 Camera', captured: '2026-11-13',
  viewport_pt: [430, 932], viewport_basis: 'iPhone 15 Pro Max, stated by the owner',
  shots: [{ id: 'cam-photo', file: 'IMG_0001.png', sha256: 'a'.repeat(64), screen: 'Photo mode viewfinder', regions: [{ name: 'shutter', search: [10, 10, 100, 100] }], ...shotOver }],
  ...over
});
const problems = (m, options = { project: 'kael' }) => validateManifest(m, options);

test('fe-inspect manifest: a labelled reference passes', () => {
  assert.deepEqual(problems(manifest()), []);
  assert.deepEqual(problems(manifest({ viewport_pt: null, viewport_basis: undefined })), [], 'an unknown device is allowed, as null');
});

test('fe-inspect manifest: unlabelled screenshots are refused', () => {
  assert.ok(problems(manifest({ app: undefined })).some(p => p.startsWith('app:')));
  for (const app of ['', 'TODO', '<folder>', '[TBD]', 'example', 'unknown']) assert.ok(problems(manifest({ app })).some(p => p.startsWith('app:')), `app "${app}" must be refused`);
  assert.ok(problems(manifest({}, { screen: 'TODO name the screen' })).some(p => p.includes('.screen')));
  assert.ok(problems(manifest({ platform: '' })).some(p => p.startsWith('platform')));
  assert.ok(problems(manifest({ source: 'web' })).some(p => p.startsWith('source')));
  assert.ok(problems(manifest({ captured: 'yesterday' })).some(p => p.startsWith('captured')));
  assert.ok(problems(manifest({ viewport_basis: 'guess' })).some(p => p.startsWith('viewport_basis')));
  assert.ok(problems(manifest({}, { sha256: 'abc' })).some(p => p.includes('.sha256')));
  assert.ok(problems(manifest({}, { regions: [] })).some(p => p.includes('.regions')));
  assert.ok(problems(manifest({ shots: [] })).some(p => p.startsWith('shots')));
});

test('fe-inspect manifest: the product being redesigned cannot be its own reference', () => {
  assert.ok(problems(manifest({ kind: 'own' })).some(p => p.startsWith('kind')));
  assert.ok(problems(manifest({ kind: 'baseline' })).some(p => p.startsWith('kind')));
  for (const app of ['kael', 'Kael', 'kael-home', 'KAEL mobile']) assert.ok(problems(manifest({ app })).some(p => p.includes('cannot be its own reference')), `app "${app}"`);
  assert.ok(problems(manifest(), {}).some(p => p.startsWith('--project is required')), 'the product must be named so it can be refused');
});

test('fe-inspect manifest: a swapped or missing screenshot is refused', () => {
  const same = { project: 'kael', hashOf: () => 'a'.repeat(64) };
  assert.deepEqual(problems(manifest(), same), []);
  assert.ok(problems(manifest(), { project: 'kael', hashOf: () => 'b'.repeat(64) }).some(p => p.includes('replaced after it was labelled')));
  assert.ok(problems(manifest(), { project: 'kael', hashOf: () => null }).some(p => p.includes('not found')));
});

test('fe-inspect measure: calibration reproduces known geometry within tolerance after downscale and JPEG', { timeout: 90_000 }, async () => {
  const { browser, page } = await openOfflinePage();
  try {
    const result = await calibrate(page);
    assert.equal(result.pass, true, JSON.stringify(result.cases));
    assert.equal(TOLERANCE_PX, 2);
    assert.ok(result.max_error_px <= TOLERANCE_PX);
    assert.deepEqual(result.cases.map(c => c.id), ['png-native', 'jpeg-native', 'jpeg-downscaled']);
    assert.equal(result.cases[0].max_error_px, 0, 'a lossless image is measured exactly');
    assert.deepEqual(result.cases[2].image, [923, 2000], 'calibrated at the size of a phone upload');
    assert.ok(result.cases.every(c => c.shapes.length >= 4));
  } finally {
    await browser.close();
  }
});

// A screen drawn in HTML at known CSS positions, captured at 2x. Truth is known exactly.
const SCREEN = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; background: #1c1c1e; width: 390px; height: 844px; position: relative; overflow: hidden; }
  div { position: absolute; }
  #shutter { left: 160px; top: 700px; width: 70px; height: 70px; border-radius: 50%; background: #fff; }
  #pill { left: 120px; top: 790px; width: 150px; height: 44px; border-radius: 22px; background: #3a3a3c; }
  .chip { top: 120px; height: 24px; border-radius: 6px; background: #48484a; }
  #c1 { left: 16px; width: 100px; } #c2 { left: 124px; width: 60px; } #c3 { left: 192px; width: 80px; }
  #red { left: 200px; top: 400px; width: 64px; height: 80px; background: #ef6b6b; }
  #blue { left: 264px; top: 400px; width: 64px; height: 80px; background: #3d94c1; }
</style><div id="shutter"></div><div id="pill"></div><div id="c1" class="chip"></div><div id="c2" class="chip"></div><div id="c3" class="chip"></div><div id="red"></div><div id="blue"></div>`;

async function capture(dir, name, type) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(SCREEN);
    await page.screenshot({ path: join(dir, name), type, ...(type === 'jpeg' ? { quality: 80 } : {}) });
  } finally {
    await browser.close();
  }
}

const regions = [
  { name: 'shutter', search: [260, 1340, 260, 260], mode: 'brighter', threshold: 200 },
  { name: 'pill', search: [200, 1560, 380, 120], threshold: 14 },
  { name: 'chips', search: [10, 220, 600, 90], threshold: 20, split: 'x', join: 4 },
  { name: 'cell.red', search: [360, 770, 330, 220], mode: 'match', sample: [460, 880], threshold: 25 }
];
const truth = { shutter: [320, 1400, 140, 140], pill: [240, 1580, 300, 88], chips: [32, 240, 512, 48], 'cell.red': [400, 800, 128, 160] };

test('fe-inspect measure: end to end on a screenshot with known geometry', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-measure-'));
  try {
    for (const [file, type, slack] of [['IMG_0001.png', 'png', 0], ['IMG_0002.jpeg', 'jpeg', TOLERANCE_PX]]) {
      await capture(dir, file, type);
      const doc = {
        app: 'fixture-camera', kind: 'reference', source: 'user-capture', platform: 'Synthetic test screen', captured: '2026-11-13',
        viewport_pt: [390, 844], viewport_basis: 'Rendered by the test at 390x844 CSS px, 2x',
        shots: [{ id: 'screen', file, sha256: sha256File(join(dir, file)), screen: 'Synthetic capture screen', regions }]
      };
      writeFileSync(join(dir, 'shots.json'), JSON.stringify(doc));
      const result = await measureManifest(join(dir, 'shots.json'), { project: 'kael', out: join(dir, type), withOverlay: true });
      assert.equal(result.ok, true, JSON.stringify(result.problems));
      const tokens = JSON.parse(readFileSync(result.target, 'utf8'));
      assert.deepEqual(checkTokens(tokens), [], 'output passes the fe-reference provenance gate');
      for (const token of tokens.tokens) {
        const expected = truth[token.name];
        token.measured_from.box.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) <= slack, `${type} ${token.name}: got ${token.measured_from.box}, expected ${expected} within ${slack}px`));
        assert.equal(token.measured_from.sha256, doc.shots[0].sha256);
        assert.equal(token.pt.px_per_pt, 2);
      }
      const shutter = tokens.tokens.find(t => t.name === 'shutter');
      assert.ok(Math.abs(shutter.pt.w - 70) <= slack / 2 && Math.abs(shutter.pt.bottom - 74) <= slack / 2, 'points match the CSS size');
      const chips = tokens.tokens.find(t => t.name === 'chips').items;
      assert.equal(chips.length, 3);
      [[32, 200], [248, 120], [384, 160]].forEach(([start, size], i) => {
        assert.ok(Math.abs(chips[i].start_px - start) <= slack && Math.abs(chips[i].size_px - size) <= slack, `${type} chip ${i}: ${JSON.stringify(chips[i])}`);
      });
      assert.ok(existsSync(join(dir, type, 'screen.overlay.png')), 'overlay written for visual confirmation');

      // Same input, same output: the measurement is deterministic.
      const again = await measureManifest(join(dir, 'shots.json'), { project: 'kael', out: join(dir, `${type}-again`) });
      assert.deepEqual(JSON.parse(readFileSync(again.target, 'utf8')).tokens, tokens.tokens);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fe-inspect measure: refusals write no tokens', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-refuse-'));
  try {
    await capture(dir, 'IMG_0001.png', 'png');
    const hash = sha256File(join(dir, 'IMG_0001.png'));
    const make = (over = {}, region = regions[0], sha256 = hash) => {
      writeFileSync(join(dir, 'shots.json'), JSON.stringify({
        app: 'fixture-camera', kind: 'reference', source: 'user-capture', platform: 'Synthetic test screen', captured: '2026-11-13', viewport_pt: null,
        shots: [{ id: 'screen', file: 'IMG_0001.png', sha256, screen: 'Synthetic capture screen', regions: [region] }], ...over
      }));
      return join(dir, 'shots.json');
    };
    const out = join(dir, 'out');
    const refused = async (path, project, pattern) => {
      const result = await measureManifest(path, { project, out });
      assert.equal(result.ok, false);
      assert.match(result.problems.join('\n'), pattern);
      assert.equal(existsSync(join(out, 'tokens.json')), false, 'no tokens may be written on refusal');
    };
    await refused(make({ kind: 'own' }), 'kael', /kind: must be "reference"/);
    await refused(make({ app: 'kael' }), 'kael', /cannot be its own reference/);
    await refused(make(), undefined, /--project is required/);
    await refused(make({ app: 'TODO' }), 'kael', /app: name the reference app/);
    await refused(make({}, regions[0], 'f'.repeat(64)), 'kael', /replaced after it was labelled/);
    await refused(make({}, { name: 'shutter', search: [260, 1340, 140, 260], mode: 'brighter', threshold: 200 }), 'kael', /touches the right edge/);
    await refused(make({}, { name: 'nothing', search: [20, 1000, 300, 200] }), 'kael', /screen\/nothing/);

    const cli = await spawnBounded(process.execPath, [script, '--manifest', make({ kind: 'own' }), '--project', 'kael', '--out', out], { cwd: dir, timeoutMs: 30_000 });
    assert.equal(cli.code, 1);
    assert.match(cli.stderr, /REFUSED: 1 problem\(s\)\. No tokens were written\./);
    const hashed = await spawnBounded(process.execPath, [script, '--hash', join(dir, 'IMG_0001.png')], { cwd: dir, timeoutMs: 30_000 });
    assert.equal(hashed.stdout.trim(), hash);

    // With the device unknown, a valid run reports ratios and no points.
    const ok = await measureManifest(make(), { project: 'kael', out });
    assert.equal(ok.ok, true, JSON.stringify(ok.problems));
    const tokens = JSON.parse(readFileSync(ok.target, 'utf8'));
    assert.equal(tokens.tokens[0].pt, null);
    assert.equal(tokens.tokens[0].ratio.w, 0.1795);
    assert.deepEqual(checkTokens(tokens), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

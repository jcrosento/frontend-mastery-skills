import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STABILITY, checkStability, cornerKind, deviceCandidates, measureRegion, ringBackground, snapBox, splitRuns, thresholdStep, toUnits } from '../skills/fe-inspect/scripts/measure-core.mjs';
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

// A filled rounded rectangle, drawn exactly: a pixel is inside when its centre is.
function roundRect(rgba, width, [x, y, w, h], r, colour) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const cx = Math.min(Math.max(xx + 0.5, x + r), x + w - r), cy = Math.min(Math.max(yy + 0.5, y + r), y + h - r);
    if (Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) <= r) rgba.set([...colour, 255], (yy * width + xx) * 4);
  }
}

test('fe-inspect measure: corner radius is fitted for filled shapes and named', () => {
  const white = [255, 255, 255];
  for (const [box, radius, kind] of [[[40, 40, 200, 120], 0, 'square'], [[40, 40, 200, 120], 12, 'rounded'], [[40, 40, 200, 120], 40, 'rounded'], [[40, 40, 240, 80], 40, 'capsule'], [[40, 40, 140, 140], 70, 'circle']]) {
    const rgba = canvas(320, 220, DARK, []);
    roundRect(rgba, 320, box, radius, white);
    const got = snapBox(rgba, 320, 220, [10, 10, 300, 200]);
    assert.deepEqual(got.box, box);
    assert.ok(Math.abs(got.radius - radius) <= 1, `radius ${radius}: measured ${got.radius}`);
    assert.equal(cornerKind(got.box, got.radius), kind, `radius ${radius} on ${box[2]}x${box[3]}`);
  }
  // An outline or text is not a filled shape: no radius is claimed for it.
  const ring = canvas(200, 200, DARK, [[40, 40, 120, 120, white], [46, 46, 108, 108, DARK]]);
  const outline = snapBox(ring, 200, 200, [10, 10, 180, 180]);
  assert.deepEqual(outline.box, [40, 40, 120, 120]);
  assert.equal(outline.radius, null);
  assert.equal(cornerKind(outline.box, outline.radius), null);
  const units = toUnits([40, 40, 240, 80], { width: 923, height: 2000 }, [430, 932], 40);
  assert.equal(units.px.radius, 40);
  assert.equal(units.pt.radius, 18.6);
  assert.equal('radius' in toUnits([40, 40, 240, 80], { width: 923, height: 2000 }, [430, 932]).px, false);
});

test('fe-inspect measure: "largest" keeps one shape when something else in the search area matches', () => {
  const white = [255, 255, 255];
  const rgba = canvas(400, 200, DARK, [[60, 60, 120, 60, white], [260, 70, 20, 20, white]]);
  const search = [20, 20, 360, 160];
  assert.deepEqual(snapBox(rgba, 400, 200, search).box, [60, 60, 220, 60], 'the default boxes everything that matched');
  const one = snapBox(rgba, 400, 200, search, { pick: 'largest' });
  assert.deepEqual(one.box, [60, 60, 120, 60]);
  assert.equal(one.components, 2);
  assert.equal(one.fill, 1);
  assert.throws(() => snapBox(rgba, 400, 200, search, { pick: 'biggest' }), /unknown pick/);
});

test('fe-inspect measure: a result that changes when the search box moves is not stable', () => {
  const white = [255, 255, 255];
  assert.deepEqual(STABILITY, { shifts: [6, 12], grows: [8, 16], thresholdShare: 0.15, thresholdMin: 2, thresholdMax: 12 });
  assert.deepEqual([4, 14, 40, 200].map(thresholdStep), [2, 2, 6, 12]);

  // One clean shape with margin: all 20 perturbed runs return the same box.
  const clean = canvas(400, 300, DARK, [[120, 100, 160, 80, white]]);
  const region = { name: 'card', search: [80, 60, 240, 160] };
  const base = measureRegion(clean, 400, 300, region).snapped.box;
  const steady = checkStability(clean, 400, 300, region, base, 2);
  assert.deepEqual({ variants: steady.variants, agreed: steady.agreed, refused: steady.refused, disagreed: steady.disagreed.length, stable: steady.stable }, { variants: 20, agreed: 20, refused: 0, disagreed: 0, stable: true });

  // A small second shape just outside the search box: a grown box swallows it whole, so the size changes
  // with no clipping warning. (A shape only partly swallowed is cut off, which is already refused.)
  const crowded = canvas(400, 300, DARK, [[120, 100, 160, 80, white], [120, 224, 160, 8, white]]);
  const tight = { name: 'card', search: [80, 60, 240, 160] };
  const first = measureRegion(crowded, 400, 300, tight).snapped;
  assert.deepEqual(first.box, [120, 100, 160, 80]);
  assert.deepEqual(first.clipped, [], 'the first measurement looks fine on its own');
  const shaky = checkStability(crowded, 400, 300, tight, first.box, 2);
  assert.equal(shaky.stable, false);
  assert.ok(shaky.disagreed.some(d => d.variant === 'search grown by 16 px' && d.box[3] === 132), JSON.stringify(shaky.disagreed));
  // "largest" settles it: the neighbour is a separate shape.
  const picked = { ...tight, pick: 'largest' };
  assert.equal(checkStability(crowded, 400, 300, picked, measureRegion(crowded, 400, 300, picked).snapped.box, 2).stable, true);

  // A threshold sitting on a cliff: a faint halo joins the shape when the threshold drops.
  const halo = canvas(400, 300, DARK, [[100, 90, 200, 100, [60, 60, 62]], [120, 100, 160, 80, white]]);
  const cliff = { name: 'card', search: [60, 50, 280, 180], threshold: 33 };
  const inner = measureRegion(halo, 400, 300, cliff).snapped.box;
  assert.deepEqual(inner, [120, 100, 160, 80]);
  const onCliff = checkStability(halo, 400, 300, cliff, inner, 2);
  assert.equal(onCliff.stable, false);
  assert.deepEqual(onCliff.disagreed.map(d => d.variant), ['threshold 28']);
  const safe = { ...cliff, threshold: 120 };
  assert.equal(checkStability(halo, 400, 300, safe, measureRegion(halo, 400, 300, safe).snapped.box, 2).stable, true);

  // Hemmed in: another surface sits 4 px away on every side, so every moved or grown box is cut off
  // and nothing confirms the result.
  const framed = canvas(400, 300, DARK, [[76, 56, 248, 168, white], [116, 96, 168, 88, DARK], [120, 100, 160, 80, white]]);
  const snug = { name: 'card', search: [118, 98, 164, 84], mode: 'brighter', threshold: 128 };
  assert.deepEqual(measureRegion(framed, 400, 300, snug).snapped.box, [120, 100, 160, 80]);
  const unconfirmed = checkStability(framed, 400, 300, snug, [120, 100, 160, 80], 2);
  assert.equal(unconfirmed.disagreed.length, 0);
  assert.equal(unconfirmed.agreed_geometric, 0);
  assert.equal(unconfirmed.refused, 18);
  assert.equal(unconfirmed.stable, false, 'a result nothing could confirm does not count as stable');
});

test('fe-inspect measure: the device is only settled by an untouched screenshot', () => {
  const sizes = (w, h) => deviceCandidates(w, h).map(c => c.pt.join('x'));
  assert.deepEqual(sizes(1290, 2796), ['430x932']);
  assert.equal(deviceCandidates(1290, 2796)[0].native, true);
  assert.deepEqual(sizes(1179, 2556), ['393x852']);
  assert.deepEqual(sizes(750, 1334), ['375x667']);
  // The uploads in the reference library: resized, so several iPhones fit and the owner has to say which.
  const resized = deviceCandidates(923, 2000);
  assert.deepEqual(resized.map(c => c.pt.join('x')).sort(), ['375x812', '393x852', '430x932']);
  assert.ok(resized.every(c => c.native === false));
  assert.equal(resized.find(c => c.pt[0] === 430).px_per_pt, 2.147);
  assert.deepEqual(sizes(1080, 2400), [], 'an Android screen is not matched to an iPhone');
  assert.deepEqual(sizes(1000, 1000), []);
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
  const picked = (pick) => manifest({}, { regions: [{ name: 'shutter', search: [10, 10, 100, 100], pick }] });
  assert.deepEqual(problems(picked('largest')), []);
  assert.deepEqual(problems(picked('all')), []);
  assert.ok(problems(picked('biggest')).some(p => p.includes('pick')));
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
    assert.deepEqual(result.cases.map(c => c.id), ['png-native', 'jpeg-native', 'jpeg-downscaled', 'android-1080-jpeg', 'light-393-downscaled']);
    assert.equal(result.cases[0].max_error_px, 0, 'a lossless image is measured exactly');
    assert.deepEqual(result.cases[2].image, [923, 2000], 'calibrated at the size of a phone upload');
    assert.deepEqual(result.cases[3].image, [1080, 2400], 'calibrated on an Android-sized screen');
    assert.ok(result.max_radius_error_px <= TOLERANCE_PX, 'corner radii are calibrated too');
    for (const c of result.cases) {
      assert.deepEqual(c.shapes.map(s => s.name), ['pill', 'circle', 'chip', 'chip.largest', 'card', 'cell.match']);
      const by = Object.fromEntries(c.shapes.map(s => [s.name, s]));
      assert.deepEqual(by['chip.largest'].measured, by.chip.measured, `${c.id}: "largest" ignores the speck beside the chip`);
      assert.ok(by.card.radius_measured <= 1.5, `${c.id}: a square card reports no rounding`);
      assert.ok(Math.abs(by.pill.radius_measured - by.pill.radius_expected) <= TOLERANCE_PX, `${c.id}: capsule radius`);
      assert.equal(by['cell.match'].radius_measured, null, `${c.id}: match mode reports no radius`);
    }
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
  /* A speck beside the shutter, and a card with a wide frame 2px away on every side: used by the stability refusals. */
  #speck { left: 118px; top: 730px; width: 4px; height: 4px; background: #fff; }
  #frame { left: 4px; top: 500px; width: 132px; height: 100px; background: #fff; }
  #moat { left: 26px; top: 526px; width: 88px; height: 48px; background: #1c1c1e; }
  #hemmed { left: 28px; top: 528px; width: 84px; height: 44px; background: #fff; }
</style><div id="speck"></div><div id="frame"></div><div id="moat"></div><div id="hemmed"></div><div id="shutter"></div><div id="pill"></div><div id="c1" class="chip"></div><div id="c2" class="chip"></div><div id="c3" class="chip"></div><div id="red"></div><div id="blue"></div>`;

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
        assert.equal(token.stability.variants, 20, `${token.name}: re-measured under every perturbation`);
        assert.ok(token.stability.agreed_moved_or_grown >= 1 && token.stability.max_delta_px <= TOLERANCE_PX);
      }
      // Corner radii match the CSS: a 70px circle, a 22px capsule, 6px chips; none claimed in match mode.
      const named = Object.fromEntries(tokens.tokens.map(t => [t.name, t]));
      assert.deepEqual([named.shutter.corner, named.pill.corner, named.chips.corner, named['cell.red'].corner], ['circle', 'capsule', 'rounded', null]);
      for (const [name, css] of [['shutter', 35], ['pill', 22], ['chips', 6]]) assert.ok(Math.abs(named[name].pt.radius - css) <= 1, `${type} ${name}: radius ${named[name].pt.radius} pt, CSS says ${css}`);
      assert.equal('radius' in named['cell.red'].px, false);
      assert.ok(tokens.calibration.max_radius_error_px <= TOLERANCE_PX);
      assert.deepEqual(tokens.stability.shifts, [6, 12]);
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
    await refused(make({}, { name: 'nothing', search: [20, 1220, 300, 100] }), 'kael', /screen\/nothing/);
    // The first measurement of each of these looks fine; only re-measuring shows it cannot be trusted.
    const beside = { name: 'shutter', search: [250, 1340, 270, 260], mode: 'brighter', threshold: 200 };
    await refused(make({}, beside), 'kael', /screen\/shutter: not stable\. Measured 140x140 at 320,1400, but search grown by 16 px -> 224x140 at 236,1400.*"pick": "largest"/);
    await refused(make({}, { name: 'hemmed', search: [54, 1054, 172, 92], mode: 'brighter', threshold: 128 }), 'kael', /screen\/hemmed: could not be confirmed/);
    await refused(make({}, { ...beside, pick: 'biggest' }), 'kael', /pick/);

    const cli = await spawnBounded(process.execPath, [script, '--manifest', make({ kind: 'own' }), '--project', 'kael', '--out', out], { cwd: dir, timeoutMs: 30_000 });
    assert.equal(cli.code, 1);
    assert.match(cli.stderr, /REFUSED: 1 problem\(s\)\. No tokens were written\./);
    const hashed = await spawnBounded(process.execPath, [script, '--hash', join(dir, 'IMG_0001.png')], { cwd: dir, timeoutMs: 30_000 });
    assert.equal(hashed.stdout.trim(), hash);

    // "largest" is the fix the message names: the speck is a separate shape.
    const fixed = await measureManifest(make({}, { ...beside, pick: 'largest' }), { project: 'kael', out: join(dir, 'fixed') });
    assert.equal(fixed.ok, true, JSON.stringify(fixed.problems));
    const fixedToken = JSON.parse(readFileSync(fixed.target, 'utf8')).tokens[0];
    assert.deepEqual(fixedToken.measured_from.box, [320, 1400, 140, 140]);
    assert.equal(fixedToken.method.pick, 'largest');

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

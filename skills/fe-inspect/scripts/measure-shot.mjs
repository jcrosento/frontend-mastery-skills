#!/usr/bin/env node
// Measure layout geometry in labelled reference screenshots.
//
//   node measure-shot.mjs --hash <file>
//   node measure-shot.mjs --device <file>                 which logical screens fit this screenshot
//   node measure-shot.mjs --grid <file> [--step 100]      numbered pixel grid, to read search boxes from
//   node measure-shot.mjs --calibrate
//   node measure-shot.mjs --manifest <shots.json> --project <product-being-redesigned> [--out <dir>] [--overlay]
//
// The manifest names the reference app, where the screenshots came from, and a rough
// search box per element. Pixels decide the final box, and the box only counts if it
// comes back unchanged when the search box is moved or grown and the threshold nudged.
// Nothing is fetched: images are
// decoded in an offline Chromium page and every network request is aborted.
// Colours, icons and copy are never recorded.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STABILITY, checkStability, cornerKind, deviceCandidates, measureRegion, snapBox, splitRuns, toUnits } from './measure-core.mjs';
import { sha256File, validateManifest } from './shot-manifest.mjs';

export const TOLERANCE_PX = 2;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export async function openOfflinePage() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  await page.setContent('<!doctype html><title>measure</title>');
  return { browser, page };
}

// Decode image bytes to RGBA without colour conversion.
export async function decode(page, bytes, mime) {
  const result = await page.evaluate(async ({ b64, mime }) => {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw], { type: mime }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let binary = '';
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
    return { width: bitmap.width, height: bitmap.height, b64: btoa(binary) };
  }, { b64: Buffer.from(bytes).toString('base64'), mime });
  return { width: result.width, height: result.height, rgba: Buffer.from(result.b64, 'base64') };
}

// Synthetic screenshots with shapes at known coordinates, drawn at a phone's native size
// and then resized and compressed the way a phone upload is, so the measurer is tested
// on the same kind of image it is used on. Coordinates are for a 1290 px wide screen and
// are scaled to each profile.
const BASE_WIDTH = 1290;
const THEMES = {
  dark: { background: '#1c1c1e', pill: '#3a3a3c', circle: '#ffffff', chip: '#48484a', low: 14 },
  // Light screens are harder: a white card on iOS grey differs by 13 levels.
  light: { background: '#f2f2f7', pill: '#ffffff', circle: '#1c1c1e', chip: '#e5e5ea', low: 6 }
};
const PROFILES = [
  { id: 'png-native', draw: [1290, 2796], out: [1290, 2796], type: 'image/png', theme: 'dark' },
  { id: 'jpeg-native', draw: [1290, 2796], out: [1290, 2796], type: 'image/jpeg', theme: 'dark' },
  { id: 'jpeg-downscaled', draw: [1290, 2796], out: [923, 2000], type: 'image/jpeg', theme: 'dark' },
  { id: 'android-1080-jpeg', draw: [1080, 2400], out: [1080, 2400], type: 'image/jpeg', theme: 'dark' },
  { id: 'light-393-downscaled', draw: [1179, 2556], out: [923, 2001], type: 'image/jpeg', theme: 'light' }
];
const SHAPES = [
  // Low-contrast surface, measured with a lowered threshold.
  { name: 'pill', kind: 'rect', box: [300, 2100, 690, 136], radius: 68, fill: 'pill', search: [180, 2040, 930, 256], low: true },
  { name: 'circle', kind: 'circle', box: [528, 1776, 234, 234], radius: 117, fill: 'circle', search: [430, 1680, 430, 430] },
  { name: 'chip', kind: 'rect', box: [80, 880, 262, 62], radius: 10, fill: 'chip', search: [40, 840, 342, 142], low: true },
  // A speck of the same colour next to the chip. `pick: "largest"` must ignore it.
  { name: 'speck', kind: 'rect', box: [420, 896, 26, 26], radius: 0, fill: 'chip', drawOnly: true },
  { name: 'chip.largest', kind: 'none', box: [80, 880, 262, 62], radius: 10, search: [40, 840, 460, 142], low: true, pick: 'largest' },
  // A square-cornered card, so a radius of zero is proven as well as a large one.
  { name: 'card', kind: 'rect', box: [80, 1060, 300, 200], radius: 0, fill: 'chip', search: [40, 1020, 380, 280], low: true },
  // Two cells flush against each other in different colours, drawn only. `contrast` would
  // merge them, so the first cell is measured with `match`.
  { name: 'cell', kind: 'rect', box: [522, 1352, 192, 240], radius: 0, fill: '#ef6b6b', drawOnly: true },
  { name: 'neighbour', kind: 'rect', box: [714, 1352, 192, 240], radius: 0, fill: '#3d94c1', drawOnly: true },
  { name: 'cell.match', kind: 'none', box: [522, 1352, 192, 240], radius: 0, search: [440, 1300, 500, 344], mode: 'match', sample: [618, 1472], threshold: 45 }
];

export async function calibrate(page) {
  const cases = [];
  for (const profile of PROFILES) {
    const theme = THEMES[profile.theme];
    const k = profile.draw[0] / BASE_WIDTH;
    const shapes = SHAPES.map(s => ({
      ...s,
      box: s.box.map(n => Math.round(n * k)),
      radius: Math.round(s.radius * k),
      search: s.search?.map(n => Math.round(n * k)),
      sample: s.sample?.map(n => Math.round(n * k)),
      color: theme[s.fill] ?? s.fill
    }));
    const b64 = await page.evaluate(async ({ profile, shapes, background }) => {
      const big = new OffscreenCanvas(profile.draw[0], profile.draw[1]);
      const ctx = big.getContext('2d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, profile.draw[0], profile.draw[1]);
      for (const s of shapes) {
        if (s.kind === 'none') continue;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        if (s.kind === 'circle') ctx.arc(s.box[0] + s.box[2] / 2, s.box[1] + s.box[3] / 2, s.box[2] / 2, 0, Math.PI * 2);
        else ctx.roundRect(s.box[0], s.box[1], s.box[2], s.box[3], s.radius);
        ctx.fill();
      }
      let canvas = big;
      if (profile.out[0] !== profile.draw[0]) {
        canvas = new OffscreenCanvas(profile.out[0], profile.out[1]);
        const sctx = canvas.getContext('2d');
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(big, 0, 0, profile.out[0], profile.out[1]);
      }
      const buffer = new Uint8Array(await (await canvas.convertToBlob({ type: profile.type, quality: 0.8 })).arrayBuffer());
      let binary = '';
      for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode.apply(null, buffer.subarray(i, i + 0x8000));
      return btoa(binary);
    }, { profile, shapes, background: theme.background });

    const image = await decode(page, Buffer.from(b64, 'base64'), profile.type);
    const sx = image.width / profile.draw[0], sy = image.height / profile.draw[1];
    const scale = (list) => list.map((n, i) => n * (i % 2 === 0 ? sx : sy));
    let worst = 0, worstRadius = 0;
    const results = shapes.filter(s => !s.drawOnly).map(s => {
      const expected = scale(s.box);
      const got = snapBox(image.rgba, image.width, image.height, scale(s.search), {
        threshold: s.threshold ?? (s.low ? theme.low : undefined), mode: s.mode, pick: s.pick,
        sample: s.sample ? scale(s.sample).map(Math.round) : undefined
      });
      // A shape that is not found counts as a full-image error so it can never pass.
      const error = got.found ? Math.max(...got.box.map((n, i) => Math.abs(n - expected[i]))) : image.height;
      // `match` mode reports no radius, so there is nothing to check for it.
      const radiusError = !got.found ? image.height : s.mode === 'match' ? (got.radius === null ? 0 : image.height) : got.radius === null ? image.height : Math.abs(got.radius - s.radius * sx);
      worst = Math.max(worst, error);
      worstRadius = Math.max(worstRadius, radiusError);
      return { name: s.name, expected: expected.map(n => Number(n.toFixed(2))), measured: got.box ?? null, error_px: Number(error.toFixed(2)), radius_expected: Number((s.radius * sx).toFixed(2)), radius_measured: got.radius ?? null, radius_error_px: Number(radiusError.toFixed(2)) };
    });
    cases.push({ id: profile.id, image: [image.width, image.height], max_error_px: Number(worst.toFixed(2)), max_radius_error_px: Number(worstRadius.toFixed(2)), shapes: results });
  }
  const max = Math.max(...cases.map(c => c.max_error_px));
  const maxRadius = Math.max(...cases.map(c => c.max_radius_error_px));
  return { tolerance_px: TOLERANCE_PX, max_error_px: max, max_radius_error_px: maxRadius, pass: max <= TOLERANCE_PX && maxRadius <= TOLERANCE_PX, cases };
}

async function overlay(page, bytes, mime, marks) {
  const b64 = await page.evaluate(async ({ b64, mime, marks }) => {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw], { type: mime }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    ctx.font = '600 15px sans-serif';
    ctx.lineWidth = 2;
    for (const m of marks) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
      ctx.strokeRect(m.search[0] + 1, m.search[1] + 1, m.search[2] - 2, m.search[3] - 2);
      if (!m.box) continue;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ff2d95';
      // Drawn with the fitted corner radius, so a wrong radius is as visible as a wrong box.
      ctx.beginPath();
      ctx.roundRect(m.box[0] - 1, m.box[1] - 1, m.box[2] + 2, m.box[3] + 2, m.radius ? m.radius + 1 : 0);
      ctx.stroke();
      const label = `${m.name} ${m.box[2]}x${m.box[3]}${m.radius === null || m.radius === undefined ? '' : ` r${m.radius}`}`;
      const width = ctx.measureText(label).width + 8;
      const ly = m.box[1] - 22 < 0 ? m.box[1] + m.box[3] + 4 : m.box[1] - 22;
      ctx.fillStyle = '#ff2d95';
      ctx.fillRect(m.box[0], ly, width, 19);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, m.box[0] + 4, ly + 14);
    }
    const buffer = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode.apply(null, buffer.subarray(i, i + 0x8000));
    return btoa(binary);
  }, { b64: Buffer.from(bytes).toString('base64'), mime, marks });
  return Buffer.from(b64, 'base64');
}

// The screenshot with a numbered pixel grid drawn over it. Search boxes are read off
// this image instead of being guessed from the bare screenshot.
async function gridImage(page, bytes, mime, step) {
  const b64 = await page.evaluate(async ({ b64, mime, step }) => {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw], { type: mime }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    ctx.font = '600 13px sans-serif';
    const half = step / 2;
    const line = (x0, y0, x1, y1, major) => {
      ctx.strokeStyle = major ? 'rgba(255, 45, 149, 0.85)' : 'rgba(0, 200, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 + 0.5, y0 + 0.5); ctx.lineTo(x1 + 0.5, y1 + 0.5); ctx.stroke();
    };
    const tag = (text, x, y) => {
      const width = ctx.measureText(text).width + 6;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; ctx.fillRect(x, y, width, 16);
      ctx.fillStyle = '#fff'; ctx.fillText(text, x + 3, y + 12);
    };
    for (let x = 0; x < bitmap.width; x += half) line(x, 0, x, bitmap.height, x % step === 0);
    for (let y = 0; y < bitmap.height; y += half) line(0, y, bitmap.width, y, y % step === 0);
    // Labels repeat every four numbered lines so one is always near the element being read.
    const band = step * 4;
    for (let x = 0; x < bitmap.width; x += step) {
      for (let y = 0; y < bitmap.height; y += step) {
        const onRow = y % band === 0, onColumn = x % band === 0;
        if (onRow && onColumn) tag(`${x},${y}`, x + 2, y + 2);
        else if (onRow) tag(`x${x}`, x + 2, y + 2);
        else if (onColumn) tag(`y${y}`, x + 2, y + 2);
      }
    }
    const buffer = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode.apply(null, buffer.subarray(i, i + 0x8000));
    return btoa(binary);
  }, { b64: Buffer.from(bytes).toString('base64'), mime, step });
  return Buffer.from(b64, 'base64');
}

// Pretty JSON with short number lists kept on one line, so a token reads as one block.
export function compactJson(value) {
  return JSON.stringify(value, null, 2).replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_, body) => `[${body.replace(/\s+/g, ' ')}]`) + '\n';
}

export async function measureManifest(manifestPath, { project, out, withOverlay = false } = {}) {
  const base = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const hashOf = (file) => { const p = resolve(base, file); return existsSync(p) ? sha256File(p) : null; };
  const problems = validateManifest(manifest, { project, hashOf });
  if (problems.length) return { ok: false, problems };

  const outDir = resolve(out || base);
  mkdirSync(outDir, { recursive: true });
  const { browser, page } = await openOfflinePage();
  try {
    const calibration = await calibrate(page);
    if (!calibration.pass) return { ok: false, problems: [`calibration failed: ${calibration.max_error_px}px error exceeds ${TOLERANCE_PX}px; no measurement was written`] };
    const tokens = [], failures = [];
    for (const shot of manifest.shots) {
      const file = resolve(base, shot.file);
      const mime = MIME[extname(file).toLowerCase()];
      if (!mime) { failures.push(`${shot.id}: unsupported image type ${extname(file)}`); continue; }
      const bytes = readFileSync(file);
      const image = await decode(page, bytes, mime);
      const marks = [];
      for (const region of shot.regions) {
        // The background and sample point are fixed from the search box, so that splitting
        // the snapped box later compares against the same reference colour.
        const { options, snapped } = measureRegion(image.rgba, image.width, image.height, region);
        marks.push({ name: region.name, search: region.search, box: snapped.box, radius: snapped.radius });
        if (!snapped.found) { failures.push(`${shot.id}/${region.name}: ${snapped.reason}`); continue; }
        if (snapped.clipped.length && !region.allow_clip) { failures.push(`${shot.id}/${region.name}: box touches the ${snapped.clipped.join(' and ')} edge of its search area; widen "search" or set "allow_clip": true with a reason`); continue; }
        // A clipped box follows its search area by definition, so it cannot be re-tested.
        const stability = region.allow_clip ? null : checkStability(image.rgba, image.width, image.height, region, snapped.box, TOLERANCE_PX);
        if (stability && stability.disagreed.length) {
          const seen = stability.disagreed.slice(0, 3).map(d => `${d.variant} -> ${d.box[2]}x${d.box[3]} at ${d.box[0]},${d.box[1]}`).join('; ');
          failures.push(`${shot.id}/${region.name}: not stable. Measured ${snapped.box[2]}x${snapped.box[3]} at ${snapped.box[0]},${snapped.box[1]}, but ${seen}. If something else in the search area matches, tighten "search" or set "pick": "largest"; if the threshold decides the result, move it to the middle of the range that gives one answer`);
          continue;
        }
        if (stability && !stability.stable) { failures.push(`${shot.id}/${region.name}: could not be confirmed. Every moved or grown search box was cut off; leave about 20 px of margin around the element in "search"`); continue; }
        const token = {
          name: region.name,
          measured_from: { shot: shot.id, sha256: shot.sha256, screen: shot.screen, box: snapped.box, image: [image.width, image.height] },
          method: { mode: options.mode, threshold: options.threshold, search: region.search, ...(region.pick ? { pick: region.pick } : {}), ...(region.sample ? { sample: region.sample } : {}), ...(region.background ? { background: region.background } : {}) },
          stability: stability ? { variants: stability.variants, agreed: stability.agreed, agreed_moved_or_grown: stability.agreed_geometric, refused: stability.refused, max_delta_px: stability.max_delta_px } : { skipped: 'allow_clip' },
          fill: snapped.fill,
          corner: cornerKind(snapped.box, snapped.radius),
          ...toUnits(snapped.box, image, manifest.viewport_pt, snapped.radius)
        };
        if (region.split) {
          token.items = splitRuns(image.rgba, image.width, image.height, snapped.box, { ...options, axis: region.split, join: region.join })
            .map(run => ({ start_px: run.start, size_px: run.size }));
        }
        if (region.note) token.note = region.note;
        tokens.push(token);
      }
      if (withOverlay) writeFileSync(join(outDir, `${shot.id}.overlay.png`), await overlay(page, bytes, mime, marks));
    }
    if (failures.length) return { ok: false, problems: failures };
    const document = {
      app: manifest.app, kind: manifest.kind, source: manifest.source, platform: manifest.platform, captured: manifest.captured,
      viewport_pt: manifest.viewport_pt, viewport_basis: manifest.viewport_basis ?? null,
      tool: 'fe-inspect/measure-shot', tolerance_px: TOLERANCE_PX,
      calibration: { max_error_px: calibration.max_error_px, max_radius_error_px: calibration.max_radius_error_px, cases: calibration.cases.map(c => ({ id: c.id, max_error_px: c.max_error_px, max_radius_error_px: c.max_radius_error_px })) },
      stability: { ...STABILITY, rule: 'every token was re-measured with its search box moved and grown and its threshold nudged; a different box without a warning refuses the run' },
      units: 'px = screenshot pixels; ratio = fraction of screenshot width or height; pt = logical points, null when viewport_pt is unknown; radius = corner radius of a filled shape, null otherwise',
      tokens
    };
    const target = join(outDir, 'tokens.json');
    writeFileSync(target, compactJson(document));
    return { ok: true, target, tokens: tokens.length, calibration, variants: STABILITY.shifts.length * 8 + STABILITY.grows.length + 2 };
  } finally {
    await browser.close();
  }
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--hash')) { console.log(sha256File(arg('--hash'))); return 0; }
  if (argv.includes('--calibrate')) {
    const { browser, page } = await openOfflinePage();
    try {
      const result = await calibrate(page);
      console.log(JSON.stringify(result, null, 2));
      return result.pass ? 0 : 1;
    } finally { await browser.close(); }
  }
  if (argv.includes('--device') || argv.includes('--grid')) {
    const file = arg('--device') ?? arg('--grid');
    const mime = MIME[extname(String(file)).toLowerCase()];
    if (!file || !existsSync(file) || !mime) { console.error('give a .png, .jpg, .jpeg or .webp screenshot'); return 2; }
    const { browser, page } = await openOfflinePage();
    try {
      const bytes = readFileSync(file);
      const image = await decode(page, bytes, mime);
      if (argv.includes('--device')) {
        const candidates = deviceCandidates(image.width, image.height);
        console.log(JSON.stringify({
          image: [image.width, image.height],
          candidates,
          verdict: candidates.length === 0 ? 'No known iPhone screen has this shape. Set "viewport_pt": null; sizes are then reported as fractions of the screen only.'
            : candidates.every(c => c.native) && new Set(candidates.map(c => c.pt.join('x'))).size === 1 ? `Untouched screenshot: ${candidates[0].pt.join('x')} pt.`
            : 'Several screens fit. Ask the device owner which phone took the screenshot before setting "viewport_pt"; do not pick one.'
        }, null, 2));
        return 0;
      }
      const step = Number(arg('--step') ?? 100);
      if (!Number.isInteger(step) || step < 20) { console.error('--step must be a whole number of pixels, 20 or more'); return 2; }
      const target = arg('--out') ?? `${file}.grid.png`;
      writeFileSync(target, await gridImage(page, bytes, mime, step));
      console.log(`GRID: ${image.width}x${image.height} px, lines every ${step / 2} px, numbered every ${step} px -> ${target}`);
      return 0;
    } finally { await browser.close(); }
  }
  const manifest = arg('--manifest');
  if (!manifest) { console.error('usage: measure-shot.mjs --manifest <shots.json> --project <product> [--out <dir>] [--overlay] | --device <file> | --grid <file> [--step 100] [--out <png>] | --hash <file> | --calibrate'); return 2; }
  const result = await measureManifest(manifest, { project: arg('--project'), out: arg('--out'), withOverlay: argv.includes('--overlay') });
  if (!result.ok) {
    console.error(`REFUSED: ${result.problems.length} problem(s). No tokens were written.`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    return 1;
  }
  console.log(`MEASURED: ${result.tokens} token(s) -> ${result.target} (calibration max error ${result.calibration.max_error_px}px, tolerance ${TOLERANCE_PX}px; every token re-measured under ${result.variants} perturbations)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code), error => { console.error(error.message); process.exit(1); });
}

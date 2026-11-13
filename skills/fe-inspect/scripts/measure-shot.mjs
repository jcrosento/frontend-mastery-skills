#!/usr/bin/env node
// Measure layout geometry in labelled reference screenshots.
//
//   node measure-shot.mjs --hash <file>
//   node measure-shot.mjs --calibrate
//   node measure-shot.mjs --manifest <shots.json> --project <product-being-redesigned> [--out <dir>] [--overlay]
//
// The manifest names the reference app, where the screenshots came from, and a rough
// search box per element. Pixels decide the final box. Nothing is fetched: images are
// decoded in an offline Chromium page and every network request is aborted.
// Colours, icons and copy are never recorded.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ringBackground, snapBox, splitRuns, toUnits } from './measure-core.mjs';
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

// Synthetic screenshot with shapes at known coordinates, drawn large then downscaled,
// so the measurer is tested on the same kind of resampled, compressed image it is used on.
const CALIBRATION = {
  draw: [1290, 2796],
  scaled: [923, 2000],
  shapes: [
    // Low-contrast surface (30 levels above the background), measured with a lowered threshold.
    { name: 'pill', kind: 'rect', box: [300, 2540, 690, 136], radius: 68, fill: '#3a3a3c', search: [180, 2480, 930, 256], threshold: 14 },
    { name: 'circle', kind: 'circle', box: [528, 2216, 234, 234], fill: '#ffffff', search: [430, 2120, 430, 430] },
    { name: 'chip', kind: 'rect', box: [80, 880, 262, 62], radius: 10, fill: '#48484a', search: [40, 840, 342, 142] },
    // Two cells flush against each other in different colours, drawn only. `contrast` would
    // merge them, so the first cell is measured with `match`.
    { name: 'cell', kind: 'rect', box: [522, 1352, 192, 240], radius: 0, fill: '#ef6b6b', drawOnly: true },
    { name: 'neighbour', kind: 'rect', box: [714, 1352, 192, 240], radius: 0, fill: '#3d94c1', drawOnly: true },
    { name: 'cell.match', kind: 'none', box: [522, 1352, 192, 240], search: [440, 1300, 500, 344], mode: 'match', sample: [618, 1472], threshold: 30 }
  ]
};

export async function calibrate(page) {
  const encoded = await page.evaluate(async ({ draw, scaled, shapes }) => {
    const big = new OffscreenCanvas(draw[0], draw[1]);
    const ctx = big.getContext('2d');
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, draw[0], draw[1]);
    for (const s of shapes) {
      if (s.kind === 'none') continue;
      ctx.fillStyle = s.fill;
      ctx.beginPath();
      if (s.kind === 'circle') ctx.arc(s.box[0] + s.box[2] / 2, s.box[1] + s.box[3] / 2, s.box[2] / 2, 0, Math.PI * 2);
      else ctx.roundRect(s.box[0], s.box[1], s.box[2], s.box[3], s.radius);
      ctx.fill();
    }
    const small = new OffscreenCanvas(scaled[0], scaled[1]);
    const sctx = small.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(big, 0, 0, scaled[0], scaled[1]);
    const toB64 = async (canvas, type, quality) => {
      const buffer = new Uint8Array(await (await canvas.convertToBlob({ type, quality })).arrayBuffer());
      let binary = '';
      for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode.apply(null, buffer.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    return {
      'png-native': await toB64(big, 'image/png'),
      'jpeg-native': await toB64(big, 'image/jpeg', 0.8),
      'jpeg-downscaled': await toB64(small, 'image/jpeg', 0.8)
    };
  }, CALIBRATION);

  const cases = [];
  for (const [id, b64] of Object.entries(encoded)) {
    const mime = id.startsWith('png') ? 'image/png' : 'image/jpeg';
    const image = await decode(page, Buffer.from(b64, 'base64'), mime);
    const k = image.width / CALIBRATION.draw[0];
    let worst = 0;
    const shapes = CALIBRATION.shapes.filter(s => !s.drawOnly).map(s => {
      const expected = s.box.map(n => n * k);
      const got = snapBox(image.rgba, image.width, image.height, s.search.map(n => n * k), { threshold: s.threshold, mode: s.mode, sample: s.sample?.map(n => Math.round(n * k)) });
      // A shape that is not found counts as a full-image error so it can never pass.
      const error = got.found ? Math.max(...got.box.map((n, i) => Math.abs(n - expected[i]))) : image.height;
      worst = Math.max(worst, error);
      return { name: s.name, expected: expected.map(n => Number(n.toFixed(2))), measured: got.box ?? null, error_px: Number(error.toFixed(2)) };
    });
    cases.push({ id, image: [image.width, image.height], max_error_px: Number(worst.toFixed(2)), shapes });
  }
  const max = Math.max(...cases.map(c => c.max_error_px));
  return { tolerance_px: TOLERANCE_PX, max_error_px: max, pass: max <= TOLERANCE_PX, cases };
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
      ctx.strokeRect(m.box[0] - 1, m.box[1] - 1, m.box[2] + 2, m.box[3] + 2);
      const label = `${m.name} ${m.box[2]}x${m.box[3]}`;
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
        const options = { mode: region.mode, threshold: region.threshold, minRun: region.min_run, background: region.background, sample: region.sample };
        // Fix the background and sample point from the search box, so that splitting the
        // snapped box later compares against the same reference colour.
        if ((options.mode ?? 'contrast') === 'contrast' && !options.background) options.background = ringBackground(image.rgba, image.width, image.height, region.search);
        if (options.mode === 'match' && !options.sample) options.sample = [Math.round(region.search[0] + region.search[2] / 2), Math.round(region.search[1] + region.search[3] / 2)];
        const snapped = snapBox(image.rgba, image.width, image.height, region.search, options);
        marks.push({ name: region.name, search: region.search, box: snapped.box });
        if (!snapped.found) { failures.push(`${shot.id}/${region.name}: ${snapped.reason}`); continue; }
        if (snapped.clipped.length && !region.allow_clip) { failures.push(`${shot.id}/${region.name}: box touches the ${snapped.clipped.join(' and ')} edge of its search area; widen "search" or set "allow_clip": true with a reason`); continue; }
        const token = {
          name: region.name,
          measured_from: { shot: shot.id, sha256: shot.sha256, screen: shot.screen, box: snapped.box, image: [image.width, image.height] },
          method: { mode: region.mode || 'contrast', threshold: region.threshold ?? 40, search: region.search, ...(region.sample ? { sample: region.sample } : {}), ...(region.background ? { background: region.background } : {}) },
          fill: snapped.fill,
          ...toUnits(snapped.box, image, manifest.viewport_pt)
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
      calibration: { max_error_px: calibration.max_error_px, cases: calibration.cases.map(c => ({ id: c.id, max_error_px: c.max_error_px })) },
      units: 'px = screenshot pixels; ratio = fraction of screenshot width or height; pt = logical points, null when viewport_pt is unknown',
      tokens
    };
    const target = join(outDir, 'tokens.json');
    writeFileSync(target, compactJson(document));
    return { ok: true, target, tokens: tokens.length, calibration };
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
  const manifest = arg('--manifest');
  if (!manifest) { console.error('usage: measure-shot.mjs --manifest <shots.json> --project <product> [--out <dir>] [--overlay] | --hash <file> | --calibrate'); return 2; }
  const result = await measureManifest(manifest, { project: arg('--project'), out: arg('--out'), withOverlay: argv.includes('--overlay') });
  if (!result.ok) {
    console.error(`REFUSED: ${result.problems.length} problem(s). No tokens were written.`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    return 1;
  }
  console.log(`MEASURED: ${result.tokens} token(s) -> ${result.target} (calibration max error ${result.calibration.max_error_px}px, tolerance ${TOLERANCE_PX}px)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code), error => { console.error(error.message); process.exit(1); });
}

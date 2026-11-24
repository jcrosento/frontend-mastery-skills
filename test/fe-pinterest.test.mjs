import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { spawnBounded } from '../scripts/run-bounded.mjs';
import { boardPalette, contrast, fromHex, merge, readableOn, rgbToOklab, oklabToRgb } from '../skills/fe-pinterest/scripts/palette-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'skills/fe-pinterest/scripts/palette.mjs');

// A pin is drawn in a real browser as horizontal bands of colour, then saved as a real PNG, JPEG or WebP file.
const DRAW = async ({ bands, type }) => {
  const canvas = new OffscreenCanvas(120, 180); const ctx = canvas.getContext('2d');
  let y = 0;
  for (const [rgb, share] of bands) { ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillRect(0, y, 120, Math.ceil(180 * share) + 1); y += Math.round(180 * share); }
  const blob = await canvas.convertToBlob({ type, quality: 0.9 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = ''; for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
};
const TYPES = [['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp']];
const CREAM = [238, 230, 216]; const CLAY = [196, 100, 60]; const BARK = [46, 32, 24]; const SAGE = [138, 154, 123];
const warm = i => [[CREAM, 0.55], [[CLAY[0], CLAY[1] + i, CLAY[2]], 0.2], [SAGE, 0.15], [BARK, 0.1]];

async function makeBoards(dir) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const save = async (folder, name, bands, n) => {
      const [ext, type] = TYPES[n % 3];
      mkdirSync(join(dir, folder), { recursive: true });
      writeFileSync(join(dir, folder, `${name}.${ext}`), Buffer.from(await page.evaluate(DRAW, { bands, type }), 'base64'));
    };
    for (let i = 0; i < 9; i++) await save('warm', `pin-${i}`, warm(i), i);
    for (let i = 0; i < 5; i++) { await save('split', `light-${i}`, warm(i), i); await save('split', `dark-${i}`, [[[14, 12, 30], 0.75], [[0, 240, 200], 0.25]], i); }
    const loud = [[220, 30, 40], [30, 90, 220], [20, 170, 80], [240, 200, 20], [150, 40, 200], [240, 120, 20], [0, 180, 190], [230, 60, 150]];
    for (let i = 0; i < 8; i++) await save('rainbow', `pin-${i}`, [[loud[i], 0.7], [loud[(i + 3) % 8], 0.3]], i);
    for (let i = 0; i < 3; i++) await save('few', `pin-${i}`, warm(i), i);
    writeFileSync(join(dir, 'warm', 'broken.png'), 'this is not an image');
    writeFileSync(join(dir, 'warm', 'notes.txt'), 'not a pin');
  } finally { await browser.close(); }
}

const run = (folder, cwd, extra = []) => spawnBounded(process.execPath, [script, folder, ...extra], { cwd, env: { ...process.env, FE_SCAN_STAMP: 'fixture' }, timeoutMs: 60_000 });

test('fe-pinterest: colour math - round trip, contrast, and near-identical colours are one colour', () => {
  for (const rgb of [CREAM, CLAY, BARK, [0, 0, 0], [255, 255, 255], [0, 240, 200]]) {
    const back = oklabToRgb(rgbToOklab(rgb));
    assert.ok(back.every((v, i) => Math.abs(v - rgb[i]) <= 1), `${rgb} came back as ${back}`);
  }
  assert.equal(Math.round(contrast([0, 0, 0], [255, 255, 255])), 21);
  assert.ok(Math.abs(contrast([119, 119, 119], [255, 255, 255]) - 4.48) < 0.02, 'the well-known #777 on white is 4.48:1');
  const eight = Array.from({ length: 8 }, (_, i) => ({ lab: rgbToOklab([196, 98 + i, 59]), w: 0.1, pins: new Set([i]) }));
  const merged = merge([...eight, { lab: rgbToOklab(SAGE), w: 0.2, pins: new Set([0]) }]);
  assert.equal(merged.length, 2, 'eight terracottas one step apart are one swatch, the sage is another');
  assert.equal(merged.find(g => g.pins.size === 8).pins.size, 8);
});

test('fe-pinterest: a board colour that cannot be read is moved until it can, and the hue is kept', () => {
  const canvas = [252, 245, 238];
  const pale = rgbToOklab([240, 200, 120]);
  assert.ok(contrast(oklabToRgb(pale), canvas) < 2, 'the board colour itself is unreadable on cream');
  const fixed = readableOn(pale, canvas, 4.5);
  assert.ok(contrast(fixed, canvas) >= 4.5);
  const [before, after] = [pale, rgbToOklab(fixed)].map(lab => Math.atan2(lab[2], lab[1]) * 180 / Math.PI);
  assert.ok(Math.abs(before - after) < 12, `hue moved from ${before.toFixed(0)} to ${after.toFixed(0)}`);
});

test('fe-pinterest: real PNG, JPEG and WebP pins are read in a browser and the guide files are written', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-pinterest-'));
  try {
    await makeBoards(dir);
    const out = join(dir, 'project'); mkdirSync(out);

    const good = await run(join(dir, 'warm'), out, ['--name', 'Warm Studio']);
    assert.equal(good.timedOut, false, good.stderr);
    assert.equal(good.code, 0, `a board that agrees with itself exits 0: ${good.stdout}${good.stderr}`);
    assert.match(good.stdout, /VERDICT COHERENT/);
    assert.match(good.stdout, /UNREAD broken\.png/, 'a file that is not an image is named, not fatal');
    const palette = JSON.parse(readFileSync(join(out, 'design/style-guide/warm-studio/palette.json'), 'utf8'));
    assert.equal(palette.pins, 9, 'three formats, nine pins, all decoded');
    assert.deepEqual(new Set(palette.files.map(name => name.split('.').pop())), new Set(['png', 'jpg', 'webp']));
    assert.equal(palette.mode, 'light');
    assert.equal(palette.mood.temperature, 'warm');
    const clay = palette.swatches.find(s => /orange|red/.test(s.name));
    assert.ok(clay && clay.pins === 9, `the terracotta is one swatch seen in all nine pins: ${JSON.stringify(palette.swatches)}`);
    const { roles } = palette;
    assert.match(roles.accent.from, /orange|red/, 'the accent comes from the terracotta');
    assert.ok(contrast(fromHex(roles.accent.value), fromHex(roles.canvas.value)) >= 4.5, 'accent reads on the canvas');
    assert.ok(contrast(fromHex(roles['on-accent'].value), fromHex(roles.accent.value)) >= 4.5, 'button text reads on the accent');
    assert.ok(contrast(fromHex(roles.text.value), fromHex(roles.canvas.value)) >= 7, 'body text reaches 7:1');
    assert.ok(contrast(fromHex(roles['text-muted'].value), fromHex(roles.canvas.value)) >= 4.5, 'muted text still reads');
    assert.match(roles.support.use, /decoration only/);
    const tokens = JSON.parse(readFileSync(join(out, 'design/style-guide/warm-studio/tokens.proposed.json'), 'utf8'));
    assert.equal(tokens.color.accent.$value, roles.accent.value);
    assert.equal(tokens.color.accent.$type, 'color');

    const written = readdirSync(join(out, 'design/style-guide/warm-studio'));
    assert.deepEqual(written.sort(), ['palette.json', 'tokens.proposed.json'], 'no pin image is copied into the project');
    assert.equal(existsSync(join(out, 'design/tokens.json')), false, 'the real tokens file is never written');

    const again = await run(join(dir, 'warm'), out, ['--name', 'Warm Studio']);
    assert.equal(readFileSync(join(out, 'design/style-guide/warm-studio/palette.json'), 'utf8'), JSON.stringify(palette, null, 2), 'same pins, same palette');
    assert.equal(again.code, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fe-pinterest: boards that disagree are called MIXED, too few pins and links are refused', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-pinterest-'));
  try {
    await makeBoards(dir);
    const out = join(dir, 'project'); mkdirSync(out);

    const split = await run(join(dir, 'split'), out);
    assert.equal(split.code, 1, split.stdout + split.stderr);
    assert.match(split.stdout, /PROBLEM Light and dark pins are mixed: 5 light, 5 dark/);
    assert.match(split.stdout, /VERDICT MIXED/);

    const rainbow = await run(join(dir, 'rainbow'), out);
    assert.equal(rainbow.code, 1, rainbow.stdout + rainbow.stderr);
    assert.match(rainbow.stdout, /The pins do not agree on a palette/);

    const few = await run(join(dir, 'few'), out);
    assert.equal(few.code, 2);
    assert.match(few.stdout, /TOO FEW/);
    assert.equal(existsSync(join(out, 'design/style-guide/few')), false, 'nothing is written for a refused board');

    const link = await run('https://www.pinterest.com/someone/some-board/', out);
    assert.equal(link.code, 2);
    assert.match(link.stderr, /does not open Pinterest/);
    assert.equal(boardPalette([]).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fe-pinterest: the script decodes with the network off and never asks for a pinterest address', () => {
  const source = readFileSync(script, 'utf8');
  assert.match(source, /offline: true/);
  assert.match(source, /route\('\*\*\/\*', route => route\.abort\(\)\)/);
  assert.doesNotMatch(source, /page\.goto|fetch\(|pinimg|api\.pinterest/);
});

#!/usr/bin/env node
// Usage: node palette.mjs <folder of saved pins> [--name <board>] [--out <dir>]
//        node palette.mjs --selftest
// Reads the images in a folder on this machine and proposes a palette. It opens no website:
// the browser is used only to decode the image files, with the network switched off.
// Exit 0 COHERENT, 1 MIXED (the board does not agree with itself), 2 could not run or too few pins.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MIN_PINS, boardPalette, contrast, formatReport, fromHex, pinColours, proposedTokens, rgbToOklab } from './palette-core.mjs';

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif' };
const MAX_PINS = 60;
const MAX_BYTES = 12 * 1024 * 1024;

export function listImages(folder) {
  return readdirSync(folder).filter(name => TYPES[extname(name).toLowerCase()] && statSync(join(folder, name)).isFile()).sort();
}

// Draws the file onto a 48px canvas and hands back its pixels. A file the browser cannot read returns null.
const DECODE = async ({ data, type }) => {
  try {
    const bytes = Uint8Array.from(atob(data), ch => ch.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type }));
    const scale = Math.min(1, 48 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale)); const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h); const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return Array.from(ctx.getImageData(0, 0, w, h).data);
  } catch { return null; }
};

export async function readPins(folder) {
  const all = listImages(folder); const files = all.slice(0, MAX_PINS);
  const pins = []; const unread = [];
  if (all.length > MAX_PINS) console.error(`Read the first ${MAX_PINS} of ${all.length} images. A board that large is usually more than one look.`);
  if (!files.length) return { pins, unread };
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ offline: true });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    for (const file of files) {
      const path = join(folder, file);
      const rgba = statSync(path).size > MAX_BYTES ? null : await page.evaluate(DECODE, { data: readFileSync(path).toString('base64'), type: TYPES[extname(file).toLowerCase()] });
      if (!rgba) { unread.push(file); continue; }
      pins.push({ file, colours: pinColours(rgba, pins.length) });
    }
  } finally { await browser.close(); }
  return { pins, unread };
}

function selftest() {
  const flat = (rgb, share) => ({ lab: rgbToOklab(rgb), w: share });
  const pin = (file, i, parts) => ({ file, colours: parts.map(([rgb, share]) => ({ ...flat(rgb, share), pin: i })) });
  const calm = Array.from({ length: 8 }, (_, i) => pin(`calm-${i}.jpg`, i, [[[238, 230, 216], 0.6], [[196, 98 + i, 59], 0.2], [[46, 32, 24], 0.15], [[138, 154, 123], 0.05]]));
  const mixed = [...calm.slice(0, 4), ...Array.from({ length: 4 }, (_, i) => pin(`neon-${i}.jpg`, i + 4, [[[12, 10, 30], 0.8], [[0, 255, 200], 0.2]]))];
  const good = boardPalette(calm); const bad = boardPalette(mixed);
  const checks = [
    ['a board of cream, terracotta and brown pins is light, warm and coherent', good.verdict === 'COHERENT' && good.mode === 'light' && good.mood.temperature === 'warm'],
    ['the accent is the terracotta, moved until it reads on the background', good.roles.accent && good.roles.accent.contrast >= 4.5 && /orange|red/.test(good.roles.accent.from)],
    ['body text reaches 7:1 and button text reaches 4.5:1', contrast(fromHex(good.roles.text.value), fromHex(good.roles.canvas.value)) >= 7 && good.roles['on-accent'].contrast >= 4.5],
    ['half light pins and half dark pins is a mixed board', bad.verdict === 'MIXED' && bad.status === 1 && bad.problems.some(text => /mixed/.test(text))],
    [`fewer than ${MIN_PINS} pins is refused`, boardPalette(calm.slice(0, 3)).status === 2],
    ['the same pins give the same palette', JSON.stringify(boardPalette(calm)) === JSON.stringify(good)],
    ['proposed tokens are colours in the shape fe-extract writes', proposedTokens(good).color.accent.$type === 'color'],
  ];
  checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} selftest checks passed`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const folder = process.argv[2];
  const flag = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
  if (!folder || folder.startsWith('--')) { console.error('Usage: node palette.mjs <folder of saved pins> [--name <board>] [--out <dir>]'); process.exit(2); }
  if (/^https?:/i.test(folder)) { console.error('Give a folder, not a link. This script does not open Pinterest; see references/getting-the-pins.md.'); process.exit(2); }
  let pins; let unread;
  try { ({ pins, unread } = await readPins(resolve(folder))); } catch (error) {
    const reason = String(error.message || error).split('\n')[0];
    console.error(`Palette could not run: ${reason}`);
    if (/playwright|Executable doesn't exist/i.test(reason)) console.error('It needs a browser to decode the images. Install one beside the skills: npm i --prefix ~/.agents playwright && ~/.agents/node_modules/.bin/playwright install chromium (for skills installed in a project, use --prefix .agents and keep .agents/node_modules out of git).');
    process.exit(2);
  }
  const name = (flag('--name') || basename(resolve(folder))).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';
  const result = boardPalette(pins);
  const text = formatReport(name, result) + (unread.length ? `\nUNREAD ${unread.join(', ')}` : '');
  console.log(text);
  if (result.status !== 2) {
    const out = flag('--out') || join('design', 'style-guide', name);
    mkdirSync(out, { recursive: true });
    const save = (file, value) => writeFileSync(join(out, file), JSON.stringify(value, null, 2));
    save('palette.json', { board: name, date: process.env.FE_SCAN_STAMP || new Date().toISOString().slice(0, 10), ...result, files: pins.map(pin => pin.file), unread });
    save('tokens.proposed.json', proposedTokens(result));
    console.log(`WROTE ${join(out, 'palette.json')} and tokens.proposed.json. No image was copied.`);
  }
  process.exit(result.status);
}

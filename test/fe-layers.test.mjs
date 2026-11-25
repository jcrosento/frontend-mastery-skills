import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnBounded } from '../scripts/run-bounded.mjs';
import { COLOUR_TOLERANCE, LAYERS, colourGap, decide, parseColour, scoreLayers, specCss, withColour, worstOf } from '../skills/fe-layers/scripts/layers-core.mjs';
import { parseSitemap } from '../skills/fe-layers/scripts/layers.mjs';
import { serveLayersSite } from './helpers/layers-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'skills/fe-layers/scripts/layers.mjs');
const dir = 'design/layers/inn';

const run = (out, args, loopback = true) => spawnBounded(process.execPath, [script, ...args, ...(loopback ? ['--allow-loopback-fixture'] : [])], { cwd: out, env: { ...process.env, FE_SCAN_STAMP: 'fixture' }, timeoutMs: 110_000 });
const url = server => `http://127.0.0.1:${server.address().port}/`;
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const scratch = () => mkdtempSync(join(tmpdir(), 'fe-layers-'));

// What a person does between the read and the gate: read the draft, then delete its status line.
function approve(out) {
  const spec = json(join(out, dir, 'spec.draft.json'));
  delete spec.status;
  writeFileSync(join(out, dir, 'spec.json'), JSON.stringify(spec, null, 2));
  return spec;
}

// The reference is read once, in a real browser, and each test works on its own copy of the result.
let reading = null;
function readOnce() {
  if (!reading) reading = (async () => {
    const out = scratch(); const server = await serveLayersSite('ref');
    try { return { out, result: await run(out, ['read', url(server), '--name', 'inn']), writes: server.writes }; } finally { server.close(); }
  })();
  return reading;
}
async function readReference(out) {
  const first = await readOnce();
  if (first.result.code === 0) cpSync(join(first.out, 'design'), join(out, 'design'), { recursive: true });
  return { server: await serveLayersSite('ref'), result: first.result, readWrites: first.writes };
}
test.after(async () => { if (reading) rmSync((await reading).out, { recursive: true, force: true }); });

test('fe-layers: the loop passes, fails by name, flags a regression and stops when stuck', () => {
  const mark = (score, passed) => ({ score, passed, pass: 95, offenders: [] });
  const all = score => Object.fromEntries(LAYERS.filter(l => l !== 'pages').map(l => [l, mark(score, score >= 95)]));
  const log = layers => ({ layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, { score: v.score, passed: v.passed }])) });
  assert.equal(decide(all(100)).verdict, 'PASS');
  const typeLow = { ...all(100), type: mark(70, false), motion: mark(60, false) };
  const first = decide(typeLow);
  assert.deepEqual([first.verdict, first.next, first.tries, first.status], ['FAIL', 'type', 1, 1], 'the lowest failing layer in the stack is fixed first, not the lowest score');
  assert.equal(decide(typeLow, [log(all(100))]).verdict, 'REGRESSED');
  assert.equal(decide(typeLow, [log(typeLow)]).tries, 2);
  const stuck = decide(typeLow, [log(typeLow), log(typeLow)]);
  assert.deepEqual([stuck.verdict, stuck.status], ['STUCK', 3]);
  const gaining = decide({ ...typeLow, type: mark(80, false) }, [log(typeLow), log(typeLow)]);
  assert.deepEqual([gaining.verdict, gaining.tries], ['FAIL', 1], 'a run that gains a point is not stuck');
});

test('fe-layers: the worst screen sets the score, colours match by eye not by string, and a style guide can supply the colour layer', () => {
  const layer = score => ({ type: { score, passed: score >= 95, pass: 95, offenders: [] } });
  const worst = worstOf({ desktop: layer(100), mobile: layer(60) });
  assert.deepEqual([worst.type.score, worst.type.device], [60, 'mobile']);
  assert.ok(colourGap(parseColour('#2f6b4f'), parseColour('rgb(48, 108, 80)')) < COLOUR_TOLERANCE, 'one step of rounding is the same colour');
  assert.ok(colourGap(parseColour('#fbf8f2'), parseColour('#ffffff')) > COLOUR_TOLERANCE, 'a warm off-white is not white');
  const page = { path: '/', colour: { text: [['rgb(177, 87, 44)', 10, 'a']], fill: [], line: [] } };
  const spec = withColour({ name: 'x', colour: { palette: ['#000000'] } }, { color: { accent: { $value: '#B1572C', $type: 'color' }, canvas: { $value: '#fcf5ee', $type: 'color' } } });
  assert.deepEqual(spec.colour.palette, ['#b1572c', '#fcf5ee']);
  assert.equal(scoreLayers([page], spec, { only: ['colour'] }).colour.passed, true);
  assert.throws(() => withColour({}, { color: {} }), /colour/i, 'an empty token file must not silently empty the palette');
  const css = specCss({ ...spec, type: { families: ['Verdana'], heading: 'Georgia', sizes: [16, 32], weights: [400] }, motion: { durations: [200], easings: ['ease-out'] } });
  assert.match(css, /@layer colour, type, space, shape, depth, motion, components;/);
  assert.match(css, /--color-accent: #b1572c/);
  assert.match(css, /prefers-reduced-motion/);
});

test('fe-layers: a sitemap index is told apart from a list of pages', () => {
  const index = parseSitemap('<sitemapindex><sitemap><loc>https://a.test/page-sitemap.xml</loc></sitemap></sitemapindex>');
  assert.deepEqual(index, { sitemaps: ['https://a.test/page-sitemap.xml'], pages: [] });
  const list = parseSitemap('<urlset><url><loc><![CDATA[https://a.test/rooms/?a=1&amp;b=2]]></loc></url><url><loc>https://a.test/photo.jpg</loc></url></urlset>');
  assert.deepEqual(list.pages, ['https://a.test/rooms/?a=1&b=2']);
});

test('fe-layers: reading a site measures every layer on every page and writes a draft that cannot be gated', { timeout: 240_000 }, async () => {
  const out = scratch();
  const { server, result, readWrites } = await readReference(out);
  try {
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.equal(readWrites, 0, 'reading must never send a write');
    const read = json(join(out, dir, 'read.json'));
    assert.deepEqual(read.paths, ['/', '/rooms/', '/contact/', '/old-offer/', '/news/hello/'], 'home, then the pages it links to, then the rest of the pages sitemap, then posts');
    assert.equal(read.devices.mobile.length, 5); assert.equal(read.devices.desktop.length, 5);
    const spec = json(join(out, dir, 'spec.draft.json'));
    assert.match(spec.status, /^draft/);
    assert.deepEqual(spec.type.sizes, [14, 16, 20, 32]);
    assert.deepEqual(spec.type.families.sort(), ['Georgia', 'Verdana']);
    assert.equal(spec.type.heading, 'Georgia');
    assert.equal(spec.space.base, 8);
    for (const colour of ['#fbf8f2', '#24302a', '#2f6b4f', '#ffffff']) assert.ok(spec.colour.palette.includes(colour), `palette misses ${colour}: ${spec.colour.palette}`);
    assert.deepEqual(spec.shape.radii.sort(), ['12px', 'pill']);
    assert.deepEqual(spec.depth.shadows, ['rgba(36, 48, 42, 0.12) 0px 8px 24px 0px']);
    assert.deepEqual([spec.motion.durations, spec.motion.easings], [[200], ['ease-out']]);

    const refused = await run(out, ['gate', url(server), '--spec', join(dir, 'spec.draft.json')]);
    assert.equal(refused.code, 2, 'a draft nobody has read must not gate anything');
    assert.match(refused.stderr, /still a draft/);
    const blocked = await run(out, ['read', url(server), '--name', 'blocked'], false);
    assert.equal(blocked.code, 2, 'a local address needs the fixture flag');
    assert.equal(existsSync(join(out, 'design/layers/blocked')), false);
    assert.equal(server.writes, 0, 'a refused run must not have touched the site');
  } finally { server.close(); rmSync(out, { recursive: true, force: true }); }
});

test('fe-layers: a rebuild with other markup passes; a careless edit regresses only the layers it touched; three tries without a gain stop the loop', { timeout: 420_000 }, async () => {
  const out = scratch();
  const { server, result } = await readReference(out);
  try {
    assert.equal(result.code, 0, result.stdout + result.stderr);
    approve(out);
    const gate = (...extra) => run(out, ['gate', url(server), '--spec', join(dir, 'spec.json'), '--pages', '3', ...extra]);
    const card = () => json(join(out, dir, 'scorecard.json'));
    const runs = () => (existsSync(join(out, dir, 'runs.jsonl')) ? readFileSync(join(out, dir, 'runs.jsonl'), 'utf8').trim().split('\n').length : 0);

    server.variant = 'good';
    const good = await gate();
    assert.equal(good.code, 0, good.stdout + good.stderr);
    assert.match(good.stdout, /VERDICT PASS/);
    assert.ok(Object.values(card().layers).every(layer => layer.passed), good.stdout);
    assert.equal(card().layers.interaction.uses > 0, true, 'focus and hover were really probed');
    assert.equal(card().layers.pages, undefined, 'old paths are only checked when asked');
    assert.equal(runs(), 1);

    server.variant = 'drift';
    const spot = await gate('--layer', 'type');
    assert.equal(spot.code, 1, spot.stdout);
    assert.deepEqual(Object.keys(card().layers), ['type']);
    assert.equal(runs(), 1, 'a one-layer spot check is not logged, so it cannot lock or unlock a layer');

    const drift = await gate();
    assert.equal(drift.code, 1, drift.stdout);
    assert.match(drift.stdout, /VERDICT REGRESSED/);
    const layers = card().layers;
    assert.deepEqual(Object.keys(layers).filter(name => !layers[name].passed), ['type', 'shape', 'motion'], drift.stdout);
    const named = name => layers[name].offenders.map(o => `${o.kind} ${o.value}`);
    assert.ok(named('type').includes('family Arial') && named('type').includes('size 15px'), named('type').join());
    assert.ok(named('shape').includes('radius 7px'), named('shape').join());
    assert.ok(named('motion').includes('duration 900') && named('motion').includes('easing linear'), named('motion').join());
    assert.deepEqual(card().regressed, ['type', 'shape', 'motion']);

    const second = await gate();
    assert.match(second.stdout, /VERDICT FAIL {2}Fix "type" first \(try 2 of 3\)/);
    const third = await gate();
    assert.equal(third.code, 3, third.stdout);
    assert.match(third.stdout, /VERDICT STUCK/);

    server.variant = 'good';
    const fixed = await gate();
    assert.equal(fixed.code, 0, fixed.stdout);
    assert.equal(runs(), 5);
    assert.equal(server.writes, 0, 'gating must never send a write');
  } finally { server.close(); rmSync(out, { recursive: true, force: true }); }
});

test('fe-layers: a dropped page fails the migration until it redirects, the colour layer can be swapped, and the spec becomes CSS', { timeout: 300_000 }, async () => {
  const out = scratch();
  const { server, result } = await readReference(out);
  try {
    assert.equal(result.code, 0, result.stdout + result.stderr);
    approve(out);
    const pagesOnly = () => run(out, ['gate', url(server), '--spec', join(dir, 'spec.json'), '--layer', 'pages', '--keep-urls', join(dir, 'read.json')]);
    server.variant = 'good';
    const dropped = await pagesOnly();
    assert.equal(dropped.code, 1, dropped.stdout);
    assert.match(dropped.stdout, /path \/old-offer\//);
    server.redirectOld = true;
    const kept = await pagesOnly();
    assert.equal(kept.code, 0, kept.stdout + kept.stderr);

    // A board's palette replaces the reference's colours: the build, still wearing the reference's colours, must now fail colour and nothing else.
    const tokens = join(out, 'tokens.proposed.json');
    writeFileSync(tokens, JSON.stringify({ color: { canvas: { $value: '#fcf5ee', $type: 'color' }, text: { $value: '#1f1913', $type: 'color' }, accent: { $value: '#b1572c', $type: 'color' }, 'on-accent': { $value: '#ffffff', $type: 'color' } } }));
    copyFileSync(join(out, dir, 'spec.json'), join(out, dir, 'board.json'));
    const swap = await run(out, ['colour', join(dir, 'board.json'), tokens], false);
    assert.equal(swap.code, 0, swap.stderr);
    const board = json(join(out, dir, 'board.json'));
    assert.deepEqual(board.colour.palette, ['#fcf5ee', '#1f1913', '#b1572c', '#ffffff']);
    assert.deepEqual(board.type, json(join(out, dir, 'spec.json')).type, 'only the colour layer changes');
    const recoloured = await run(out, ['gate', url(server), '--spec', join(dir, 'board.json'), '--pages', '3', '--out', join(out, 'board-run')]);
    assert.equal(recoloured.code, 1, recoloured.stdout);
    const layers = json(join(out, 'board-run/scorecard.json')).layers;
    assert.deepEqual(Object.keys(layers).filter(name => !layers[name].passed), ['colour'], recoloured.stdout);

    const css = await run(out, ['css', join(dir, 'board.json'), '--out', join(out, 'src/styles/layers.css')], false);
    assert.equal(css.code, 0, css.stderr);
    const sheet = readFileSync(join(out, 'src/styles/layers.css'), 'utf8');
    assert.match(sheet, /--color-accent: #b1572c/);
    assert.match(sheet, /--radius-\d: 999px/); assert.doesNotMatch(sheet, /pill|round/); assert.match(sheet, /--shadow-1: rgba\(36, 48, 42, 0\.12\)/); assert.match(sheet, /--dur-1: 200ms/);
    assert.equal(server.writes, 0);
  } finally { server.close(); rmSync(out, { recursive: true, force: true }); }
});

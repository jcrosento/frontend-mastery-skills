// Rules for fe-layers. No I/O here, so every rule can be tested.
// A site is read as a stack of layers, the way a picture is in an image editor. Each layer has its own
// numbers, its own gate, and is locked once it passes: a later change that breaks it is a regression.

export const LAYERS = ['pages', 'structure', 'colour', 'type', 'space', 'shape', 'depth', 'motion', 'interaction'];
export const PASS = 95;
// Distance in OKLab. 0.02 is about one just-noticeable step: a warm off-white and pure white are 0.022 apart and stay two colours.
export const COLOUR_TOLERANCE = 0.02;
const MERGE_WITHIN = 0.01; // when drafting a palette, only near-identical readings are folded into one swatch
export const STUCK_AFTER = 3;
const CAPS = { palette: 14, sizes: 10, weights: 4, families: 3, radii: 5, borders: 3, shadows: 4, durations: 4, easings: 3, scale: 12 };
const COVER = 0.92;

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function oklab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// "rgb(1, 2, 3)", "rgba(1, 2, 3, 0.5)" or "#rrggbb" -> [r, g, b], or null for a colour too transparent to name.
export function parseColour(text) {
  const value = String(text).trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  return alpha < 0.5 ? null : [match[1], match[2], match[3]].map(v => Math.round(Number(v)));
}
export const hex = rgb => `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`;
export function colourGap(a, b) { const p = oklab(a), q = oklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }

const px = text => { const n = parseFloat(text); return Number.isFinite(n) ? n : null; };
const near = (value, list, slack = 0.5) => list.some(item => Math.abs(item - value) <= slack);
const round = (n, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

// A census entry is [value, count, example]. Entries from several pages are merged, keeping the page of the first example
// and how many pages the value was seen on.
export function pool(pages, pick) {
  const map = new Map();
  for (const page of pages) for (const [value, count, example] of pick(page) || []) {
    const hit = map.get(value);
    if (hit) { hit.count += count; hit.onPages += 1; } else map.set(value, { value, count, example, page: page.path, onPages: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function tally(entries, conforms) {
  let total = 0; let ok = 0; const offenders = [];
  for (const entry of entries) {
    total += entry.count;
    if (conforms(entry.value)) ok += entry.count; else offenders.push(entry);
  }
  return { total, ok, offenders };
}
function finish(parts, extra = []) {
  const total = parts.reduce((sum, part) => sum + part.total, 0);
  const ok = parts.reduce((sum, part) => sum + part.ok, 0);
  const offenders = [...extra, ...parts.flatMap(part => part.offenders.map(o => ({ ...o, kind: part.kind })))].sort((a, b) => b.count - a.count);
  return { score: total ? round((ok / total) * 100) : 100, uses: total, offenders };
}

const CHECKS = {
  // Every page the old site had still answers. Only scored when a list of old paths is given.
  pages(pages, spec, { kept } = {}) {
    if (!kept) return null;
    const missing = kept.filter(item => !item.ok).map(item => ({ value: item.path, count: 1, page: item.path, example: `status ${item.status}`, kind: 'path' }));
    return { score: kept.length ? round(((kept.length - missing.length) / kept.length) * 100) : 100, uses: kept.length, offenders: missing };
  },
  structure(pages) {
    const offenders = []; let total = 0; let ok = 0;
    for (const page of pages) for (const [name, passed, detail] of page.structure || []) {
      total += 1; if (passed) ok += 1; else offenders.push({ value: name, count: 1, page: page.path, example: detail || '', kind: 'check' });
    }
    return { score: total ? round((ok / total) * 100) : 100, uses: total, offenders };
  },
  colour(pages, spec) {
    const palette = (spec.colour?.palette || []).map(parseColour).filter(Boolean);
    const slack = spec.colour?.tolerance ?? COLOUR_TOLERANCE;
    const fits = value => { const rgb = parseColour(value); return !rgb || palette.some(p => colourGap(p, rgb) <= slack); };
    return finish(['text', 'fill', 'line'].map(kind => ({ kind, ...tally(pool(pages, p => p.colour?.[kind]), fits) })));
  },
  type(pages, spec) {
    const families = (spec.type?.families || []).map(f => f.toLowerCase());
    const sizes = spec.type?.sizes || []; const weights = (spec.type?.weights || []).map(Number);
    return finish([
      { kind: 'family', ...tally(pool(pages, p => p.type?.families), v => families.includes(String(v).toLowerCase())) },
      { kind: 'size', ...tally(pool(pages, p => p.type?.sizes), v => near(px(v), sizes)) },
      { kind: 'weight', ...tally(pool(pages, p => p.type?.weights), v => weights.includes(Number(v))) },
    ]);
  },
  space(pages, spec) {
    const base = spec.space?.base || 4; const scale = spec.space?.scale || [];
    const fits = v => { const n = px(v); if (n === null) return true; const r = n % base; return Math.min(r, base - r) <= 0.5 || near(n, scale); };
    return finish([{ kind: 'gap', ...tally(pool(pages, p => p.space?.values), fits) }]);
  },
  shape(pages, spec) {
    const radii = (spec.shape?.radii || []).map(String); const borders = spec.shape?.borders || [];
    const fitsRadius = v => radii.includes(String(v)) || (px(v) !== null && /^[\d.]+px$/.test(v) && near(px(v), radii.filter(r => /^[\d.]+px$/.test(r)).map(px)));
    return finish([
      { kind: 'radius', ...tally(pool(pages, p => p.shape?.radii), fitsRadius) },
      { kind: 'border', ...tally(pool(pages, p => p.shape?.borders), v => near(px(v), borders, 0.25)) },
    ]);
  },
  depth(pages, spec) {
    const shadows = spec.depth?.shadows || [];
    return finish([{ kind: 'shadow', ...tally(pool(pages, p => p.depth?.shadows), v => shadows.includes(v)) }]);
  },
  motion(pages, spec) {
    const durations = spec.motion?.durations || []; const easings = spec.motion?.easings || [];
    const result = finish([
      { kind: 'duration', ...tally(pool(pages, p => p.motion?.durations), v => near(Number(v), durations, 10)) },
      { kind: 'easing', ...tally(pool(pages, p => p.motion?.easings), v => easings.includes(v)) },
    ]);
    // Motion with no reduced-motion rule fails whatever the numbers say.
    const bare = pages.filter(p => (p.motion?.moving || 0) > 0 && p.motion?.reducedRules === 0);
    if (bare.length) {
      result.offenders.unshift({ value: 'no prefers-reduced-motion rule', count: bare.length, page: bare[0].path, example: `${bare[0].motion.moving} moving elements`, kind: 'rule' });
      result.score = Math.min(result.score, 80);
    }
    return result;
  },
  interaction(pages) {
    const offenders = []; let total = 0; let ok = 0;
    for (const page of pages) for (const [kind, passed, example] of page.interaction || []) {
      total += 1; if (passed) ok += 1; else offenders.push({ value: kind === 'focus' ? 'no visible focus' : 'no hover change', count: 1, page: page.path, example, kind });
    }
    return { score: total ? round((ok / total) * 100) : 100, uses: total, offenders };
  },
};

// One device's pages against the spec. `only` limits the layers scored.
export function scoreLayers(pages, spec, { only = null, kept = null } = {}) {
  const out = {};
  for (const layer of LAYERS) {
    if (only && !only.includes(layer)) continue;
    const result = CHECKS[layer](pages, spec, { kept });
    if (!result) continue;
    const mark = spec[layer]?.pass ?? spec.pass ?? PASS;
    out[layer] = { ...result, pass: mark, passed: result.score >= mark, offenders: result.offenders.slice(0, 8) };
  }
  return out;
}

// Several devices: a layer's score is its worst device, because a visitor only has one screen.
export function worstOf(byDevice) {
  const out = {};
  for (const [device, layers] of Object.entries(byDevice)) for (const [layer, result] of Object.entries(layers)) {
    if (!out[layer] || result.score < out[layer].score) out[layer] = { ...result, device };
  }
  return Object.fromEntries(LAYERS.filter(layer => out[layer]).map(layer => [layer, out[layer]]));
}

// The loop. `history` is the earlier runs, oldest first, each { layers: { name: { score, passed } } }.
// REGRESSED: a layer that passed last time fails now. STUCK: the same layer has failed three runs running
// without gaining a point. Otherwise FAIL names the lowest layer in the stack still failing: fix that one first.
export function decide(layers, history = []) {
  const failing = LAYERS.filter(layer => layers[layer] && !layers[layer].passed);
  const last = history[history.length - 1];
  const regressed = last ? failing.filter(layer => last.layers?.[layer]?.passed) : [];
  if (!failing.length) return { verdict: 'PASS', status: 0, next: null, regressed: [], tries: 0 };
  const next = failing[0];
  let tries = 1; let best = layers[next].score;
  for (let i = history.length - 1; i >= 0; i--) {
    const before = history[i].layers?.[next];
    if (!before || before.passed) break;
    if (best >= before.score + 1) break;
    tries += 1; best = Math.max(best, before.score);
  }
  if (regressed.length) return { verdict: 'REGRESSED', status: 1, next: regressed[0], regressed, tries };
  if (tries >= STUCK_AFTER) return { verdict: 'STUCK', status: 3, next, regressed: [], tries };
  return { verdict: 'FAIL', status: 1, next, regressed: [], tries };
}

// The values worth keeping: first those seen on at least half the pages (a headline size is used once a page, yet it is
// the system), then the most used, until most uses are covered or the cap is reached.
function cover(entries, cap, pageCount = 0) {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0) || 1;
  const wide = entries.filter(entry => pageCount > 1 && (entry.onPages || 0) >= pageCount / 2);
  const out = []; let sum = 0;
  for (const entry of [...wide, ...entries.filter(entry => !wide.includes(entry))]) {
    if (out.length >= cap || (!wide.includes(entry) && sum / total >= COVER)) break;
    out.push(entry.value); sum += entry.count;
  }
  return { values: out, share: round((sum / total) * 100), left: entries.length - out.length };
}

// A read of a site becomes a draft spec: for each layer, the few values that cover most of what the site uses.
// What is left over is the reference's own inconsistency, and is not copied.
export function draftSpec(read) {
  const pages = Object.values(read.devices).flat(); const n = pages.length;
  const colours = []; const seen = [];
  for (const entry of pool(pages, p => [...(p.colour?.text || []), ...(p.colour?.fill || []), ...(p.colour?.line || [])])) {
    const rgb = parseColour(entry.value); if (!rgb) continue;
    const at = seen.findIndex(s => colourGap(s, rgb) <= MERGE_WITHIN);
    if (at >= 0) { colours[at].count += entry.count; colours[at].onPages = Math.max(colours[at].onPages, entry.onPages); } else { seen.push(rgb); colours.push({ value: hex(rgb), count: entry.count, onPages: entry.onPages }); }
  }
  const palette = cover(colours.sort((a, b) => b.count - a.count), CAPS.palette, n);
  const sizes = cover(pool(pages, p => p.type?.sizes), CAPS.sizes, n);
  const gaps = pool(pages, p => p.space?.values).filter(entry => px(entry.value) !== null);
  const gapTotal = gaps.reduce((sum, entry) => sum + entry.count, 0) || 1;
  const onGrid = unit => gaps.filter(entry => { const r = px(entry.value) % unit; return Math.min(r, unit - r) <= 0.5; }).reduce((sum, entry) => sum + entry.count, 0) / gapTotal;
  const base = onGrid(8) >= 0.8 ? 8 : onGrid(4) >= 0.6 ? 4 : onGrid(5) >= 0.8 ? 5 : 4;
  const off = gaps.filter(entry => { const r = px(entry.value) % base; return Math.min(r, base - r) > 0.5; });
  const radii = cover(pool(pages, p => p.shape?.radii), CAPS.radii, n);
  const borders = cover(pool(pages, p => p.shape?.borders), CAPS.borders, n);
  const shadows = cover(pool(pages, p => p.depth?.shadows), CAPS.shadows, n);
  const durations = cover(pool(pages, p => p.motion?.durations), CAPS.durations, n);
  const easings = cover(pool(pages, p => p.motion?.easings), CAPS.easings, n);
  const families = cover(pool(pages, p => p.type?.families), CAPS.families, n);
  const weights = cover(pool(pages, p => p.type?.weights), CAPS.weights, n);
  const note = (name, c) => (c.left > 0 ? [`${name}: ${c.values.length} values cover ${c.share}% of uses; ${c.left} more were left out`] : []);
  return {
    name: read.name, source: `read of ${read.origin} on ${read.date}, ${read.paths.length} pages, at ${read.widths.join(' and ')} px wide`,
    status: 'draft: edit, then approve. Nothing is gated until a person has read this file.',
    pass: PASS,
    colour: { palette: palette.values, tolerance: COLOUR_TOLERANCE },
    type: { families: families.values, heading: read.headingFamily || families.values[0] || null, sizes: sizes.values.map(px).sort((a, b) => a - b), weights: weights.values.map(Number).sort((a, b) => a - b) },
    space: { base, scale: cover(off, CAPS.scale, n).values.map(px).sort((a, b) => a - b), onGrid: round(onGrid(base) * 100) },
    shape: { radii: radii.values, borders: borders.values.map(px).sort((a, b) => a - b) },
    depth: { shadows: shadows.values },
    motion: { durations: durations.values.map(Number).sort((a, b) => a - b), easings: easings.values },
    leftOut: [...note('colour', palette), ...note('type sizes', sizes), ...note('radii', radii), ...note('shadows', shadows), ...note('durations', durations)],
  };
}

// Colour comes from somewhere else: a fe-pinterest tokens.proposed.json, or any W3C token file with a color group.
export function withColour(spec, tokens) {
  const roles = Object.entries(tokens.color || {}).filter(([, t]) => t && typeof t.$value === 'string' && parseColour(t.$value));
  if (!roles.length) throw new Error('no colours found: expected { "color": { "<role>": { "$value": "#rrggbb" } } }');
  return { ...spec, colour: { ...spec.colour, palette: roles.map(([, t]) => t.$value.toLowerCase()), roles: Object.fromEntries(roles.map(([name, t]) => [name, t.$value.toLowerCase()])), from: 'style guide tokens' } };
}

// The spec as CSS variables, one cascade layer per design layer, so one layer can be changed without touching another.
export function specCss(spec) {
  const lines = ['/* Written by fe-layers from spec.json. Edit the spec, not this file. */', '@layer colour, type, space, shape, depth, motion, components;', ''];
  const block = (name, vars) => { if (vars.length) lines.push(`@layer ${name} {`, '  :root {', ...vars.map(([k, v]) => `    --${k}: ${v};`), '  }', '}', ''); };
  const roles = spec.colour?.roles;
  block('colour', roles ? Object.entries(roles).map(([k, v]) => [`color-${k}`, v]) : (spec.colour?.palette || []).map((v, i) => [`color-${i + 1}`, v]));
  const fam = name => (/\s/.test(name) ? `"${name}"` : name);
  const families = spec.type?.families || [];
  block('type', [
    ...(spec.type?.heading ? [['font-heading', `${fam(spec.type.heading)}, system-ui, sans-serif`]] : []),
    ...(families.find(f => f !== spec.type?.heading) || families[0] ? [['font-body', `${fam(families.find(f => f !== spec.type?.heading) || families[0])}, system-ui, sans-serif`]] : []),
    ...(spec.type?.sizes || []).map((v, i) => [`text-${i + 1}`, `${round(v / 16, 4)}rem`]),
    ...(spec.type?.weights || []).map(v => [`weight-${v}`, v]),
  ]);
  block('space', [['space-unit', `${spec.space?.base || 4}px`], ...[1, 2, 3, 4, 6, 8, 12, 16, 24].map(n => [`space-${n}`, `calc(var(--space-unit) * ${n})`])]);
  block('shape', [...(spec.shape?.radii || []).map((v, i) => [`radius-${i + 1}`, v === 'pill' ? '999px' : v === 'round' ? '50%' : v]), ...(spec.shape?.borders || []).map((v, i) => [`border-${i + 1}`, `${v}px`])]);
  block('depth', (spec.depth?.shadows || []).map((v, i) => [`shadow-${i + 1}`, v]));
  block('motion', [...(spec.motion?.durations || []).map((v, i) => [`dur-${i + 1}`, `${v}ms`]), ...(spec.motion?.easings || []).map((v, i) => [`ease-${i + 1}`, v])]);
  lines.push('@layer motion {', '  @media (prefers-reduced-motion: reduce) {', '    *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }', '  }', '}', '');
  return lines.join('\n');
}

export function formatScorecard(name, target, layers, decision, pageCount) {
  const lines = [`LAYERS ${name}  ${target}  ${pageCount} pages`];
  for (const layer of LAYERS) {
    const r = layers[layer]; if (!r) continue;
    lines.push(`  ${r.passed ? 'PASS' : 'FAIL'}  ${layer.padEnd(12)} ${String(r.score).padStart(5)}  (needs ${r.pass}, ${r.uses} uses${r.device ? `, worst on ${r.device}` : ''})`);
    if (!r.passed) for (const o of r.offenders.slice(0, 5)) lines.push(`          ${o.kind} ${String(o.value).slice(0, 70)}  x${o.count}  ${o.page}${o.example ? `  ${String(o.example).slice(0, 60)}` : ''}`);
  }
  if (decision.verdict === 'PASS') lines.push('VERDICT PASS  Every layer is at its mark. Measured lines only: whether it feels right is fe-second-eye, and the merge call is fe-last-eye.');
  if (decision.verdict === 'FAIL') lines.push(`VERDICT FAIL  Fix "${decision.next}" first (try ${decision.tries} of ${STUCK_AFTER}). Change that layer only, then run again.`);
  if (decision.verdict === 'REGRESSED') lines.push(`VERDICT REGRESSED  "${decision.regressed.join('", "')}" passed last run and fails now. Undo the last change to it before anything else.`);
  if (decision.verdict === 'STUCK') lines.push(`VERDICT STUCK  "${decision.next}" has failed ${decision.tries} runs without gaining a point. Stop and ask the user: the spec or the approach is wrong, not the next tweak.`);
  return lines.join('\n');
}

export function formatRead(read, spec) {
  const lines = [`READ ${read.name}  ${read.origin}  ${read.paths.length} pages  ${read.widths.join(' and ')} px`];
  const row = (label, values) => lines.push(`  ${label.padEnd(10)} ${values.length ? values.join('  ') : '(none)'}`);
  row('colour', spec.colour.palette);
  row('fonts', spec.type.families.map(f => (f === spec.type.heading ? `${f} (headings)` : f)));
  row('sizes', spec.type.sizes.map(v => `${v}px`));
  row('weights', spec.type.weights);
  row('space', [`unit ${spec.space.base}px, ${spec.space.onGrid}% of gaps on it`]);
  row('radius', spec.shape.radii);
  row('borders', spec.shape.borders.map(v => `${v}px`));
  row('shadows', spec.depth.shadows.map(s => s.slice(0, 48)));
  row('motion', [...spec.motion.durations.map(v => `${v}ms`), ...spec.motion.easings.map(e => e.slice(0, 34))]);
  for (const note of spec.leftOut) lines.push(`  NOTE ${note}`);
  return lines.join('\n');
}

// Colour math and palette rules for fe-pinterest. No I/O here, so every rule can be tested.
// Colours are compared in OKLab, where equal distances look about equally different to the eye.

export const MIN_PINS = 6;
export const TEXT_CONTRAST = 4.5;
export const BODY_CONTRAST = 7;
// Below this much colourfulness a swatch is a neutral (cream, grey, charcoal), not a brand colour.
export const NEUTRAL = 0.035;
// An accent has to be clearly a colour. Photos average out duller than paint, so the bar is low but not zero.
export const STRONG = 0.045;
// Share of the board's colour that sits in swatches half the pins or more have in common.
export const MIN_AGREEMENT = 0.6;

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const unlin = v => { const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, c)) * 255); };

export function rgbToOklab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

export const hex = rgb => `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`;
export const fromHex = text => [1, 3, 5].map(i => parseInt(text.slice(i, i + 2), 16));
export const chroma = lab => Math.hypot(lab[1], lab[2]);
export const hue = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const hueGap = (h1, h2) => { const d = Math.abs(h1 - h2) % 360; return d > 180 ? 360 - d : d; };

export function luminance([r, g, b]) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
export function contrast(rgb1, rgb2) {
  const [hi, lo] = [luminance(rgb1), luminance(rgb2)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// k-means with a fixed start (the heaviest point, then the point farthest from every centre so far),
// so the same pins always give the same palette.
export function cluster(points, k, rounds = 12) {
  if (!points.length) return [];
  const centres = [points.reduce((best, p) => (p.w > best.w ? p : best)).lab];
  while (centres.length < Math.min(k, points.length)) {
    let far = null; let farD = -1;
    for (const p of points) { const d = Math.min(...centres.map(c => distance(p.lab, c))) * Math.sqrt(p.w); if (d > farD) { farD = d; far = p; } }
    if (farD <= 0) break;
    centres.push(far.lab);
  }
  let groups = [];
  for (let round = 0; round < rounds; round++) {
    groups = centres.map(() => ({ sum: [0, 0, 0], w: 0, pins: new Set() }));
    for (const p of points) {
      let at = 0; let best = Infinity;
      centres.forEach((c, i) => { const d = distance(p.lab, c); if (d < best) { best = d; at = i; } });
      const g = groups[at]; g.w += p.w; g.sum[0] += p.lab[0] * p.w; g.sum[1] += p.lab[1] * p.w; g.sum[2] += p.lab[2] * p.w;
      if (p.pin !== undefined) g.pins.add(p.pin);
    }
    groups.forEach((g, i) => { if (g.w > 0) centres[i] = g.sum.map(v => v / g.w); });
  }
  return groups.map((g, i) => ({ lab: centres[i], w: g.w, pins: g.pins })).filter(g => g.w > 0).sort((x, y) => y.w - x.w);
}

// Clusters closer than the eye can easily tell apart are one colour. Without this, eight slightly
// different terracottas would each look rare, and the board's real accent would be missed.
export const SAME_COLOUR = 0.06;
export function merge(groups, within = SAME_COLOUR) {
  const out = groups.map(g => ({ lab: [...g.lab], w: g.w, pins: new Set(g.pins) }));
  for (;;) {
    let pair = null; let best = within;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const d = distance(out[i].lab, out[j].lab); if (d < best) { best = d; pair = [i, j]; } }
    if (!pair) break;
    const [i, j] = pair; const a = out[i]; const b = out[j]; const w = a.w + b.w;
    out[i] = { lab: a.lab.map((v, n) => (v * a.w + b.lab[n] * b.w) / w), w, pins: new Set([...a.pins, ...b.pins]) };
    out.splice(j, 1);
  }
  return out.sort((x, y) => y.w - x.w);
}

// One pin: RGBA pixels in, its five main colours out. Every pin weighs the same, whatever its size.
export function pinColours(rgba, pin) {
  const points = [];
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] > 200) points.push({ lab: rgbToOklab([rgba[i], rgba[i + 1], rgba[i + 2]]), w: 1 });
  const total = points.length || 1;
  return cluster(points, 5).map(g => ({ lab: g.lab, w: g.w / total, pin })).filter(g => g.w >= 0.03);
}

function shift(lab, L, maxChroma = Infinity) {
  const c = chroma(lab); const scale = c > maxChroma ? maxChroma / c : 1;
  return [L, lab[1] * scale, lab[2] * scale];
}

// Move a colour's lightness away from the background until text in it can be read on that background.
// Hue is kept. Returns null when no lightness of this hue reaches the ratio.
export function readableOn(lab, canvasRgb, ratio = TEXT_CONTRAST) {
  const darker = luminance(canvasRgb) > 0.4;
  for (let step = 0; step <= 100; step++) {
    const L = darker ? lab[0] - step * 0.01 : lab[0] + step * 0.01;
    if (L < 0.05 || L > 0.98) break;
    const rgb = oklabToRgb(shift(lab, L));
    if (contrast(rgb, canvasRgb) >= ratio) return rgb;
  }
  return null;
}

function describe(lab) {
  const h = hue(lab); const c = chroma(lab);
  if (c < NEUTRAL) return lab[0] > 0.85 ? 'off-white' : lab[0] < 0.3 ? 'near-black' : 'grey';
  const names = [[20, 'red'], [50, 'orange'], [75, 'tan'], [110, 'yellow'], [150, 'green'], [200, 'teal'], [265, 'blue'], [310, 'purple'], [345, 'pink'], [361, 'red']];
  const name = names.find(([edge]) => h < edge)[1];
  return `${lab[0] > 0.8 ? 'pale ' : lab[0] < 0.4 ? 'deep ' : ''}${c < 0.07 ? 'muted ' : ''}${name}`;
}

// The whole board: per-pin colours in, the board's palette, mood and proposed roles out.
export function boardPalette(pins) {
  if (pins.length < MIN_PINS) return { status: 2, verdict: 'TOO FEW', reason: `${pins.length} pins. A style needs at least ${MIN_PINS}; 12 to 30 is better.` };
  const count = pins.length;
  const pool = pins.flatMap(pin => pin.colours.map(colour => ({ ...colour, w: colour.w / count })));
  const swatches = merge(cluster(pool, 10)).slice(0, 8).map(g => ({
    hex: hex(oklabToRgb(g.lab)), name: describe(g.lab), share: Math.round(g.w * 1000) / 10, pins: g.pins.size,
    lightness: Math.round(g.lab[0] * 100) / 100, chroma: Math.round(chroma(g.lab) * 1000) / 1000, hue: Math.round(hue(g.lab)), lab: g.lab, pinSet: g.pins,
  }));
  const meanL = pool.reduce((sum, p) => sum + p.lab[0] * p.w, 0);
  const meanC = pool.reduce((sum, p) => sum + chroma(p.lab) * p.w, 0);
  const warm = pool.reduce((sum, p) => sum + (p.lab[1] + p.lab[2]) * p.w, 0);
  const pinL = pins.map(pin => pin.colours.reduce((sum, c) => sum + c.lab[0] * c.w, 0) / (pin.colours.reduce((sum, c) => sum + c.w, 0) || 1));
  const spread = Math.sqrt(pinL.reduce((sum, L) => sum + (L - meanL) ** 2, 0) / count);
  const mode = meanL >= 0.6 ? 'light' : 'dark';

  const neutrals = swatches.filter(s => s.chroma < NEUTRAL);
  const colours = swatches.filter(s => s.chroma >= NEUTRAL);
  const quarter = Math.ceil(count / 4);
  // A sky is five blues, not one. Colours within 30 degrees of hue are one family, counted by the pins
  // that show any of them, and spoken for by the family's most vivid member.
  const families = [];
  for (const s of [...colours].sort((x, y) => y.chroma * y.share - x.chroma * x.share)) {
    const home = families.find(f => hueGap(f.hue, s.hue) <= 30);
    if (home) { home.members.push(s); s.pinSet.forEach(pin => home.pinSet.add(pin)); home.share += s.share; } else families.push({ hue: s.hue, members: [s], pinSet: new Set(s.pinSet), share: s.share });
  }
  for (const f of families) {
    const best = f.members.reduce((top, m) => (m.chroma * Math.sqrt(m.share) > top.chroma * Math.sqrt(top.share) ? m : top));
    Object.assign(f, { hex: best.hex, name: best.name, lab: best.lab, chroma: best.chroma, hue: best.hue, pins: f.pinSet.size });
  }
  const accentSeen = families.filter(f => f.pins >= quarter && f.chroma >= STRONG).sort((x, y) => y.chroma * y.pins - x.chroma * x.pins)[0] || null;
  const supportSeen = families.filter(f => f !== accentSeen && f.pins >= quarter && (!accentSeen || hueGap(f.hue, accentSeen.hue) >= 40)).sort((x, y) => y.pins * y.share - x.pins * x.share)[0] || null;
  // The background takes its tint from the neutral the board uses most on that side, never its exact value:
  // a photo's wall colour is not a screen background.
  const side = neutrals.filter(s => (mode === 'light' ? s.lightness >= 0.6 : s.lightness < 0.45)).sort((x, y) => y.share - x.share)[0];
  const tint = side ? side.lab : [meanL, 0, 0];
  const canvas = oklabToRgb(shift(tint, mode === 'light' ? 0.975 : 0.17, 0.012));
  const surface = oklabToRgb(shift(tint, mode === 'light' ? 0.945 : 0.22, 0.014));
  const border = oklabToRgb(shift(tint, mode === 'light' ? 0.86 : 0.34, 0.016));
  const text = oklabToRgb(shift(tint, mode === 'light' ? 0.22 : 0.95, 0.02));
  const muted = readableOn(shift(tint, mode === 'light' ? 0.55 : 0.72, 0.02), canvas, TEXT_CONTRAST);
  // A board with no shared colour is a neutral style: links and the main button take the text colour.
  const accent = accentSeen ? readableOn(accentSeen.lab, canvas, TEXT_CONTRAST) : text;
  const onAccent = accent ? [[255, 255, 255], text, canvas].sort((x, y) => contrast(y, accent) - contrast(x, accent))[0] : null;
  const support = supportSeen ? oklabToRgb(supportSeen.lab) : null;

  const role = (rgb, from, use, against) => rgb && ({ value: hex(rgb), from, use, ...(against ? { contrast: Math.round(contrast(rgb, against) * 100) / 100 } : {}) });
  const seen = s => `${s.hex} ${s.name}, ${s.members ? 'a hue in' : 'in'} ${s.pins} of ${count} pins`;
  const roles = {
    canvas: role(canvas, side ? `tint of ${seen(side)}` : 'no neutral on the board; plain', 'page background'),
    surface: role(surface, 'canvas, one step', 'cards and sheets'),
    border: role(border, 'canvas, two steps', 'dividers; too faint to be the only edge of a field'),
    text: role(text, 'canvas tint at the far end', 'body text', canvas),
    'text-muted': role(muted, 'text, softened until it still reads', 'secondary text', canvas),
    accent: role(accent, accentSeen ? `${seen(accentSeen)}, lightness moved until it reads on the canvas` : 'the text colour; the board shares no strong colour', 'links, the primary button, the one thing to notice', canvas),
    'on-accent': role(onAccent, 'whichever of white, text or canvas reads best on the accent', 'text on the primary button', accent),
    support: role(support, supportSeen ? seen(supportSeen) : '', 'decoration only: fills, illustration, charts. Not text unless checked', canvas),
  };
  for (const key of Object.keys(roles)) if (!roles[key]) delete roles[key];

  const problems = [];
  const notes = [];
  const total = swatches.reduce((sum, s) => sum + s.share, 0) || 1;
  const agreement = swatches.filter(s => s.pins >= count / 2).reduce((sum, s) => sum + s.share, 0) / total;
  if (agreement < MIN_AGREEMENT) problems.push(`Only ${Math.round(agreement * 100)}% of the board's colour is shared by half the pins or more. The pins do not agree on a palette.`);
  if (!accentSeen) notes.push(`No strong colour appears in ${quarter} or more pins. This reads as a neutral style: the accent is the text colour. Add a colour by hand if the product needs one.`);
  else if (accentSeen.pins < count / 2) problems.push(`The strongest colour (${accentSeen.hex}) is in ${accentSeen.pins} of ${count} pins. Under half the board backs it.`);
  if (accentSeen && !accent) problems.push(`No lightness of ${accentSeen.hex} reads on the canvas at ${TEXT_CONTRAST}:1.`);
  const lightPins = pinL.filter(L => L >= 0.6).length; const darkPins = count - lightPins;
  if (spread > 0.17) problems.push(`Light and dark pins are mixed: ${lightPins} light, ${darkPins} dark. Split the board in two, or remove the smaller group.`);
  if (contrast(text, canvas) < BODY_CONTRAST) problems.push('Body text does not reach 7:1 on the canvas.');
  // Odd ones are named only when they are a small group; half the board is not an exception.
  const far = pins.map((pin, i) => ({ file: pin.file, off: Math.abs(pinL[i] - meanL) })).filter(p => p.off > 0.25).sort((x, y) => y.off - x.off).map(p => p.file);
  const outliers = far.length <= count / 3 ? far : [];
  const mixed = problems.length > 0;
  return {
    status: mixed ? 1 : 0, verdict: mixed ? 'MIXED' : 'COHERENT', pins: count, mode, agreement: Math.round(agreement * 100),
    mood: {
      lightness: Math.round(meanL * 100) / 100,
      saturation: meanC < 0.05 ? 'muted' : meanC < 0.1 ? 'balanced' : 'vivid',
      temperature: warm > 0.01 ? 'warm' : warm < -0.01 ? 'cool' : 'neutral',
      contrast: swatches.length && Math.max(...swatches.map(s => s.lightness)) - Math.min(...swatches.map(s => s.lightness)) > 0.6 ? 'high' : 'soft',
    },
    swatches: swatches.map(({ lab, pinSet, ...rest }) => rest), roles, problems, notes, outliers,
  };
}

// W3C design-token shape, the same shape fe-extract writes. Colours only; type, spacing and radius are not in a photo.
export function proposedTokens(result) {
  const color = Object.fromEntries(Object.entries(result.roles).map(([name, r]) => [name, { $value: r.value, $type: 'color', $description: `${r.use}. From ${r.from}.` }]));
  return { $description: 'Proposed from a moodboard by fe-pinterest. Not applied. fe-extract and fe-system turn an approved copy into design/tokens.json.', color };
}

export function formatReport(name, result) {
  if (result.status === 2) return `PALETTE ${name}\nVERDICT TOO FEW  ${result.reason}`;
  const lines = [`PALETTE ${name}  ${result.pins} pins  ${result.mode}, ${result.mood.saturation}, ${result.mood.temperature}, ${result.mood.contrast} contrast  agreement ${result.agreement}%`, 'Seen on the board:'];
  for (const s of result.swatches) lines.push(`  ${s.hex}  ${String(s.share).padStart(4)}%  ${String(s.pins).padStart(2)}/${result.pins} pins  ${s.name}`);
  lines.push('Proposed roles:');
  for (const [key, r] of Object.entries(result.roles)) lines.push(`  ${key.padEnd(10)} ${r.value}${r.contrast ? `  ${r.contrast}:1` : ''}  ${r.use}`);
  for (const problem of result.problems) lines.push(`PROBLEM ${problem}`);
  for (const note of result.notes) lines.push(`NOTE ${note}`);
  if (result.outliers.length) lines.push(`ODD ONES ${result.outliers.join(', ')}`);
  lines.push(`VERDICT ${result.verdict}${result.status ? '  A style guide from this board is a guess until the problems are settled.' : ''}`);
  lines.push('Colour only. Type, shape, spacing and imagery are read from the pins by eye; see SKILL.md.');
  return lines.join('\n');
}

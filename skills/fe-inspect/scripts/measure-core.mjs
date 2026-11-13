// Pure pixel geometry for screenshot measurement. No I/O, no dependencies.
// Input is RGBA bytes (Uint8Array / Buffer), row-major, 4 bytes per pixel.
// Every function is deterministic: the same bytes always give the same box.

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function clampBox([x, y, w, h], width, height) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w));
  const y1 = Math.min(height, Math.ceil(y + h));
  if (x1 - x0 < 3 || y1 - y0 < 3) throw new Error(`search box [${x}, ${y}, ${w}, ${h}] is empty or outside the ${width}x${height} image`);
  return [x0, y0, x1, y1];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

// Background = per-channel median of the one-pixel ring around the search box.
export function ringBackground(rgba, width, height, search) {
  const [x0, y0, x1, y1] = clampBox(search, width, height);
  const r = [], g = [], b = [];
  const push = (x, y) => { const i = (y * width + x) * 4; r.push(rgba[i]); g.push(rgba[i + 1]); b.push(rgba[i + 2]); };
  for (let x = x0; x < x1; x++) { push(x, y0); push(x, y1 - 1); }
  for (let y = y0 + 1; y < y1 - 1; y++) { push(x0, y); push(x1 - 1, y); }
  return [median(r), median(g), median(b)];
}

const MODES = ['contrast', 'brighter', 'darker', 'match'];

// Median colour of the 5x5 block around a point. Used by `match` mode.
export function sampleColor(rgba, width, height, [sx, sy]) {
  const r = [], g = [], b = [];
  for (let y = Math.max(0, sy - 2); y <= Math.min(height - 1, sy + 2); y++) {
    for (let x = Math.max(0, sx - 2); x <= Math.min(width - 1, sx + 2); x++) {
      const i = (y * width + x) * 4;
      r.push(rgba[i]); g.push(rgba[i + 1]); b.push(rgba[i + 2]);
    }
  }
  if (!r.length) throw new Error(`sample point [${sx}, ${sy}] is outside the image`);
  return [median(r), median(g), median(b)];
}

function hitTest(rgba, width, height, search, { mode = 'contrast', threshold = 40, background, sample }) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}"`);
  if (mode === 'match') {
    const point = sample || [Math.round(search[0] + search[2] / 2), Math.round(search[1] + search[3] / 2)];
    const c = sampleColor(rgba, width, height, point);
    return (r, g, b) => Math.max(Math.abs(r - c[0]), Math.abs(g - c[1]), Math.abs(b - c[2])) <= threshold;
  }
  if (mode === 'contrast') {
    const bg = background || ringBackground(rgba, width, height, search);
    return (r, g, b) => Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) > threshold;
  }
  return mode === 'brighter' ? (r, g, b) => luma(r, g, b) > threshold : (r, g, b) => luma(r, g, b) < threshold;
}

const PICKS = ['all', 'largest'];
export const RADIUS_MIN_FILL = 0.75;
const RADIUS_ROW_CAP = 3;

// Zero every matching pixel that is not part of the biggest 8-connected shape.
// Returns how many separate shapes were found.
function keepLargest(mask, mw, mh) {
  const labels = new Int32Array(mw * mh);
  const stack = [];
  let count = 0, best = 0, bestSize = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    count++;
    let size = 0;
    labels[start] = count;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      size++;
      const px = p % mw, py = (p - px) / mw;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= mh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= mw) continue;
          const q = ny * mw + nx;
          if (mask[q] && !labels[q]) { labels[q] = count; stack.push(q); }
        }
      }
    }
    if (size > bestSize) { bestSize = size; best = count; }
  }
  for (let i = 0; i < mask.length; i++) if (mask[i] && labels[i] !== best) mask[i] = 0;
  return count;
}

/**
 * Corner radius of a filled shape, fitted to how far each row is inset near the corners.
 * A rounded corner of radius r insets row i by r - sqrt(r^2 - (r - i - 0.5)^2).
 * The fit uses every row of all four corners with a capped error per row, so a noisy
 * edge row does not decide it.
 * Returns pixels, to the nearest 0.5.
 */
export function fitCornerRadius(mask, mw, [bx, by, bw, bh]) {
  const n = Math.floor(Math.min(bw, bh) / 2);
  if (n < 2) return null;
  const half = Math.floor(bw / 2);
  const inset = (row, fromLeft) => {
    for (let k = 0; k < half; k++) if (mask[row * mw + (fromLeft ? bx + k : bx + bw - 1 - k)]) return k;
    return half;
  };
  const profiles = [];
  for (const top of [true, false]) for (const left of [true, false]) {
    const profile = new Float64Array(n);
    for (let i = 0; i < n; i++) profile[i] = inset(top ? by + i : by + bh - 1 - i, left);
    profiles.push(profile);
  }
  let bestR = 0, bestError = Infinity;
  for (let r = 0; r <= n + 0.5; r += 0.5) {
    let error = 0;
    for (let i = 0; i < n; i++) {
      const d = r - i - 0.5;
      const ideal = d > 0 ? Math.min(half, r - Math.sqrt(Math.max(0, r * r - d * d))) : 0;
      // Capped absolute error: a speckled edge row counts as one bad row, not as a large radius.
      for (const profile of profiles) error += Math.min(RADIUS_ROW_CAP, Math.abs(profile[i] - ideal));
    }
    if (error < bestError) { bestError = error; bestR = r; }
  }
  return bestR;
}

// Name the corner so a brief can say "capsule" instead of quoting a number.
export function cornerKind(box, radius) {
  if (radius === null || radius === undefined) return null;
  const short = Math.min(box[2], box[3]);
  if (radius <= 1.5) return 'square';
  if (radius >= short / 2 - 2) return Math.abs(box[2] - box[3]) <= 2 ? 'circle' : 'capsule';
  return 'rounded';
}

/**
 * Snap a rough search box to the element inside it.
 *
 * mode:
 *   contrast  pixel differs from the ring background by more than `threshold` on any channel
 *   brighter  pixel luma is above `threshold`
 *   darker    pixel luma is below `threshold`
 *   match     pixel is within `threshold` of the colour sampled at `sample` (default: centre of
 *             the search box). Use it for a filled shape that sits against other colours.
 * minRun: a row or column only counts when it holds at least this many matching pixels,
 *         which keeps JPEG speckle and one-pixel hairlines from stretching the box.
 * pick:   "all" (default) boxes everything that matched, which is right for a row of
 *         chips or labels. "largest" keeps only the biggest connected shape, which is
 *         right for one element when something else in the search area also matches.
 */
export function snapBox(rgba, width, height, search, { mode = 'contrast', threshold = 40, minRun = 3, background, sample, pick = 'all' } = {}) {
  if (rgba.length !== width * height * 4) throw new Error('pixel buffer does not match width x height');
  if (!PICKS.includes(pick)) throw new Error(`unknown pick "${pick}"`);
  const [x0, y0, x1, y1] = clampBox(search, width, height);
  const isHit = hitTest(rgba, width, height, search, { mode, threshold, background, sample });
  const mw = x1 - x0, mh = y1 - y0;
  const mask = new Uint8Array(mw * mh);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (isHit(rgba[i], rgba[i + 1], rgba[i + 2])) mask[(y - y0) * mw + (x - x0)] = 1;
    }
  }
  const components = pick === 'largest' ? keepLargest(mask, mw, mh) : null;
  const cols = new Uint32Array(mw);
  const rows = new Uint32Array(mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (mask[y * mw + x]) { cols[x]++; rows[y]++; }
  const first = (arr) => { for (let i = 0; i < arr.length; i++) if (arr[i] >= minRun) return i; return -1; };
  const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= minRun) return i; return -1; };
  const cx0 = first(cols), cx1 = last(cols), ry0 = first(rows), ry1 = last(rows);
  if (cx0 < 0 || ry0 < 0) return { found: false, reason: 'nothing in the search box passed the threshold' };
  const local = [cx0, ry0, cx1 - cx0 + 1, ry1 - ry0 + 1];
  const box = [x0 + cx0, y0 + ry0, local[2], local[3]];
  let area = 0;
  for (let y = ry0; y <= ry1; y++) for (let x = cx0; x <= cx1; x++) area += mask[y * mw + x];
  const touches = [];
  if (cx0 === 0) touches.push('left');
  if (ry0 === 0) touches.push('top');
  if (cx1 === cols.length - 1) touches.push('right');
  if (ry1 === rows.length - 1) touches.push('bottom');
  const fill = Number((area / (box[2] * box[3])).toFixed(3));
  return {
    found: true,
    box,
    // 1.00 = filled rectangle, ~0.79 = filled circle, low = outline or text.
    fill,
    // Corner radius in pixels, only for a filled shape; for a row of items it is the outer
    // corners of the first and last item. null for outlines and text, and in `match` mode,
    // where JPEG colour bleed rounds a square corner by 2 to 4 px.
    radius: fill >= RADIUS_MIN_FILL && mode !== 'match' ? fitCornerRadius(mask, mw, local) : null,
    ...(components === null ? {} : { components }),
    // A box that touches its search edge was cut off: widen the search and re-run.
    clipped: touches
  };
}

/**
 * Split a horizontal strip into the separate items inside it (chips, tabs, action cells).
 * Returns x-runs of columns that contain matching pixels, merged across gaps <= `join` px.
 */
export function splitRuns(rgba, width, height, search, { mode = 'contrast', threshold = 40, minRun = 3, join = 2, axis = 'x', background, sample } = {}) {
  const [x0, y0, x1, y1] = clampBox(search, width, height);
  const isHit = hitTest(rgba, width, height, search, { mode, threshold, background, sample });
  const along = axis === 'x' ? x1 - x0 : y1 - y0;
  const counts = new Uint32Array(along);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (isHit(rgba[i], rgba[i + 1], rgba[i + 2])) counts[axis === 'x' ? x - x0 : y - y0]++;
    }
  }
  const runs = [];
  let start = -1, gap = 0;
  for (let i = 0; i < along; i++) {
    if (counts[i] >= minRun) { if (start < 0) start = i; gap = 0; }
    else if (start >= 0 && ++gap > join) { runs.push([start, i - gap]); start = -1; gap = 0; }
  }
  if (start >= 0) runs.push([start, along - 1 - gap]);
  const origin = axis === 'x' ? x0 : y0;
  return runs.map(([a, b]) => ({ start: origin + a, size: b - a + 1 }));
}

// Fixed perturbations for the stability check. A measurement only counts if the same
// box comes back when the rough search box is moved or grown and the threshold nudged.
export const STABILITY = { shifts: [6, 12], grows: [8, 16], thresholdShare: 0.15, thresholdMin: 2, thresholdMax: 12 };

export function thresholdStep(threshold) {
  return Math.min(STABILITY.thresholdMax, Math.max(STABILITY.thresholdMin, Math.round(threshold * STABILITY.thresholdShare)));
}

/**
 * Measure one manifest region. `search` and `thresholdDelta` let the stability check
 * re-run it with a moved box or a nudged threshold. In `contrast` mode the background
 * comes from the ring of whichever search box is used; in `match` mode the sampled
 * point stays where the region put it.
 */
export function measureRegion(rgba, width, height, region, search = region.search, thresholdDelta = 0) {
  const mode = region.mode ?? 'contrast';
  const options = { mode, threshold: (region.threshold ?? 40) + thresholdDelta, minRun: region.min_run, pick: region.pick ?? 'all', background: region.background, sample: region.sample };
  if (mode === 'contrast' && !options.background) options.background = ringBackground(rgba, width, height, search);
  if (mode === 'match' && !options.sample) options.sample = [Math.round(region.search[0] + region.search[2] / 2), Math.round(region.search[1] + region.search[3] / 2)];
  return { options, snapped: snapBox(rgba, width, height, search, options) };
}

/**
 * Re-measure a region under every perturbation in STABILITY and compare with `baseBox`.
 *   agreed     the perturbed run returned the same box within `tolerance`
 *   refused    the perturbed run was cut off or found nothing (it would have been refused, not written)
 *   disagreed  the perturbed run returned a different box without any warning
 * A region is stable when nothing disagreed and at least one moved or grown box agreed.
 */
export function checkStability(rgba, width, height, region, baseBox, tolerance) {
  const [x, y, w, h] = region.search;
  const variants = [];
  for (const d of STABILITY.shifts) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) variants.push({ label: `search moved by ${dx},${dy} px`, search: [x + dx, y + dy, w, h], delta: 0, geometric: true });
  }
  for (const g of STABILITY.grows) variants.push({ label: `search grown by ${g} px`, search: [x - g, y - g, w + 2 * g, h + 2 * g], delta: 0, geometric: true });
  const step = thresholdStep(region.threshold ?? 40);
  for (const delta of [-step, step]) variants.push({ label: `threshold ${(region.threshold ?? 40) + delta}`, search: region.search, delta, geometric: false });

  const out = { variants: variants.length, agreed: 0, agreed_geometric: 0, refused: 0, disagreed: [], max_delta_px: 0 };
  for (const variant of variants) {
    let snapped;
    try { snapped = measureRegion(rgba, width, height, region, variant.search, variant.delta).snapped; } catch { out.refused++; continue; }
    if (!snapped.found || snapped.clipped.length) { out.refused++; continue; }
    const delta = Math.max(...snapped.box.map((n, i) => Math.abs(n - baseBox[i])));
    if (delta <= tolerance) { out.agreed++; if (variant.geometric) out.agreed_geometric++; out.max_delta_px = Math.max(out.max_delta_px, delta); }
    else out.disagreed.push({ variant: variant.label, box: snapped.box });
  }
  out.stable = out.disagreed.length === 0 && out.agreed_geometric > 0;
  return out;
}

/**
 * Logical screens that fit a screenshot's proportions. Modern iPhones differ by a fraction
 * of a percent in shape, so a resized screenshot often fits more than one: then the device
 * has to be confirmed by its owner, never assumed.
 * Source: https://iosref.com/res (checked 2026-11-13).
 */
export const DEVICES = [
  { pt: [440, 956], px: [1320, 2868], models: 'iPhone 16 Pro Max, 17 Pro Max, 18 Pro Max' },
  { pt: [430, 932], px: [1290, 2796], models: 'iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus' },
  { pt: [428, 926], px: [1284, 2778], models: 'iPhone 12 Pro Max, 13 Pro Max, 14 Plus' },
  { pt: [420, 912], px: [1260, 2736], models: 'iPhone Air' },
  { pt: [414, 896], px: [1242, 2688], models: 'iPhone XS Max, 11 Pro Max' },
  { pt: [414, 896], px: [828, 1792], models: 'iPhone XR, 11' },
  { pt: [402, 874], px: [1206, 2622], models: 'iPhone 16 Pro, 17, 17 Pro, 18 Pro' },
  { pt: [393, 852], px: [1179, 2556], models: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { pt: [390, 844], px: [1170, 2532], models: 'iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e, 17e' },
  { pt: [375, 812], px: [1125, 2436], models: 'iPhone X, XS, 11 Pro' },
  { pt: [375, 812], px: [1080, 2340], models: 'iPhone 12 mini, 13 mini' },
  { pt: [414, 736], px: [1080, 1920], models: 'iPhone 6 Plus to 8 Plus' },
  { pt: [375, 667], px: [750, 1334], models: 'iPhone 6 to 8, SE (2nd and 3rd generation)' },
  { pt: [320, 568], px: [640, 1136], models: 'iPhone 5, 5s, SE (1st generation)' }
];

// A resized screenshot has its sides rounded to whole pixels. A device fits when one
// scale factor turns its native width and height into this image's, to within that rounding.
export function deviceCandidates(imageWidth, imageHeight) {
  const fits = DEVICES
    .map(device => {
      const low = Math.max((imageWidth - 0.5) / device.px[0], (imageHeight - 0.5) / device.px[1]);
      const high = Math.min((imageWidth + 0.5) / device.px[0], (imageHeight + 0.5) / device.px[1]);
      return { ...device, slack: high - low };
    })
    .filter(device => device.slack >= 0)
    .sort((a, b) => b.slack - a.slack)
    .map(({ slack, ...device }) => ({ ...device, px_per_pt: Number((imageWidth / device.pt[0]).toFixed(3)), native: imageWidth === device.px[0] && imageHeight === device.px[1] }));
  // An untouched screenshot has the device's own pixel size, which settles it.
  const native = fits.filter(device => device.native);
  // Phones that share a logical screen are one candidate.
  const merged = new Map();
  for (const device of native.length ? native : fits) {
    const key = device.pt.join('x');
    if (merged.has(key)) merged.get(key).models += `, ${device.models}`;
    else merged.set(key, { pt: device.pt, models: device.models, px_per_pt: device.px_per_pt, native: device.native });
  }
  return [...merged.values()];
}

/**
 * Express a pixel box in device-independent units.
 * ratio_w / ratio_h are fractions of the screenshot and are always reported.
 * pt is only reported when the logical viewport is known; otherwise it is null,
 * never guessed.
 */
export function toUnits(box, image, viewportPt, radius = null) {
  const [x, y, w, h] = box;
  const round = (n, d = 4) => Number(n.toFixed(d));
  const out = {
    px: { x, y, w, h, right: image.width - x - w, bottom: image.height - y - h },
    ratio: { x: round(x / image.width), y: round(y / image.height), w: round(w / image.width), h: round(h / image.height) },
    pt: null
  };
  if (radius !== null) out.px.radius = radius;
  if (Array.isArray(viewportPt) && viewportPt.length === 2 && viewportPt.every(n => Number.isFinite(n) && n > 0)) {
    const sx = viewportPt[0] / image.width, sy = viewportPt[1] / image.height;
    // A screenshot scaled evenly has sx === sy. More than 1% apart means the viewport is wrong.
    if (Math.abs(sx - sy) / sx > 0.01) throw new Error(`viewport ${viewportPt.join('x')} pt does not match the ${image.width}x${image.height} image aspect`);
    const p = (n, s) => round(n * s, 1);
    out.pt = { x: p(x, sx), y: p(y, sy), w: p(w, sx), h: p(h, sy), right: p(image.width - x - w, sx), bottom: p(image.height - y - h, sy), px_per_pt: round(1 / sx, 3) };
    if (radius !== null) out.pt.radius = p(radius, sx);
  }
  return out;
}

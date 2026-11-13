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
 */
export function snapBox(rgba, width, height, search, { mode = 'contrast', threshold = 40, minRun = 3, background, sample } = {}) {
  if (rgba.length !== width * height * 4) throw new Error('pixel buffer does not match width x height');
  const [x0, y0, x1, y1] = clampBox(search, width, height);
  const isHit = hitTest(rgba, width, height, search, { mode, threshold, background, sample });
  const cols = new Uint32Array(x1 - x0);
  const rows = new Uint32Array(y1 - y0);
  let area = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (isHit(rgba[i], rgba[i + 1], rgba[i + 2])) { cols[x - x0]++; rows[y - y0]++; area++; }
    }
  }
  const first = (arr) => { for (let i = 0; i < arr.length; i++) if (arr[i] >= minRun) return i; return -1; };
  const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= minRun) return i; return -1; };
  const cx0 = first(cols), cx1 = last(cols), ry0 = first(rows), ry1 = last(rows);
  if (cx0 < 0 || ry0 < 0) return { found: false, reason: 'nothing in the search box passed the threshold' };
  const box = [x0 + cx0, y0 + ry0, cx1 - cx0 + 1, ry1 - ry0 + 1];
  const touches = [];
  if (cx0 === 0) touches.push('left');
  if (ry0 === 0) touches.push('top');
  if (cx1 === cols.length - 1) touches.push('right');
  if (ry1 === rows.length - 1) touches.push('bottom');
  return {
    found: true,
    box,
    // 1.00 = filled rectangle, ~0.79 = filled circle, low = outline or text.
    fill: Number((area / (box[2] * box[3])).toFixed(3)),
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

/**
 * Express a pixel box in device-independent units.
 * ratio_w / ratio_h are fractions of the screenshot and are always reported.
 * pt is only reported when the logical viewport is known; otherwise it is null,
 * never guessed.
 */
export function toUnits(box, image, viewportPt) {
  const [x, y, w, h] = box;
  const round = (n, d = 4) => Number(n.toFixed(d));
  const out = {
    px: { x, y, w, h, right: image.width - x - w, bottom: image.height - y - h },
    ratio: { x: round(x / image.width), y: round(y / image.height), w: round(w / image.width), h: round(h / image.height) },
    pt: null
  };
  if (Array.isArray(viewportPt) && viewportPt.length === 2 && viewportPt.every(n => Number.isFinite(n) && n > 0)) {
    const sx = viewportPt[0] / image.width, sy = viewportPt[1] / image.height;
    // A screenshot scaled evenly has sx === sy. More than 1% apart means the viewport is wrong.
    if (Math.abs(sx - sy) / sx > 0.01) throw new Error(`viewport ${viewportPt.join('x')} pt does not match the ${image.width}x${image.height} image aspect`);
    const p = (n, s) => round(n * s, 1);
    out.pt = { x: p(x, sx), y: p(y, sy), w: p(w, sx), h: p(h, sy), right: p(image.width - x - w, sx), bottom: p(image.height - y - h, sy), px_per_pt: round(1 / sx, 3) };
  }
  return out;
}

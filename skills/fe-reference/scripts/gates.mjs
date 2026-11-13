#!/usr/bin/env node
// fe-reference gates as code. Pure checks plus a small CLI.
//
//   node gates.mjs --matrix <matrix.json>
//   node gates.mjs --tokens <tokens.json>
//   node gates.mjs --brief <borrow-tweak-elevate.md> [--references <dir>]
//   node gates.mjs --counts <counts.json>
//
// Any combination may be passed. Exit 0 = every requested gate passed, 1 = a gate failed.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REFERENCES = resolve(here, '../references');
const SCHEMA = resolve(here, '../templates/matrix.schema.json');
export const SUBTRACTION_SHARE = 0.2;

// Matrix: weights are the fixed ones, every score has a source, and the named winner
// is the candidate the numbers actually select. A tie is not a decision.
export function checkMatrix(matrix, fixedWeights = JSON.parse(readFileSync(SCHEMA, 'utf8'))['x-fixed-weights']) {
  const failures = [];
  const ids = Object.keys(fixedWeights);
  const weights = Object.fromEntries((matrix.criteria ?? []).map(c => [c.id, c.weight]));
  for (const id of ids) {
    if (weights[id] !== fixedWeights[id]) failures.push(`criteria: weight for "${id}" is ${weights[id] ?? 'missing'}, fixed at ${fixedWeights[id]}`);
  }
  if (!Array.isArray(matrix.candidates) || matrix.candidates.length < 2) return [...failures, 'candidates: at least two are required; one candidate is not a decision'];
  const totals = [];
  for (const candidate of matrix.candidates) {
    let total = 0;
    for (const id of ids) {
      const score = candidate.scores?.[id];
      if (!score || !Number.isInteger(score.value) || score.value < 1 || score.value > 5) { failures.push(`${candidate.id}: "${id}" needs a whole-number score from 1 to 5`); continue; }
      if (typeof score.source !== 'string' || score.source.trim().length < 5) failures.push(`${candidate.id}: "${id}" has no source`);
      total += score.value * fixedWeights[id];
    }
    totals.push({ id: candidate.id, total });
  }
  totals.sort((a, b) => b.total - a.total);
  if (totals.length > 1 && totals[0].total === totals[1].total) failures.push(`tie between "${totals[0].id}" and "${totals[1].id}" at ${totals[0].total}; gather more evidence, do not pick by taste`);
  else if (matrix.winner !== totals[0].id) failures.push(`winner is recorded as "${matrix.winner}" but the scores select "${totals[0].id}" (${totals.map(t => `${t.id} ${t.total}`).join(', ')})`);
  return failures;
}

// G1 provenance and G2 calibration on a tokens.json written by fe-inspect/measure-shot.
// A token is only trusted when it was re-measured under at least this many perturbations.
export const STABILITY_MIN_VARIANTS = 20;

export function checkTokens(document) {
  const failures = [];
  if (document.kind !== 'reference') failures.push('kind: tokens must come from a reference app, not from the product being redesigned');
  if (typeof document.app !== 'string' || !document.app.trim()) failures.push('app: the reference app is not named');
  const tolerance = document.tolerance_px, error = document.calibration?.max_error_px;
  if (!Number.isFinite(tolerance) || !Number.isFinite(error)) failures.push('G2: no calibration result recorded; measure with fe-inspect/scripts/measure-shot.mjs');
  else if (error > tolerance) failures.push(`G2: calibration error ${error}px exceeds the ${tolerance}px tolerance`);
  const radiusError = document.calibration?.max_radius_error_px;
  if (Number.isFinite(tolerance) && Number.isFinite(error)) {
    if (!Number.isFinite(radiusError)) failures.push('G2: no corner-radius calibration recorded; re-measure with the current fe-inspect/scripts/measure-shot.mjs');
    else if (radiusError > tolerance) failures.push(`G2: corner-radius calibration error ${radiusError}px exceeds the ${tolerance}px tolerance`);
  }
  if (!Array.isArray(document.tokens) || document.tokens.length === 0) return [...failures, 'G1: no tokens'];
  for (const token of document.tokens) {
    const from = token.measured_from ?? {};
    const okBox = Array.isArray(from.box) && from.box.length === 4 && from.box.every(Number.isFinite);
    if (!from.shot || !/^[a-f0-9]{64}$/.test(String(from.sha256)) || !okBox) failures.push(`G1: "${token.name}" lacks measured_from (shot id, file hash and pixel box)`);
    if (document.viewport_pt === null && token.pt !== null && token.pt !== undefined) failures.push(`G1: "${token.name}" reports points although the viewport is unknown`);
    // G2 stability: the box must have come back unchanged when the search box was moved and
    // grown. A box that was allowed to touch its search edge cannot be re-tested and says so.
    const stability = token.stability;
    const skipped = stability?.skipped === 'allow_clip';
    const confirmed = Number.isInteger(stability?.variants) && stability.variants >= STABILITY_MIN_VARIANTS
      && Number.isInteger(stability.agreed) && Number.isInteger(stability.agreed_moved_or_grown) && stability.agreed_moved_or_grown >= 1 && stability.agreed >= stability.agreed_moved_or_grown
      && Number.isInteger(stability.refused) && stability.agreed + stability.refused === stability.variants
      && Number.isFinite(stability.max_delta_px) && Number.isFinite(tolerance) && stability.max_delta_px <= tolerance;
    if (!skipped && !confirmed) failures.push(`G2: "${token.name}" has no passing stability record; re-measure with the current fe-inspect/scripts/measure-shot.mjs`);
  }
  return failures;
}

// Pattern ids that may be cited in a brief: present in the library and measured.
export function citablePatterns(referencesDir = DEFAULT_REFERENCES) {
  const out = new Map();
  for (const folder of readdirSync(referencesDir)) {
    const file = join(referencesDir, folder, 'patterns.md');
    if (!statSync(join(referencesDir, folder)).isDirectory() || !existsSync(file)) continue;
    for (const block of readFileSync(file, 'utf8').split(/^### /m).slice(1)) {
      const id = block.split(/\s+/)[0];
      const measured = (block.match(/^- measured:\s*(.*)$/m)?.[1] ?? '').trim();
      out.set(id, { app: folder, measured: measured.length > 0 && !/^TODO/i.test(measured) });
    }
  }
  return out;
}

export function checkCitations(briefText, referencesDir = DEFAULT_REFERENCES) {
  const library = citablePatterns(referencesDir);
  const prefixes = new Set([...library.keys()].map(id => id.split('-')[0]));
  const cited = [...new Set(String(briefText).match(/\b[a-z]{2,}-\d{2}\b/g) ?? [])].filter(id => prefixes.has(id.split('-')[0]));
  const failures = [];
  if (cited.length === 0) failures.push('brief cites no pattern id; every borrow, tweak and elevate item must cite one');
  for (const id of cited) {
    const entry = library.get(id);
    if (!entry) failures.push(`${id}: not in the reference library`);
    else if (!entry.measured) failures.push(`${id}: still unmeasured (${entry.app}); a candidate pattern cannot be cited until fe-inspect has measured it`);
  }
  return failures;
}

/**
 * G3 subtraction. Counts are interactive elements for the same screen state and fixture.
 *   before     the product's own screen before the change
 *   after      the redesigned screen
 *   reference  the reference app's screen (optional)
 * Passes when the redesign removed at least 20% of the controls, or is already no
 * heavier than the reference. It never passes when controls were added.
 */
export function checkSubtraction({ before, after, reference }) {
  const whole = (n) => Number.isInteger(n) && n >= 0;
  if (!whole(before) || !whole(after)) return ['G3: "before" and "after" interactive element counts are required'];
  if (reference !== undefined && reference !== null && !whole(reference)) return ['G3: "reference" must be a whole number when given'];
  if (after > before) return [`G3: the redesign has more controls than before (${before} -> ${after})`];
  const target = Math.floor(before * (1 - SUBTRACTION_SHARE));
  if (after <= target) return [];
  if (whole(reference) && after <= reference) return [];
  return [`G3: ${before} -> ${after} controls; needs ${target} or fewer (20% less)${whole(reference) ? `, or ${reference} or fewer to match the reference` : ''}`];
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
  const report = [];
  if (arg('--matrix')) report.push(['matrix', checkMatrix(read(arg('--matrix')))]);
  if (arg('--tokens')) report.push(['tokens (G1, G2)', checkTokens(read(arg('--tokens')))]);
  if (arg('--brief')) report.push(['citations', checkCitations(readFileSync(arg('--brief'), 'utf8'), arg('--references') ? resolve(arg('--references')) : DEFAULT_REFERENCES)]);
  if (arg('--counts')) report.push(['subtraction (G3)', checkSubtraction(read(arg('--counts')))]);
  if (!report.length) { console.error('usage: gates.mjs [--matrix f] [--tokens f] [--brief f [--references dir]] [--counts f]'); return 2; }
  let failed = 0;
  for (const [name, failures] of report) {
    if (failures.length === 0) { console.log(`PASS ${name}`); continue; }
    failed += failures.length;
    console.error(`FAIL ${name}`);
    for (const failure of failures) console.error(`  - ${failure}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));

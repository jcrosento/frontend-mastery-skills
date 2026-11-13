// Provenance rules for reference screenshots. Pure validation, no I/O beyond the
// hash helper. A measurement run refuses to start until the manifest passes.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SOURCES = ['user-capture', 'store-listing', 'official-doc'];
const PLACEHOLDER = /^\s*$|todo|tbd|<[^>]*>|\[[^\]]*\]|^(unknown|n\/a|none|example|placeholder|app|reference)$/i;
const slug = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Returns a list of human-readable problems. Empty list = the manifest may be measured.
 *
 * project: the product being redesigned. Its own screenshots are a baseline, never a reference.
 * hashOf:  (file) => sha256 hex, or null when the file is missing. Injected so tests need no files.
 */
export function validateManifest(manifest, { project, hashOf } = {}) {
  const problems = [];
  const bad = (message) => problems.push(message);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest must be a JSON object'];
  if (!project || PLACEHOLDER.test(project)) bad('--project is required: name the product being redesigned so its own screenshots can be refused');

  if (typeof manifest.app !== 'string' || PLACEHOLDER.test(manifest.app)) bad('app: name the reference app these screenshots show (for example "ios-camera"); placeholders are refused');
  if (manifest.kind !== 'reference') bad(`kind: must be "reference" (got ${JSON.stringify(manifest.kind)}); screenshots of your own product are a baseline for fe-scan, not a reference`);
  if (project && manifest.app && slug(project) && slug(manifest.app).includes(slug(project))) bad(`app "${manifest.app}" is the project being redesigned ("${project}"); a product cannot be its own reference`);
  if (!SOURCES.includes(manifest.source)) bad(`source: must be one of ${SOURCES.join(', ')}`);
  if (typeof manifest.platform !== 'string' || PLACEHOLDER.test(manifest.platform)) bad('platform: state the OS and version shown in the screenshots');
  if (typeof manifest.captured !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(manifest.captured)) bad('captured: ISO date (YYYY-MM-DD) the screenshots were taken or supplied');

  const vp = manifest.viewport_pt;
  if (vp !== null && !(Array.isArray(vp) && vp.length === 2 && vp.every(n => Number.isFinite(n) && n > 0))) bad('viewport_pt: [width, height] in points, or null when the device is not known');
  if (vp !== null && (typeof manifest.viewport_basis !== 'string' || manifest.viewport_basis.trim().length < 10)) bad('viewport_basis: say how the viewport is known (device model, or the measurement it was inferred from)');

  if (!Array.isArray(manifest.shots) || manifest.shots.length === 0) return [...problems, 'shots: at least one screenshot is required'];
  const ids = new Set();
  manifest.shots.forEach((shot, index) => {
    const at = `shots[${index}]`;
    if (typeof shot.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(shot.id)) bad(`${at}.id: lowercase letters, digits and dashes`);
    else if (ids.has(shot.id)) bad(`${at}.id: "${shot.id}" is used twice`);
    else ids.add(shot.id);
    if (typeof shot.file !== 'string' || PLACEHOLDER.test(shot.file)) bad(`${at}.file: path to the screenshot, relative to the manifest`);
    if (typeof shot.screen !== 'string' || PLACEHOLDER.test(shot.screen)) bad(`${at}.screen: say which screen and state of ${manifest.app || 'the app'} this is`);
    if (typeof shot.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(shot.sha256)) bad(`${at}.sha256: 64-character hash of the file (run measure-shot.mjs --hash <file>)`);
    else if (hashOf && typeof shot.file === 'string') {
      const actual = hashOf(shot.file);
      if (actual === null) bad(`${at}.file: "${shot.file}" not found`);
      else if (actual !== shot.sha256) bad(`${at}.sha256: file content does not match the recorded hash; the screenshot was replaced after it was labelled`);
    }
    if (!Array.isArray(shot.regions) || shot.regions.length === 0) bad(`${at}.regions: at least one region to measure`);
    else {
      const names = new Set();
      shot.regions.forEach((region, r) => {
        const rat = `${at}.regions[${r}]`;
        if (typeof region.name !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(region.name)) bad(`${rat}.name: lowercase token name such as "shutter" or "mode-pill.selected"`);
        else if (names.has(region.name)) bad(`${rat}.name: "${region.name}" is used twice in this shot`);
        else names.add(region.name);
        if (!(Array.isArray(region.search) && region.search.length === 4 && region.search.every(Number.isFinite))) bad(`${rat}.search: [x, y, width, height] in screenshot pixels`);
        if (region.mode !== undefined && !['contrast', 'brighter', 'darker', 'match'].includes(region.mode)) bad(`${rat}.mode: contrast, brighter, darker or match`);
        if (region.sample !== undefined && !(Array.isArray(region.sample) && region.sample.length === 2 && region.sample.every(Number.isFinite))) bad(`${rat}.sample: [x, y] in screenshot pixels`);
      });
    }
  });
  return problems;
}

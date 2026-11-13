// Landmarks lock: presence, order and label. Never geometry.
// Pure functions, no I/O, no dependencies, so an app's own test runner can import this file.
//
// census = { landmarks: [{ id, label }], interactive: <count> } in document order.

const GEOMETRY_KEYS = ['x', 'y', 'width', 'height', 'top', 'left', 'right', 'bottom', 'box', 'position', 'px', 'offset'];
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

export function validateLock(lock) {
  const problems = [];
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) return ['lock must be a JSON object'];
  if (lock.version !== 1) problems.push('version: must be 1');
  if (lock.mode !== 'presence-order-label') problems.push('mode: must be "presence-order-label"');
  if (lock.attribute !== undefined && !/^[a-z][a-z0-9-]*$/.test(String(lock.attribute))) problems.push('attribute: an HTML attribute name such as "data-testid"');
  if (!Array.isArray(lock.states) || lock.states.length === 0) return [...problems, 'states: at least one screen state is required'];
  const stateIds = new Set();
  lock.states.forEach((state, s) => {
    const at = `states[${s}]`;
    if (typeof state.id !== 'string' || !state.id.trim()) problems.push(`${at}.id: required`);
    else if (stateIds.has(state.id)) problems.push(`${at}.id: "${state.id}" is used twice`);
    else stateIds.add(state.id);
    if (!Array.isArray(state.landmarks) || state.landmarks.length === 0) problems.push(`${at}.landmarks: at least one landmark`);
    if (state.absent !== undefined && !(Array.isArray(state.absent) && state.absent.every(a => typeof a === 'string' && a))) problems.push(`${at}.absent: list of landmark ids that must not be on this screen`);
    if (state.max_interactive !== undefined && !(Number.isInteger(state.max_interactive) && state.max_interactive > 0)) problems.push(`${at}.max_interactive: positive whole number`);
    const seen = new Set();
    (state.landmarks ?? []).forEach((mark, m) => {
      const mat = `${at}.landmarks[${m}]`;
      if (typeof mark.id !== 'string' || !mark.id.trim()) problems.push(`${mat}.id: required`);
      else if (seen.has(mark.id)) problems.push(`${mat}.id: "${mark.id}" is listed twice in this state`);
      else seen.add(mark.id);
      if (mark.match !== undefined && !['exact', 'prefix'].includes(mark.match)) problems.push(`${mat}.match: "exact" or "prefix"`);
      if (mark.label !== undefined && typeof mark.label !== 'string') problems.push(`${mat}.label: string`);
      for (const key of ['labels', 'contains']) {
        if (mark[key] !== undefined && !(Array.isArray(mark[key]) && mark[key].length && mark[key].every(v => typeof v === 'string' && v))) problems.push(`${mat}.${key}: non-empty list of strings`);
      }
      if (mark.label !== undefined && mark.labels !== undefined) problems.push(`${mat}: use "label" or "labels", not both`);
      for (const key of Object.keys(mark)) {
        if (GEOMETRY_KEYS.includes(key)) problems.push(`${mat}.${key}: geometry cannot be locked; screens reflow, so lock presence, order and label only`);
      }
    });
  });
  return problems;
}

const matches = (mark, id) => (mark.match === 'prefix' ? id.startsWith(mark.id) : id === mark.id);

export function checkLock(lock, stateId, census) {
  const problems = validateLock(lock);
  if (problems.length) return { ok: false, failures: problems.map(detail => ({ kind: 'invalid-lock', landmark: null, detail })) };
  const state = lock.states.find(s => s.id === stateId);
  if (!state) return { ok: false, failures: [{ kind: 'unknown-state', landmark: null, detail: `state "${stateId}" is not in the lock (known: ${lock.states.map(s => s.id).join(', ')})` }] };
  if (!census || !Array.isArray(census.landmarks)) return { ok: false, failures: [{ kind: 'invalid-census', landmark: null, detail: 'census.landmarks must be a list of { id, label } in document order' }] };

  const failures = [];
  const positions = [];
  for (const mark of state.landmarks) {
    const hits = census.landmarks.map((item, index) => ({ ...item, index })).filter(item => matches(mark, String(item.id)));
    if (hits.length === 0) {
      if (mark.optional) continue;
      failures.push({ kind: 'missing', landmark: mark.id, detail: 'not on the screen' });
      continue;
    }
    for (const hit of hits) {
      const label = clean(hit.label);
      if (mark.label !== undefined && label !== clean(mark.label)) failures.push({ kind: 'label', landmark: hit.id, detail: `label is "${label}", locked as "${clean(mark.label)}"` });
      if (mark.labels && !mark.labels.map(clean).includes(label)) failures.push({ kind: 'label', landmark: hit.id, detail: `label is "${label}", locked as one of: ${mark.labels.join(' | ')}` });
      for (const part of mark.contains ?? []) {
        if (!label.includes(clean(part))) failures.push({ kind: 'label', landmark: hit.id, detail: `text no longer contains "${part}"` });
      }
    }
    if (mark.order !== false) positions.push({ id: mark.id, index: hits[0].index });
  }
  for (let i = 1; i < positions.length; i++) {
    if (positions[i].index < positions[i - 1].index) failures.push({ kind: 'order', landmark: positions[i].id, detail: `now appears before "${positions[i - 1].id}"; the locked order puts it after` });
  }
  for (const id of state.absent ?? []) {
    if (census.landmarks.some(item => String(item.id) === id)) failures.push({ kind: 'forbidden', landmark: id, detail: 'must not appear in this state' });
  }
  if (state.max_interactive !== undefined) {
    if (!Number.isInteger(census.interactive)) failures.push({ kind: 'interactive', landmark: null, detail: 'census has no interactive element count' });
    else if (census.interactive > state.max_interactive) failures.push({ kind: 'interactive', landmark: null, detail: `${census.interactive} interactive elements, ceiling is ${state.max_interactive}; a redesign may remove controls, not add them` });
  }
  return { ok: failures.length === 0, failures, interactive: census.interactive ?? null };
}

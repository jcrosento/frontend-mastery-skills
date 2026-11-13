// UI-only change contract. Pure functions, no I/O, no dependencies.
// guard.mjs feeds these with git output; tests feed them with plain data.

export const DEFAULT_NETWORK_PATTERNS = [
  '\\bfetch\\s*\\(',
  '\\baxios\\b',
  '\\bapiRequest\\s*\\(',
  '\\buse(Query|Mutation|InfiniteQuery|SWR)\\s*[(<]',
  '\\bqueryKey\\s*:',
  '\\bqueryFn\\s*:',
  '\\bmutationFn\\s*:',
  '\\bXMLHttpRequest\\b',
  '\\bWebSocket\\s*\\(',
  '\\bEventSource\\s*\\(',
  '\\bsendBeacon\\s*\\(',
  '["\'`]/api/'
];

// Small glob: `**` any depth, `*` within one segment, `?` one character. Paths use `/`.
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; out += '(?:.*/)?'; } else out += '.*';
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

const normalise = (path) => String(path).replaceAll('\\', '/').replace(/^\.\//, '');
export const matchAny = (path, globs) => globs.some(glob => globToRegExp(glob).test(normalise(path)));

export function validateConfig(config) {
  const problems = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['guard config must be a JSON object'];
  if (config.version !== 1) problems.push('version: must be 1');
  for (const key of ['ui', 'frozen']) {
    if (!Array.isArray(config[key]) || config[key].length === 0 || !config[key].every(g => typeof g === 'string' && g.trim())) problems.push(`${key}: non-empty list of path globs`);
  }
  for (const key of ['protected', 'variants', 'network_patterns', 'network_extra', 'network_ignore']) {
    if (config[key] !== undefined && !(Array.isArray(config[key]) && config[key].every(g => typeof g === 'string' && g.trim()))) problems.push(`${key}: list of strings when present`);
  }
  if (Array.isArray(config.ui) && config.ui.some(g => ['**', '**/*', '*'].includes(g.trim()))) problems.push('ui: a catch-all glob allows every file; list the UI folders instead');
  for (const key of ['network_patterns', 'network_extra', 'network_ignore']) {
    for (const pattern of Array.isArray(config[key]) ? config[key] : []) {
      try { new RegExp(pattern); } catch { problems.push(`${key}: "${pattern}" is not a valid regular expression`); }
    }
  }
  return problems;
}

/**
 * changes: [{ status: 'A'|'M'|'D'|'R'|'C'|'?', path, from? }]
 * Rule 1  a frozen path never changes in a UI change.
 * Rule 2  every other changed path must sit inside `ui`.
 * Rule 3  a protected path (the guard config, the landmarks lock, its tests) may only
 *         change in a change set that touches nothing else, so a redesign cannot
 *         loosen the rules it is judged by.
 */
export function classifyPaths(changes, config) {
  const violations = [];
  const touched = [];
  for (const change of changes) {
    for (const path of [change.path, change.from].filter(Boolean)) touched.push({ path: normalise(path), status: change.status });
  }
  const protectedGlobs = config.protected ?? [];
  const isProtected = ({ path }) => matchAny(path, protectedGlobs);
  const protectedTouched = touched.filter(isProtected);
  const others = touched.filter(t => !isProtected(t));
  if (protectedTouched.length && others.length) {
    for (const t of protectedTouched) violations.push({ rule: 'protected', path: t.path, detail: 'the guard config, lock and lock tests change only in their own pull request, with nothing else in it' });
  }
  for (const t of others) {
    if (matchAny(t.path, config.frozen)) violations.push({ rule: 'frozen', path: t.path, detail: 'frozen for UI work: backend, data, auth, config or dependency file' });
    else if (!matchAny(t.path, config.ui)) violations.push({ rule: 'outside-ui', path: t.path, detail: 'not inside the allowed UI paths' });
  }
  return violations;
}

/**
 * Compare network-facing lines added and removed by a unified diff.
 * A line that moves unchanged (same text, whitespace aside) is fine. Anything
 * added without an identical removal, or removed without an identical addition,
 * is a change to how the UI talks to the backend.
 */
export function networkDelta(diffText, patterns = DEFAULT_NETWORK_PATTERNS, ignore = []) {
  const tests = patterns.map(p => new RegExp(p));
  const skip = ignore.map(p => new RegExp(p));
  const added = new Map(), removed = new Map();
  let file = '', inHeader = false;
  for (const raw of String(diffText).split('\n')) {
    // File headers sit between `diff --git` and the first `@@`. Outside that block a line
    // starting with +++ or --- is real content, not a header.
    if (raw.startsWith('diff --git ')) { inHeader = true; continue; }
    if (raw.startsWith('@@')) { inHeader = false; continue; }
    if (inHeader) { if (raw.startsWith('+++ ')) file = raw.slice(4).replace(/^b\//, ''); continue; }
    const sign = raw[0];
    if (sign !== '+' && sign !== '-') continue;
    const text = raw.slice(1).replace(/\s+/g, ' ').trim();
    if (!text || text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) continue;
    if (!tests.some(t => t.test(text)) || skip.some(t => t.test(text))) continue;
    const bucket = sign === '+' ? added : removed;
    const entry = bucket.get(text) ?? { count: 0, files: new Set() };
    entry.count++;
    if (file) entry.files.add(file);
    bucket.set(text, entry);
  }
  const violations = [];
  for (const [text, entry] of added) {
    const extra = entry.count - (removed.get(text)?.count ?? 0);
    if (extra > 0) violations.push({ rule: 'network-added', path: [...entry.files].join(', '), detail: text });
  }
  for (const [text, entry] of removed) {
    const extra = entry.count - (added.get(text)?.count ?? 0);
    if (extra > 0) violations.push({ rule: 'network-removed', path: '(removed)', detail: text });
  }
  return violations;
}

export function leftoverVariants(trackedFiles, config) {
  const globs = config.variants ?? [];
  return trackedFiles.map(normalise).filter(path => matchAny(path, globs))
    .map(path => ({ rule: 'variant-leftover', path, detail: 'variant code must be deleted before merge; only the chosen design stays' }));
}

export function evaluate({ changes, diff = '', trackedFiles = [], config, final = false }) {
  const problems = validateConfig(config);
  if (problems.length) return { ok: false, configProblems: problems, violations: [] };
  const violations = [
    ...classifyPaths(changes, config),
    // network_patterns replaces the defaults; network_extra adds the app's own data hooks to them.
    ...networkDelta(diff, [...(config.network_patterns ?? DEFAULT_NETWORK_PATTERNS), ...(config.network_extra ?? [])], config.network_ignore ?? []),
    ...(final ? leftoverVariants(trackedFiles, config) : [])
  ];
  return { ok: violations.length === 0, configProblems: [], violations };
}

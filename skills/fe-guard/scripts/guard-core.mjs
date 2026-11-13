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
  if (config.derive_data_names !== undefined && typeof config.derive_data_names !== 'boolean') problems.push('derive_data_names: true or false when present');
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

export const networkPatterns = (config) => [...(config.network_patterns ?? DEFAULT_NETWORK_PATTERNS), ...(config.network_extra ?? [])];

export function evaluate({ changes, diff = '', trackedFiles = [], config, final = false, derivedPatterns = [] }) {
  const problems = validateConfig(config);
  if (problems.length) return { ok: false, configProblems: problems, violations: [] };
  const violations = [
    ...classifyPaths(changes, config),
    // network_patterns replaces the defaults; network_extra adds names by hand; derivedPatterns are
    // the data functions found in the code itself, so the list cannot go stale.
    ...networkDelta(diff, [...networkPatterns(config), ...derivedPatterns], config.network_ignore ?? []),
    ...(final ? leftoverVariants(trackedFiles, config) : [])
  ];
  return { ok: violations.length === 0, configProblems: [], violations };
}

// ---------------------------------------------------------------------------------------------
// Data names: functions that reach the backend, found by reading the code.
//
// A hand-typed list of data hooks is always incomplete. These functions read the source files
// and return every exported function that talks to the network, directly or through another
// such function, so a UI change that starts calling one is caught without anyone listing it.
// Textual, not a parser: it relies on top-level declarations starting in column 0, which is
// how formatted code is written. A file it cannot split is treated as one block (all exports).
// ---------------------------------------------------------------------------------------------

export const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const DECLARATION = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)|(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*))/;
const TOP_LEVEL = /^(?:export|import|function|async\s+function|const|let|var|class|abstract\s+class|type|interface|enum|declare|namespace)\b/;
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const escapeName = (name) => name.replace(/[$]/g, '\\$&');
const refersCache = new Map();
const refersTo = (name) => { let re = refersCache.get(name); if (!re) { re = new RegExp(`(?<![.\\w$])${escapeName(name)}(?![\\w$])`); refersCache.set(name, re); } return re; };

/** Split a module into its top-level declarations: [{ name, exported, body }]. */
export function topLevelSegments(source) {
  const lines = stripComments(String(source)).split('\n');
  const segments = [];
  let current = null;
  const listed = new Set();
  for (const line of lines) {
    if (TOP_LEVEL.test(line)) {
      const match = DECLARATION.exec(line);
      current = match ? { name: match[1] || match[2] || match[3], exported: /^export\b/.test(line), body: line } : null;
      if (current) segments.push(current);
      continue;
    }
    if (current) current.body += '\n' + line;
  }
  // `export { a, b as c }` and `export default a` mark earlier declarations as exported.
  const text = lines.join('\n');
  for (const match of text.matchAll(/^export\s*\{([^}]*)\}(?!\s*from)/gm)) for (const part of match[1].split(',')) { const name = part.trim().split(/\s+as\s+/)[0].trim(); if (name) listed.add(name); }
  for (const match of text.matchAll(/^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm)) listed.add(match[1]);
  for (const segment of segments) if (listed.has(segment.name)) segment.exported = true;
  return segments;
}

const importSpecifiers = (source) => [...stripComments(String(source)).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"\n]+)\1/gm)].map(m => m[2]);
const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const joinPath = (dir, rel) => {
  const out = dir ? dir.split('/') : [];
  for (const part of rel.split('/')) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
  return out.join('/');
};
const moduleKey = (path) => path.replace(SOURCE_FILE, '').replace(/\/index$/, '');

/** Files a specifier may point at. Relative ones resolve exactly; aliases (`@/lib/api`, `@shared/x`) match by path ending. */
function resolveSpecifier(specifier, importer, byKey, keys) {
  const bare = specifier.replace(/\.(?:[cm]?[jt]sx?)$/, '');
  if (bare.startsWith('.')) { const key = moduleKey(joinPath(dirOf(importer), bare)); return byKey.get(key) ?? []; }
  const tail = bare.replace(/^[@~#$]\/?/, '').replace(/\/index$/, '');
  if (!tail) return [];
  return keys.filter(key => key === tail || key.endsWith('/' + tail)).flatMap(key => byKey.get(key));
}

/**
 * files: [{ path, source }] for the tracked source files of the app.
 * Returns the functions a UI change may not start calling, stop calling, or call differently:
 *   - every exported network function of a non-UI module that UI code imports (directly or through other modules)
 *     or that sits beside the UI folders;
 *   - exported hooks and helpers (lower-case names) of UI files that talk to the network. Components are not listed:
 *     placing an existing screen part somewhere else is what a redesign does.
 */
export function dataNames(files, config) {
  const tests = networkPatterns(config).map(p => new RegExp(p));
  const sources = files.filter(f => SOURCE_FILE.test(f.path)).map(f => ({ path: normalise(f.path), source: String(f.source ?? '') }));
  const isUi = (path) => matchAny(path, config.ui) && !matchAny(path, config.frozen);
  const byKey = new Map();
  for (const file of sources) { const key = moduleKey(file.path); byKey.set(key, [...(byKey.get(key) ?? []), file.path]); }
  const keys = [...byKey.keys()];
  const byPath = new Map(sources.map(f => [f.path, f]));

  // Which modules can UI code reach through imports.
  const imports = new Map(sources.map(f => [f.path, [...new Set(importSpecifiers(f.source).flatMap(spec => resolveSpecifier(spec, f.path, byKey, keys)))]]));
  const reachable = new Set(sources.filter(f => isUi(f.path)).map(f => f.path));
  // Code that sits beside the screens (`client/src/lib` next to `client/src/pages`) counts even when no
  // screen imports it yet, so the answer does not depend on an import alias this reader cannot follow.
  const beside = new Set((config.ui ?? []).map(glob => dirOf(normalise(glob).split(/[*?[{]/)[0].replace(/\/$/, ''))).filter(Boolean));
  for (const f of sources) if ([...beside].some(dir => f.path.startsWith(dir + '/'))) reachable.add(f.path);
  const queue = [...reachable];
  while (queue.length) for (const next of imports.get(queue.pop()) ?? []) if (!reachable.has(next)) { reachable.add(next); queue.push(next); }

  // Per module: which declarations talk to the network, directly or through another one.
  const modules = [...reachable].map(path => {
    const source = byPath.get(path).source;
    let segments = topLevelSegments(source);
    const whole = stripComments(source);
    const touches = tests.some(t => t.test(whole));
    // A module that talks to the network but cannot be split is one block: every export counts.
    const unsplit = touches && !segments.some(s => tests.some(t => t.test(s.body)));
    return { path, segments, unsplit, hot: new Set(unsplit ? segments.map(s => s.name) : segments.filter(s => tests.some(t => t.test(s.body))).map(s => s.name)) };
  });
  const byModule = new Map(modules.map(m => [m.path, m]));
  for (let changed = true; changed;) {
    changed = false;
    for (const mod of modules) {
      const visible = new Set(mod.hot);
      for (const dep of imports.get(mod.path) ?? []) { const other = byModule.get(dep); if (other) for (const s of other.segments) if (s.exported && other.hot.has(s.name)) visible.add(s.name); }
      for (const segment of mod.segments) {
        if (mod.hot.has(segment.name)) continue;
        // Quoted text is dropped first: an error message that names a function is not a call to it.
        segment.rest ??= (segment.body.split('\n').slice(1).join('\n') + '\n' + segment.body.split('\n')[0].replace(DECLARATION, '')).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
        if ([...visible].some(name => name !== segment.name && refersTo(name).test(segment.rest))) { mod.hot.add(segment.name); changed = true; }
      }
    }
  }

  const names = [];
  for (const mod of modules) {
    const ui = isUi(mod.path);
    for (const segment of mod.segments) {
      if (!segment.exported || !mod.hot.has(segment.name)) continue;
      if (ui && !/^[a-z_$]/.test(segment.name)) continue;
      names.push({ name: segment.name, file: mod.path, where: ui ? 'ui' : 'outside-ui' });
    }
  }
  names.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  const unique = [...new Set(names.map(n => n.name))];
  // One pattern per 40 names keeps each regular expression short enough to read in an error.
  // A name glued to a hyphen is a class name or a file name (`search-box`), not a call.
  // A capitalised name (a provider, a client class) is also an ordinary word in screen text ("App"),
  // so it counts only where it is used as code: <Name, new Name, Name( or Name.method.
  const patterns = [];
  const lower = unique.filter(name => /^[a-z_$]/.test(name)), upper = unique.filter(name => !/^[a-z_$]/.test(name));
  for (let i = 0; i < lower.length; i += 40) patterns.push(`(?<![.\\w$-])(?:${lower.slice(i, i + 40).map(escapeName).join('|')})(?![\\w$-])`);
  for (let i = 0; i < upper.length; i += 40) {
    const group = `(?:${upper.slice(i, i + 40).map(escapeName).join('|')})`;
    patterns.push(`(?:<|\\bnew\\s+)${group}(?![\\w$-])|(?<![.\\w$-])${group}(?:\\s*\\(|\\.[A-Za-z_$])`);
  }
  return { names, patterns };
}

/**
 * Check the guard config against the code it protects. Reads only.
 * holes   must be fixed before the guard is trusted
 * review  plain code files inside the UI list; a person confirms each is look-only
 */
export function auditConfig({ files, config, trackedFiles = [] }) {
  const problems = validateConfig(config);
  if (problems.length) return { ok: false, configProblems: problems, holes: [], review: [], names: [], silenced: [], uiFiles: 0 };
  const tests = networkPatterns(config).map(p => new RegExp(p));
  const isUi = (path) => matchAny(path, config.ui) && !matchAny(path, config.frozen);
  const tracked = trackedFiles.map(normalise);
  const holes = [], review = [];
  for (const file of files) {
    const path = normalise(file.path);
    if (!isUi(path) || !SOURCE_FILE.test(path)) continue;
    const text = stripComments(String(file.source ?? ''));
    const routes = (text.match(/<Route\b[^>]*\bpath\s*=|\bcreate(?:Browser|Hash|Memory)Router\s*\(|\bcreateRoutesFromElements\s*\(/g) ?? []).length;
    if (routes >= 3) { holes.push({ rule: 'routes-in-ui', path, detail: `declares the app's routes (${routes}); which screen opens, and for whom, is not a look` }); continue; }
    if (/\.[cm]?[jt]s$/.test(path)) {
      if (tests.some(t => t.test(text))) holes.push({ rule: 'data-in-ui', path, detail: 'is not a screen file and talks to the network; move it to frozen' });
      else {
        // Not proof of anything, only a pointer for the person reading the list: these two kinds of
        // file are the ones a redesign must not touch, and the ones a wide UI list most often lets in.
        const access = (text.match(/\b(?:roles?|permissions?|can[A-Z]\w*|is(?:Owner|Admin)\w*)\b/g) ?? []).length;
        const money = (text.match(/\b\w*(?:amount|total|balance|tax|vat|price|fee|money|cash|cents|currency)\w*\b/gi) ?? []).length;
        const flags = [access >= 3 ? `mentions roles or permissions ${access} times` : '', money >= 3 ? `works with amounts ${money} times` : ''].filter(Boolean);
        review.push({ path, detail: flags.join('; ') || 'plain code, no markup', flagged: flags.length > 0 });
      }
    }
  }
  review.sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.path.localeCompare(b.path));
  const protectedGlobs = config.protected ?? [];
  if (!tracked.some(path => /(^|\/)guard\.json$/.test(path) && matchAny(path, protectedGlobs))) holes.push({ rule: 'config-unprotected', path: '(protected)', detail: 'the guard config is not in the protected list, so a redesign could loosen it' });
  const testFiles = files.filter(f => /(^|\/)(tests?|__tests__|spec|e2e)\//.test(normalise(f.path)) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f.path));
  for (const lock of tracked.filter(path => /landmarks[^/]*\.lock\.json$/.test(path))) {
    if (!matchAny(lock, protectedGlobs)) holes.push({ rule: 'lock-unprotected', path: lock, detail: 'the landmark lock is not in the protected list' });
    // The path must stand on its own: `docs/design/x.lock.json` does not count as naming `design/x.lock.json`.
    const named = new RegExp(`(?:^|[^\\w./-]|(?:\\.\\.?/)+)${lock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'm');
    if (!testFiles.some(f => named.test(String(f.source ?? '')))) holes.push({ rule: 'lock-not-tested', path: lock, detail: 'no test file names this lock by its path, so nothing runs it unless someone remembers to' });
  }
  const derived = dataNames(files, config);
  const skip = (config.network_ignore ?? []).map(p => new RegExp(p));
  const silenced = [...new Set(derived.names.map(n => n.name))].filter(name => skip.some(t => t.test(`const probe = () => ${name}();`)));
  return { ok: holes.length === 0, configProblems: [], holes, review, names: derived.names, silenced, uiFiles: tracked.filter(isUi).length };
}

#!/usr/bin/env node
// Route map of an app, read from its source code. Nothing is run, fetched or changed.
//
//   node app-map.mjs [--root <app folder>] [--src <dir> ...] [--declared <sitemap.md>]
//                    [--ignore /api,/auth] [--out <map.json>] [--json] [--strict]
//
// For an app behind a login there is no sitemap.xml to read, so the screens are taken from
// where the app declares them:
//   - <Route path="..."> elements (wouter, react-router), including nested ones
//   - react-router route objects ({ path, element })
//   - file-based routes (Next.js app/ and pages/, Astro src/pages/)
// It then finds every in-app link written as plain text in the source and reports, per
// screen: the file that renders it, what wraps it (a guard), where it redirects, and which
// files link to it. Links built by a function at run time cannot be read this way; they
// are counted and listed as "computed", never guessed.
//
// --strict exits 1 when a written link or redirect points at a screen that does not exist.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.astro', '.mdx']);
// Markdown is a page in Astro, but never read for routes or links: docs quote both.
const PAGES = new Set([...SOURCE, '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.astro', '.vercel', '.agents', '.cursor', '.turbo', '__tests__', '__mocks__']);
const SKIP_FILES = /\.(test|spec|stories)\.[a-z]+$|\.d\.ts$/;
const DEFAULT_IGNORE = ['/api', '/auth', '/assets', '/static', '/_next'];
const posix = (path) => path.split(sep).join('/');

export function walk(dir, out = [], extensions = SOURCE) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full, out, extensions); }
    else if (extensions.has(extname(name)) && !SKIP_FILES.test(name)) out.push(full);
  }
  return out;
}

// Blank out comments, keeping every line break and column, so commented-out routes and
// links are not counted. Quoted text is left alone; a quote never runs past its line.
export function stripComments(text) {
  const out = text.split('');
  let i = 0;
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < text.length) {
    const c = text[i], next = text[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      i = j + 1;
    } else if (c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== '`') j += text[j] === '\\' ? 2 : 1;
      i = j + 1;
    } else if (c === '/' && next === '/' && text[i - 1] !== ':') {
      let j = i;
      while (j < text.length && text[j] !== '\n') j++;
      blank(i, j); i = j;
    } else if (c === '<' && text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      const j = end < 0 ? text.length : end + 3;
      blank(i, j); i = j;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const j = end < 0 ? text.length : end + 2;
      blank(i, j); i = j;
    } else i++;
  }
  return out.join('');
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// Index just past the `>` that closes the tag opening at `start`, skipping quotes and {...}.
function tagEnd(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { const j = text.indexOf(c, i + 1); if (j < 0) return -1; i = j; }
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0 && text[i - 1] !== '=') return i + 1;
  }
  return -1;
}

// A literal attribute value: path="/x", path={'/x'} or path={`/x`}. undefined when absent,
// null when present but computed.
function attr(tag, name) {
  const m = tag.match(new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`$]*)\`)\\s*\\}|(\\{))`));
  if (!m) return undefined;
  return m[6] ? null : m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
}

const joinPath = (parent, child) => {
  if (child === undefined || child === '') return parent || '/';
  if (child.startsWith('/')) return child;
  return `${(parent || '').replace(/\/\*?$/, '')}/${child}`;
};

const WRAPPERS = new Set(['Suspense', 'Fragment', 'Route', 'Routes', 'Switch', 'Redirect', 'Navigate', 'Outlet', 'ErrorBoundary']);

// What a route renders, from its attributes and children.
function describe(open, body) {
  const all = `${open} ${body}`;
  const out = {};
  const redirect = all.match(/<(?:Redirect|Navigate)\b[^>]*?\bto\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`$]*)["'`]\s*\}|(\{))/);
  if (redirect) out.redirect_to = redirect[4] ? 'computed' : redirect[1] ?? redirect[2] ?? redirect[3];
  // fallback={...} is what shows while loading, not the screen.
  const shown = all.replace(/\bfallback\s*=\s*\{[^}]*\}/g, ' ');
  const names = [];
  const direct = open.match(/\b(?:component|Component)\s*=\s*\{\s*([A-Z]\w*)\s*\}/);
  if (direct) names.push(direct[1]);
  for (const m of shown.matchAll(/<([A-Z]\w*)\b([^<>]*)/g)) {
    if (m[1] === 'Route') continue;
    if (!WRAPPERS.has(m[1]) && !names.includes(m[1])) names.push(m[1]);
  }
  out.components = names;
  // A component that has children of its own wraps the screen (a guard or a layout).
  out.wrapped_by = [...shown.matchAll(/<([A-Z]\w*)\b([^<>]*[^/<>])?>/g)]
    .filter(m => !WRAPPERS.has(m[1]) && new RegExp(`</${m[1]}>`).test(shown))
    .map(m => `${m[1]}${(m[2] || '').replace(/\s+/g, ' ').trimEnd()}`);
  return out;
}

// Every <Route> in a file, with nested routes joined to their parent's path.
export function jsxRoutes(text) {
  const routes = [];
  const scan = (from, to, parentPath) => {
    let i = from;
    while (i < to) {
      const at = text.slice(0, to).indexOf('<Route', i);
      if (at < 0) return;
      if (/[\w.]/.test(text[at + 6] ?? '')) { i = at + 6; continue; }
      const openEnd = tagEnd(text, at);
      if (openEnd < 0) return;
      const open = text.slice(at, openEnd);
      const selfClosing = /\/\s*>$/.test(open);
      let bodyEnd = openEnd, next = openEnd;
      if (!selfClosing) {
        let depth = 1, k = openEnd;
        while (depth > 0) {
          const o = text.indexOf('<Route', k), c = text.indexOf('</Route>', k);
          if (c < 0) { k = text.length; break; }
          if (o >= 0 && o < c && !/[\w.]/.test(text[o + 6] ?? '')) {
            const e = tagEnd(text, o);
            if (e < 0) { k = text.length; break; }
            if (!/\/\s*>$/.test(text.slice(o, e))) depth++;
            k = e;
          } else if (o >= 0 && o < c) k = o + 6;
          else { depth--; bodyEnd = c; k = c + 8; }
        }
        next = k;
      }
      const raw = attr(open, 'path');
      const computed = raw === null;
      const index = /\sindex(\s|\/|>|=)/.test(open);
      const path = computed ? null : raw === undefined ? (index ? joinPath(parentPath, '') : parentPath ? joinPath(parentPath, '*') : '*') : joinPath(parentPath, raw);
      const body = selfClosing ? '' : text.slice(openEnd, bodyEnd);
      const hasChildren = /<Route[\s>/]/.test(body);
      // A parent with child routes is a layout: its own entry is read from its opening tag only.
      const own = hasChildren ? '' : body;
      routes.push({ path, computed_path: computed, line: lineOf(text, at), layout: hasChildren, ...describe(open, own) });
      if (hasChildren) scan(openEnd, bodyEnd, path ?? parentPath);
      i = next;
    }
  };
  scan(0, text.length, '');
  return routes;
}

// react-router route objects: { path: "/x", element: <X /> }. Children are joined to their
// parent only when written inline; anything else is reported as relative.
export function objectRoutes(text) {
  if (!/from\s+["'](react-router|react-router-dom|@tanstack\/react-router)["']/.test(text)) return [];
  const routes = [];
  for (const m of text.matchAll(/\bpath\s*:\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const path = m[1] ?? m[2];
    const rest = text.slice(m.index, text.indexOf('}', m.index) + 1 || undefined);
    const component = rest.match(/\b(?:element\s*:\s*<|Component\s*:\s*)([A-Z]\w*)/)?.[1];
    routes.push({ path: path.startsWith('/') || path === '*' ? path : null, relative_path: path.startsWith('/') || path === '*' ? undefined : path, computed_path: false, line: lineOf(text, m.index), layout: false, components: component ? [component] : [], wrapped_by: [] });
  }
  return routes;
}

// Where an identifier used in a file is imported from.
export function importsOf(text) {
  const map = new Map();
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Z]\w*)\s*=\s*(?:React\.)?lazy\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g)) map.set(m[1], m[2]);
  for (const m of text.matchAll(/\bimport\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = m[1].replace(/\btype\s+/g, '');
    const def = clause.match(/^([A-Za-z_$][\w$]*)/);
    if (def && def[1] !== 'type') map.set(def[1], m[2]);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) for (const part of named[1].split(',')) { const name = part.trim().split(/\s+as\s+/).pop(); if (name) map.set(name, m[2]); }
  }
  return map;
}

// "@/pages/login" -> an existing file, using tsconfig paths when the app has them.
export function resolver(root) {
  const aliases = [];
  for (const name of ['tsconfig.json', 'jsconfig.json', 'tsconfig.app.json']) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    try {
      const config = JSON.parse(stripComments(readFileSync(file, 'utf8')).replace(/,(\s*[}\]])/g, '$1'));
      const base = resolve(root, config.compilerOptions?.baseUrl ?? '.');
      for (const [key, targets] of Object.entries(config.compilerOptions?.paths ?? {})) {
        if (key.endsWith('/*') && targets[0]?.endsWith('/*')) aliases.push([key.slice(0, -1), resolve(base, targets[0].slice(0, -1))]);
      }
    } catch { /* an unreadable tsconfig only means aliases stay unresolved */ }
  }
  const tryFile = (base) => {
    for (const candidate of [base, ...[...SOURCE].map(e => base + e), ...[...SOURCE].map(e => join(base, `index${e}`))]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  };
  return (specifier, fromFile) => {
    if (specifier.startsWith('.')) return tryFile(resolve(dirname(fromFile), specifier));
    for (const [prefix, target] of aliases) if (specifier.startsWith(prefix)) { const hit = tryFile(join(target, specifier.slice(prefix.length))); if (hit) return hit; }
    return null;
  };
}

// File-based routes. `kind` says which convention produced them.
export function fileRoutes(root) {
  const routes = [];
  // Only when the app really uses that framework: a Vite app may also keep its screens in src/pages.
  let deps = {};
  try { const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); deps = { ...pkg.dependencies, ...pkg.devDependencies }; } catch { /* no package.json: no file-based routes */ }
  const isNext = 'next' in deps, isAstro = 'astro' in deps;
  if (!isNext && !isAstro) return routes;
  const segment = (s) => s.replace(/^\[\[?\.\.\.(.+?)\]\]?$/, '*').replace(/^\[(.+)\]$/, ':$1');
  const add = (dir, kind, isPage, toParts) => {
    if (!existsSync(dir)) return;
    for (const file of walk(dir, [], PAGES)) {
      const rel = posix(relative(dir, file));
      if (!isPage(rel)) continue;
      const parts = toParts(rel).filter(Boolean).map(segment);
      routes.push({ path: `/${parts.join('/')}`, computed_path: false, line: 1, layout: false, kind, file, page_file: file, components: [], wrapped_by: [] });
    }
  };
  for (const base of ['', 'src']) {
    if (isAstro) {
      if (base === 'src') add(join(root, 'src', 'pages'), 'astro-pages', rel => !/(^|\/)_/.test(rel) && /\.(astro|mdx|md)$/.test(rel), rel => rel.replace(/\.[a-z]+$/, '').split('/').filter(s => s !== 'index'));
      continue;
    }
    add(join(root, base, 'app'), 'next-app', rel => /(^|\/)page\.(tsx|jsx|ts|js|mdx)$/.test(rel) && !rel.startsWith('api/'),
      rel => dirname(rel).split('/').filter(s => s !== '.' && !/^\(.*\)$/.test(s) && !s.startsWith('@')));
    add(join(root, base, 'pages'), 'next-pages',
      rel => !rel.startsWith('api/') && !/(^|\/)_/.test(rel) && /\.(tsx|jsx|js|mdx)$/.test(rel),
      rel => rel.replace(/\.[a-z]+$/, '').split('/').filter(s => s !== 'index'));
  }
  return routes;
}

const PATH_BODY = '\\/(?!\\/)[^"\'`\\s<>]*';
const STRONG = [
  new RegExp(`\\b(?:href|to)\\s*=\\s*(?:\\{\\s*)?(["'\`])(${PATH_BODY})\\1`, 'g'),
  new RegExp(`\\b(?:href|to)\\s*:\\s*(["'\`])(${PATH_BODY})\\1`, 'g'),
  new RegExp(`\\b(?:navigate|setLocation|redirect|permanentRedirect|router\\.push|router\\.replace)\\(\\s*(["'\`])(${PATH_BODY})\\1`, 'g')
];
const ANY_PATH = new RegExp(`(["'\`])(${PATH_BODY})\\1`, 'g');
const COMPUTED = /\b(?:href|to)\s*=\s*\{\s*(?!["'`])[^}]|\b(?:navigate|setLocation|router\.push|router\.replace)\(\s*(?!["'`])[A-Za-z_$(]/g;

// "/receipt/${id}?x=1#top" -> ["receipt", null]; null stands for a value filled in at run time.
export function segments(target) {
  const clean = target.replace(/\$\{[^}]*\}/g, '\u0000').split(/[?#]/)[0];
  if (!clean.startsWith('/')) return null;
  return clean.split('/').filter(Boolean).map(s => (s.includes('\u0000') ? null : s));
}

export function matches(routePath, target) {
  const link = segments(target);
  // A link whose first part is filled in at run time (`/${page}`) could be any screen: it matches none.
  if (!link || link[0] === null || !routePath || routePath === '*') return false;
  const route = routePath.split('/').filter(Boolean);
  for (let i = 0; i < route.length; i++) {
    const r = route[i];
    if (r === '*' || /^:.*\*$/.test(r)) return true;
    if (i >= link.length) return route.slice(i).every(s => /^:.*\?$/.test(s));
    if (r.startsWith(':') || link[i] === null) continue;
    if (r !== link[i]) return false;
  }
  return link.length === route.length;
}

export function findLinks(text) {
  const strong = [], seen = new Set();
  for (const pattern of STRONG) for (const m of text.matchAll(pattern)) {
    const at = m.index + m[0].lastIndexOf(m[2]);
    seen.add(at);
    strong.push({ target: m[2], line: lineOf(text, m.index) });
  }
  const mentions = [];
  for (const m of text.matchAll(ANY_PATH)) {
    const at = m.index + 1;
    if (!seen.has(at) && /^\/[a-z0-9:$]/i.test(m[2])) mentions.push({ target: m[2], line: lineOf(text, m.index) });
  }
  return { strong, mentions, computed: (text.match(COMPUTED) ?? []).length };
}

export function buildMap({ root = process.cwd(), src = [], declared, ignore = DEFAULT_IGNORE } = {}) {
  root = resolve(root);
  const resolveImport = resolver(root);
  const rel = (file) => posix(relative(root, file));
  const allFiles = walk(root);
  const texts = new Map(allFiles.map(f => [f, stripComments(readFileSync(f, 'utf8'))]));

  let routes = [];
  for (const [file, text] of texts) {
    const found = [...(text.includes('<Route') ? jsxRoutes(text) : []), ...objectRoutes(text)];
    if (!found.length) continue;
    const imports = importsOf(text);
    for (const route of found) {
      const pages = route.components.map(name => imports.get(name)).filter(Boolean).map(spec => resolveImport(spec, file) ?? spec);
      // Prefer a file from a pages/screens/views/routes folder over a shared wrapper.
      const page = pages.find(p => /(^|\/)(pages|screens|views|routes)\//.test(posix(String(p)))) ?? pages[pages.length - 1] ?? null;
      routes.push({ ...route, kind: 'route-element', file, page_file: page });
    }
  }
  const routerFiles = [...new Set(routes.map(r => r.file))];
  routes.push(...fileRoutes(root));
  if (!routes.length) return { ok: false, reason: 'no routes found: no <Route path>, react-router route objects, Next.js app/ or pages/, or Astro src/pages/ in this folder' };

  // Links are read from the client code only. By default that is the nearest "src" (or the
  // router file's own folder) for each router, or the whole app for file-based routing.
  const roots = src.length ? src.map(s => resolve(root, s)) : [...new Set(routerFiles.map(f => {
    let dir = dirname(f);
    while (dir.startsWith(root) && dir !== root) { if (dir.split(sep).pop() === 'src') return dir; dir = dirname(dir); }
    return dirname(f);
  }))];
  const fileBased = routes.some(r => r.kind !== 'route-element');
  const inScope = (file) => (fileBased && !src.length) || roots.some(r => file === r || file.startsWith(r + sep));
  const ignored = (target) => ignore.some(p => target === p || target.startsWith(`${p}/`)) || /\.[a-z0-9]{2,5}$/i.test(target.split(/[?#]/)[0]);

  // A catch-all at the top matches everything, so it never proves a link is valid.
  const known = routes.filter(r => r.path && r.path !== '*' && r.path !== '/*');
  const linked = new Map(), mentioned = new Map(), dead = [], navigation = [];
  let computed = 0, strongTotal = 0;
  for (const [file, text] of texts) {
    if (!inScope(file) || /(^|\/)(server|api)\//.test(rel(file))) continue;
    const { strong, mentions, computed: n } = findLinks(text);
    computed += n;
    const distinct = new Set();
    for (const link of strong) {
      if (ignored(link.target)) continue;
      if (segments(link.target)?.[0] === null) { computed++; continue; }
      // A route's own redirect is listed under "redirects", not as a link.
      if (routerFiles.includes(file) && routes.some(r => r.file === file && r.redirect_to === link.target)) continue;
      strongTotal++;
      const hits = known.filter(r => matches(r.path, link.target));
      if (!hits.length) { dead.push({ target: link.target, file: rel(file), line: link.line }); continue; }
      for (const r of hits) { if (!linked.has(r.path)) linked.set(r.path, new Set()); linked.get(r.path).add(rel(file)); distinct.add(r.path); }
    }
    for (const mention of mentions) {
      if (routerFiles.includes(file) && routes.some(r => r.file === file && r.path === mention.target)) continue;
      for (const r of known.filter(r => matches(r.path, mention.target))) { if (!mentioned.has(r.path)) mentioned.set(r.path, new Set()); mentioned.get(r.path).add(rel(file)); }
    }
    if (distinct.size >= 3) navigation.push({ file: rel(file), screens: distinct.size });
  }

  const seenPath = new Map();
  const screens = routes.map(r => {
    const out = { path: r.path, kind: r.kind, declared_in: `${rel(r.file)}:${r.line}` };
    if (r.computed_path) out.note = 'path is computed in code and could not be read';
    if (r.relative_path) out.note = `relative path "${r.relative_path}"; its parent could not be read`;
    if (r.page_file) out.page_file = existsSync(String(r.page_file)) ? rel(r.page_file) : String(r.page_file);
    if (r.layout) out.layout = true;
    if (r.wrapped_by?.length) out.wrapped_by = r.wrapped_by;
    if (r.redirect_to) out.redirect_to = r.redirect_to;
    if (r.path && /[:*]/.test(r.path)) out.dynamic = true;
    if (r.path) {
      out.linked_from = [...(linked.get(r.path) ?? [])].sort();
      out.mentioned_in = [...(mentioned.get(r.path) ?? [])].filter(f => !out.linked_from.includes(f)).sort();
      if (r.layout) { /* a layout shares its path with its index screen */ } else if (seenPath.has(r.path)) out.duplicate_of = seenPath.get(r.path); else seenPath.set(r.path, out.declared_in);
    }
    return out;
  });

  const redirects = screens.filter(s => s.redirect_to).map(s => ({ from: s.path, to: s.redirect_to, target_exists: s.redirect_to === 'computed' ? null : known.some(r => matches(r.path, s.redirect_to)) }));
  const incomplete = screens.filter(s => s.note).map(s => `${s.declared_in}: ${s.note}`);
  const result = {
    ok: true,
    tool: 'fe-scan/app-map',
    root: posix(root),
    router_files: routerFiles.map(rel),
    link_scope: fileBased && !src.length ? ['.'] : roots.map(rel),
    complete: incomplete.length === 0,
    incomplete,
    counts: { screens: screens.filter(s => s.path && s.path !== '*' && s.path !== '/*' && !s.redirect_to && !s.layout).length, redirects: redirects.length, written_links: strongTotal, computed_links: computed },
    screens,
    redirects,
    // Written links and redirects that point at no declared screen.
    dead_links: dead,
    broken_redirects: redirects.filter(r => r.target_exists === false),
    // Screens no file links to in plain text. With computed links in the app this is a lead, not proof.
    no_written_link: screens.filter(s => s.path && s.path !== '/' && s.path !== '*' && s.path !== '/*' && !s.redirect_to && !s.layout && !s.duplicate_of && s.linked_from.length === 0).map(s => ({ path: s.path, mentioned_in: s.mentioned_in })),
    duplicate_paths: screens.filter(s => s.duplicate_of).map(s => ({ path: s.path, first: s.duplicate_of, again: s.declared_in })),
    navigation_files: navigation.sort((a, b) => b.screens - a.screens)
  };

  if (declared) {
    const text = readFileSync(resolve(root, declared), 'utf8');
    const listed = [...new Set([...text.matchAll(/`(\/[A-Za-z0-9/:_*-]*)`/g)].map(m => m[1]))];
    result.declared = {
      file: posix(declared),
      listed: listed.length,
      // In the written sitemap but not in the code, and the other way round.
      not_in_code: listed.filter(p => !known.some(r => matches(r.path, p))),
      not_in_sitemap: screens.filter(s => s.path && s.path !== '/' && s.path !== '*' && s.path !== '/*' && !s.redirect_to && !s.layout && !listed.some(p => matches(s.path, p))).map(s => s.path)
    };
  }
  return result;
}

export function summary(map) {
  if (!map.ok) return `NO MAP: ${map.reason}`;
  const lines = [
    `APP MAP: ${map.counts.screens} screen(s), ${map.counts.redirects} redirect(s); ${map.counts.written_links} written link(s), ${map.counts.computed_links} computed link(s) that cannot be read statically`,
    `  routes declared in: ${map.router_files.join(', ') || 'the file tree'}`,
    `  dead links: ${map.dead_links.length}${map.dead_links.slice(0, 5).map(d => `\n    - ${d.target}  (${d.file}:${d.line})`).join('')}`,
    `  broken redirects: ${map.broken_redirects.length}${map.broken_redirects.map(r => `\n    - ${r.from} -> ${r.to}`).join('')}`,
    `  screens with no written link: ${map.no_written_link.length}${map.no_written_link.length ? ` (${map.no_written_link.map(s => s.path).join(', ')})` : ''}`
  ];
  if (map.duplicate_paths.length) lines.push(`  paths declared twice: ${map.duplicate_paths.map(d => d.path).join(', ')}`);
  if (map.declared) lines.push(`  sitemap ${map.declared.file}: ${map.declared.not_in_code.length} listed but not in code${map.declared.not_in_code.length ? ` (${map.declared.not_in_code.join(', ')})` : ''}; ${map.declared.not_in_sitemap.length} in code but not listed${map.declared.not_in_sitemap.length ? ` (${map.declared.not_in_sitemap.join(', ')})` : ''}`);
  if (!map.complete) lines.push(`  INCOMPLETE: ${map.incomplete.length} route(s) could not be read; dead links are not judged in --strict`);
  return lines.join('\n');
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const all = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
  if (argv.includes('--help')) { console.log('usage: app-map.mjs [--root <app>] [--src <dir> ...] [--declared <sitemap.md>] [--ignore /api,/auth] [--out <map.json>] [--json] [--strict]'); return 0; }
  const root = arg('--root') ?? '.';
  if (!existsSync(root)) { console.error(`no such folder: ${root}`); return 2; }
  const declared = arg('--declared');
  if (declared && !existsSync(resolve(root, declared))) { console.error(`no such file: ${declared}`); return 2; }
  const map = buildMap({ root, src: all('--src'), declared, ignore: arg('--ignore') ? arg('--ignore').split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_IGNORE });
  if (!map.ok) { console.error(summary(map)); return 2; }
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(map, null, 2) + '\n');
  console.log(argv.includes('--json') ? JSON.stringify(map, null, 2) : summary(map));
  if (argv.includes('--strict')) {
    const broken = map.broken_redirects.length + (map.complete ? map.dead_links.length : 0);
    if (broken) { console.error(`STRICT: ${broken} link(s) or redirect(s) point at a screen that does not exist`); return 1; }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));

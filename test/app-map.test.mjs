import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMap, findLinks, jsxRoutes, matches, segments, stripComments, summary } from '../skills/fe-scan/scripts/app-map.mjs';
import { spawnBounded } from '../scripts/run-bounded.mjs';

const script = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'skills/fe-scan/scripts/app-map.mjs');

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'fe-app-map-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}
const byPath = (map) => Object.fromEntries(map.screens.map(s => [s.path, s]));

// The shape of a real single-page app: lazy screens, a guard around each, alias redirects.
const SPA = {
  'package.json': JSON.stringify({ dependencies: { react: '18', wouter: '3' } }),
  'tsconfig.json': '{\n  // aliases\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./client/src/*"], }, },\n}',
  'client/src/App.tsx': `import { Switch, Route, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import { Guard } from "@/components/Guard";
const Home = lazy(() => import("@/pages/home"));
const Wallet = lazy(() => import("@/pages/wallet"));
const Receipt = lazy(() => import("@/pages/receipt-detail"));
const Hidden = lazy(() => import("@/pages/hidden"));
const NotFound = lazy(() => import("@/pages/not-found"));
export function App() {
  return (
    <Switch>
      <Route path="/home">
        <Guard page="home"><Home /></Guard>
      </Route>
      <Route path="/wallet"><Guard page="wallet"><Wallet /></Guard></Route>
      <Route path="/receipt/:id"><Guard page="receipts"><Receipt /></Guard></Route>
      <Route path="/hidden"><Guard page="admin"><Hidden /></Guard></Route>
      {/* <Route path="/retired"><Home /></Route> */}
      // <Route path="/also-retired" />
      <Route path="/accounts"><Redirect to="/wallet" /></Route>
      <Route path="/old-home"><Redirect to="/dashboard" /></Route>
      <Route path="/" component={() => null} />
      <Route>
        <Suspense fallback={<Spinner />}><NotFound /></Suspense>
      </Route>
    </Switch>
  );
}
`,
  'client/src/components/Guard.tsx': 'export function Guard({ children }) { return children; }\n',
  'client/src/pages/home.tsx': 'import { Link } from "wouter";\nexport default function Home() {\n  return <Link href="/wallet?view=people">People</Link>;\n}\n',
  'client/src/pages/wallet.tsx': 'export default function Wallet({ id }) {\n  return <a href={`/receipt/${id}`}>Open</a>;\n}\n',
  'client/src/pages/receipt-detail.tsx': 'export default function Receipt() { return null; }\n',
  'client/src/pages/hidden.tsx': 'export default function Hidden() { return null; }\n',
  'client/src/pages/not-found.tsx': 'export default function NotFound() { return null; }\n',
  'client/src/lib/nav.ts': `export const ITEMS = [
  { href: "/home", label: "Home" },
  { href: "/wallet", label: "Custody" },
  { href: "/receipt/42", label: "Latest" },
  { href: "/reports", label: "Reports" },
  { href: "/api/export", label: "Export" },
  { href: "/guide.pdf", label: "Guide" },
  // { href: "/commented-out", label: "Old" },
];
export const isHidden = (path: string) => path.startsWith("/hidden");
export function open(setLocation, page, href) {
  setLocation(\`/\${page}\`);
  setLocation(href);
}
`,
  'client/src/lib/nav.test.ts': 'export const x = { href: "/only-in-a-test" };\n',
  'server/index.ts': 'export const go = (res) => res.redirect("/server-only");\n',
  'docs/sitemap.md': '| Home `/home` | Custody `/wallet` | Ghost `/ghost` | Receipt `/receipt/:id` |\n'
};

test('app-map: routes, the file behind each, guards and redirects are read from a router file', () => {
  const dir = project(SPA);
  try {
    const map = buildMap({ root: dir, declared: 'docs/sitemap.md' });
    assert.equal(map.ok, true);
    assert.deepEqual(map.router_files, ['client/src/App.tsx']);
    assert.deepEqual(map.link_scope, ['client/src'], 'links are read from the client code, not the server');
    assert.deepEqual(map.screens.map(s => s.path), ['/home', '/wallet', '/receipt/:id', '/hidden', '/accounts', '/old-home', '/', '*'], 'commented-out routes are not screens');
    const screens = byPath(map);
    assert.equal(screens['/home'].page_file, 'client/src/pages/home.tsx', 'the alias from tsconfig is resolved');
    assert.equal(screens['/home'].declared_in, 'client/src/App.tsx:12');
    assert.deepEqual(screens['/home'].wrapped_by, ['Guard page="home"']);
    assert.equal(screens['/receipt/:id'].dynamic, true);
    assert.equal(screens['*'].page_file, 'client/src/pages/not-found.tsx', 'the loading fallback is not the screen');
    assert.equal(screens['/accounts'].redirect_to, '/wallet');
    assert.deepEqual(map.counts, { screens: 5, redirects: 2, written_links: 6, computed_links: 2 });

    // Who links where. A query string and a filled-in id still point at their screen.
    assert.deepEqual(screens['/wallet'].linked_from, ['client/src/lib/nav.ts', 'client/src/pages/home.tsx']);
    assert.deepEqual(screens['/receipt/:id'].linked_from, ['client/src/lib/nav.ts', 'client/src/pages/wallet.tsx']);
    assert.deepEqual(map.navigation_files, [{ file: 'client/src/lib/nav.ts', screens: 3 }]);

    // Problems. Server paths, files, tests, comments and server code are not links.
    assert.deepEqual(map.dead_links, [{ target: '/reports', file: 'client/src/lib/nav.ts', line: 5 }]);
    assert.deepEqual(map.redirects, [{ from: '/accounts', to: '/wallet', target_exists: true }, { from: '/old-home', to: '/dashboard', target_exists: false }]);
    assert.deepEqual(map.broken_redirects.map(r => r.from), ['/old-home']);
    assert.deepEqual(map.no_written_link, [{ path: '/hidden', mentioned_in: ['client/src/lib/nav.ts'] }], 'a mention is reported, but is not a link');
    assert.deepEqual(map.declared, { file: 'docs/sitemap.md', listed: 4, not_in_code: ['/ghost'], not_in_sitemap: ['/hidden'] });
    assert.equal(map.complete, true);
    assert.match(summary(map), /5 screen\(s\), 2 redirect\(s\); 6 written link\(s\), 2 computed link\(s\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('app-map: nested routes are joined to their parent, and a layout is not a duplicate of its index screen', () => {
  const text = `<Routes>
  <Route path="/" element={<Layout />}>
    <Route index element={<Home />} />
    <Route path="trips" element={<Trips />} />
    <Route path="trips/:id" element={<Trip />}>
      <Route path="edit" element={<EditTrip />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Route>
  <Route path="/login" component={Login} />
  <Route path={BASE} element={<Dynamic />} />
</Routes>`;
  const routes = jsxRoutes(text);
  assert.deepEqual(routes.map(r => [r.path, r.components[0], r.layout]), [
    ['/', 'Layout', true], ['/', 'Home', false], ['/trips', 'Trips', false], ['/trips/:id', 'Trip', true], ['/trips/:id/edit', 'EditTrip', false],
    ['/*', 'NotFound', false], ['/login', 'Login', false], [null, 'Dynamic', false]
  ]);
  assert.equal(routes[7].computed_path, true);

  const dir = project({ 'package.json': '{}', 'src/App.jsx': `import Layout from "./Layout";\nexport const App = () => (${text});\n`, 'src/Layout.jsx': 'export default () => <a href="/trips/9/edit">Edit</a>;\n' });
  try {
    const map = buildMap({ root: dir });
    assert.deepEqual(map.duplicate_paths, []);
    assert.equal(map.complete, false, 'a path held in a variable cannot be read');
    assert.match(map.incomplete[0], /src\/App\.jsx:12: path is computed in code/);
    assert.deepEqual(byPath(map)['/trips/:id/edit'].linked_from, ['src/Layout.jsx']);
    assert.equal(byPath(map)['/'].page_file ?? null, null, 'the last "/" entry is the index screen, with no import to resolve');
    assert.deepEqual(map.dead_links, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('app-map: a link matches a route by shape, and a link built at run time matches nothing', () => {
  assert.deepEqual(segments('/receipt/${id}?from=home#top'), ['receipt', null]);
  assert.equal(segments('${base}/x'), null);
  assert.equal(matches('/receipt/:id', '/receipt/42'), true);
  assert.equal(matches('/receipt/:id', '/receipt/${id}'), true);
  assert.equal(matches('/receipt/:id', '/receipt'), false);
  assert.equal(matches('/receipt/:id?', '/receipt'), true);
  assert.equal(matches('/wallet', '/wallet/link'), false);
  assert.equal(matches('/wallet', '/wallet/'), true);
  assert.equal(matches('/docs/*', '/docs/a/b'), true);
  assert.equal(matches('/docs/*', '/blog/a'), false);
  assert.equal(matches('*', '/anything'), false, 'a catch-all never proves a link is valid');
  assert.equal(matches('/home', '/${page}'), false);
  assert.equal(matches('/', '/'), true);

  const found = findLinks(stripComments('<Link href="/a" /> <a href={"/b"}>b</a> navigate(`/c/${id}`); router.push("/d"); const x = { to: "/e" };\n// href="/gone"\n/* to: "/gone-too" */ const u = "https://example.com/x"; const p = "/mention"; <Link href={build()} /> <!-- href="/html-gone" -->'));
  assert.deepEqual(found.strong.map(l => l.target).sort(), ['/a', '/b', '/c/${id}', '/d', '/e']);
  assert.deepEqual(found.mentions.map(l => l.target), ['/mention']);
  assert.equal(found.computed, 1);
});

test('app-map: file-based routes are read for Next.js and Astro, and only when the app uses them', () => {
  const next = project({
    'package.json': JSON.stringify({ dependencies: { next: '15' } }),
    'app/page.tsx': 'export default () => null;\n',
    'app/(marketing)/about/page.tsx': 'export default () => null;\n',
    'app/trips/[id]/page.tsx': 'export default () => null;\n',
    'app/docs/[...slug]/page.tsx': 'export default () => null;\n',
    'app/api/health/route.ts': 'export const GET = () => new Response("ok");\n',
    'app/layout.tsx': 'export default ({ children }) => children;\n',
    'components/Nav.tsx': 'export const Nav = () => <><Link href="/about">About</Link><Link href="/trips/42">Trip</Link><Link href="/docs/a/b">Docs</Link><Link href="/pricing">Pricing</Link></>;\n'
  });
  const astro = project({
    'package.json': JSON.stringify({ dependencies: { astro: '5' } }),
    'src/pages/index.astro': '---\n---\n<a href="/tours/coron">Coron</a>\n<!-- <a href="/retired">Old</a> -->\n',
    'src/pages/tours/[slug].astro': '---\n---\n<a href="/contact">Contact</a>\n',
    'src/pages/blog/index.md': '# Blog\n',
    'src/pages/_draft.astro': '---\n---\n'
  });
  const vite = project({ 'package.json': JSON.stringify({ dependencies: { react: '18' } }), 'src/pages/home.tsx': 'export default () => null;\n' });
  try {
    const n = buildMap({ root: next });
    assert.deepEqual(n.screens.map(s => [s.path, s.kind]).sort(), [['/', 'next-app'], ['/about', 'next-app'], ['/docs/*', 'next-app'], ['/trips/:id', 'next-app']]);
    assert.deepEqual(n.dead_links, [{ target: '/pricing', file: 'components/Nav.tsx', line: 1 }]);
    assert.deepEqual(n.no_written_link, []);
    const a = buildMap({ root: astro });
    assert.deepEqual(a.screens.map(s => s.path).sort(), ['/', '/blog', '/tours/:slug']);
    assert.deepEqual(a.dead_links, [{ target: '/contact', file: 'src/pages/tours/[slug].astro', line: 3 }]);
    assert.deepEqual(a.no_written_link.map(s => s.path), ['/blog']);
    const v = buildMap({ root: vite });
    assert.equal(v.ok, false, 'a folder called pages is not a router');
    assert.match(summary(v), /NO MAP: no routes found/);
  } finally {
    for (const dir of [next, astro, vite]) rmSync(dir, { recursive: true, force: true });
  }
});

test('app-map: route objects are listed, and a relative one marks the map incomplete', () => {
  const dir = project({
    'package.json': '{}',
    'src/router.tsx': 'import { createBrowserRouter } from "react-router-dom";\nexport const router = createBrowserRouter([\n  { path: "/", element: <Root />, children: [{ path: "trips", element: <Trips /> }] },\n  { path: "/about", Component: About }\n]);\n',
    'src/Nav.tsx': 'export const Nav = () => <a href="/nope">x</a>;\n',
    'src/config.ts': 'export const file = { path: "/not-a-route" };\n'
  });
  try {
    const map = buildMap({ root: dir });
    assert.deepEqual(map.screens.map(s => s.path), ['/', null, '/about'], 'a "path" key outside a router file is not a route');
    assert.equal(map.complete, false);
    assert.match(map.incomplete[0], /relative path "trips"/);
    assert.equal(map.dead_links.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('app-map: the command line is read-only, and --strict fails on a dead link or broken redirect', { timeout: 60_000 }, async () => {
  const dir = project(SPA);
  try {
    const before = readFileSync(join(dir, 'client/src/App.tsx'), 'utf8');
    const run = (...args) => spawnBounded(process.execPath, [script, '--root', dir, ...args], { cwd: dir, timeoutMs: 20_000 });
    let result = await run('--declared', 'docs/sitemap.md', '--out', join(dir, 'map.json'));
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /dead links: 1\n    - \/reports {2}\(client\/src\/lib\/nav\.ts:5\)/);
    assert.match(result.stdout, /1 listed but not in code \(\/ghost\); 1 in code but not listed \(\/hidden\)/);
    assert.equal(JSON.parse(readFileSync(join(dir, 'map.json'), 'utf8')).tool, 'fe-scan/app-map');
    assert.equal(readFileSync(join(dir, 'client/src/App.tsx'), 'utf8'), before);

    result = await run('--strict');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /STRICT: 2 link\(s\) or redirect\(s\) point at a screen that does not exist/);

    // Fix both and it passes; an ignored prefix is not judged.
    writeFileSync(join(dir, 'client/src/App.tsx'), before.replace('to="/dashboard"', 'to="/home"'));
    assert.equal((await run('--strict', '--ignore', '/api,/reports')).code, 0);
    assert.equal((await run('--strict')).code, 1);
    assert.equal((await spawnBounded(process.execPath, [script, '--root', join(dir, 'docs')], { cwd: dir, timeoutMs: 20_000 })).code, 2, 'no routes: exit 2, never an empty pass');
    assert.equal((await run('--declared', 'docs/missing.md')).code, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

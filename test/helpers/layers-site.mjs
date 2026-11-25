// A small site served three ways, for the fe-layers tests.
//   ref    the reference: classic markup, five pages, a sitemap index
//   good   a rebuild: different markup, different words, the same layers, one old page dropped
//   drift  the same rebuild after a careless edit: a stray font and size, a stray radius, slow linear motion
// server.variant picks which one is served; server.redirectOld makes the dropped page redirect; server.writes counts non-GET requests.
import { createServer } from 'node:http';

const BASE = `
:root{--canvas:#fbf8f2;--ink:#24302a;--soft:#5d6b62;--accent:#2f6b4f;--line:#d9d2c3}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Verdana,sans-serif;font-size:16px;font-weight:400;color:var(--ink);background:var(--canvas)}
h1,h2{font-family:Georgia,serif;font-weight:700}
h1{font-size:32px;margin-bottom:16px} h2{font-size:20px;margin-bottom:8px}
header,main,footer{padding:24px 16px}
nav{display:flex;gap:16px}
a{color:var(--accent);transition:color 200ms ease-out}
a:hover{color:var(--ink)}
.note{font-size:14px;color:var(--soft);margin-top:8px}
.grid{display:grid;gap:24px;margin-top:32px}
.card{background:#ffffff;border:1px solid var(--line);border-radius:12px;padding:24px;box-shadow:rgba(36,48,42,.12) 0 8px 24px 0}
.cta{display:inline-block;margin-top:16px;padding:12px 24px;border:1px solid var(--accent);border-radius:999px;background:var(--accent);color:#ffffff;font-family:Verdana,sans-serif;font-size:16px;transition:background-color 200ms ease-out}
.cta:hover{background:var(--ink)}
a:focus-visible,button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
footer{border-top:1px solid var(--line);font-size:14px;color:var(--soft)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

// The careless edit. Each rule lands on many elements so the layer it touches drops well under its pass mark.
const DRIFT = `
.card h2,.card p,.note{font-family:Arial,sans-serif;font-size:15px}
.card{border-radius:7px}
a,.cta{transition-duration:900ms;transition-timing-function:linear}
`;

const PAGES = {
  '/': ['Bamboo rooms by the sea', ['Quiet mornings', 'Local food', 'Boat days', 'Slow evenings']],
  '/rooms/': ['Rooms', ['Garden room', 'Sea room', 'Family house']],
  '/contact/': ['Contact', ['Write to us', 'Find us']],
  '/old-offer/': ['Rainy season offer', ['Three nights', 'Four nights']],
  '/news/hello/': ['Hello from the island', ['This month']],
};
const NAV = [['/', 'Home'], ['/rooms/', 'Rooms'], ['/contact/', 'Contact']];

function page(path, variant) {
  const [title, cards] = PAGES[path];
  const rebuilt = variant !== 'ref';
  const words = rebuilt ? 'A new sentence for the rebuilt site, written fresh.' : 'A sentence on the reference site.';
  const card = name => (rebuilt
    ? `<article class="card" data-part="card"><h2>${name}</h2><p>${words}</p><p class="note">From the rebuild.</p><button class="cta" type="button">Ask about ${name.toLowerCase()}</button></article>`
    : `<div class="card"><h2>${name}</h2><p>${words}</p><p class="note">Small print.</p><a class="cta" href="/contact/">See ${name.toLowerCase()}</a></div>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Fixture Inn</title>
<style>${BASE}${variant === 'drift' ? DRIFT : ''}</style></head><body>
<header><nav aria-label="Main">${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav></header>
<main><h1>${title}</h1><p>${words}</p><div class="grid">${cards.map(card).join('')}</div></main>
<footer><p>Fixture Inn, a made-up place.</p></footer></body></html>`;
}

const xml = (tag, urls, origin) => `<?xml version="1.0" encoding="UTF-8"?><${tag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<${tag === 'sitemapindex' ? 'sitemap' : 'url'}><loc>${origin}${u}</loc></${tag === 'sitemapindex' ? 'sitemap' : 'url'}>`).join('')}</${tag}>`;

export function serveLayersSite(variant = 'ref') {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') server.writes += 1;
    const origin = `http://127.0.0.1:${server.address().port}`;
    const path = req.url.split('?')[0];
    const live = Object.keys(PAGES).filter(p => server.variant === 'ref' || p !== '/old-offer/');
    const send = (type, body) => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    // The posts sitemap is listed first on purpose: pages must still be read before posts.
    if (path === '/sitemap.xml') return send('application/xml', xml('sitemapindex', ['/post-sitemap.xml', '/page-sitemap.xml'], origin));
    if (path === '/page-sitemap.xml') return send('application/xml', xml('urlset', live.filter(p => !p.startsWith('/news/')), origin));
    if (path === '/post-sitemap.xml') return send('application/xml', xml('urlset', live.filter(p => p.startsWith('/news/')), origin));
    if (path === '/old-offer/' && server.variant !== 'ref' && server.redirectOld) { res.writeHead(301, { location: '/rooms/' }); return res.end(); }
    if (!live.includes(path)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    return send('text/html; charset=utf-8', page(path, server.variant));
  });
  server.variant = variant; server.redirectOld = false; server.writes = 0;
  return new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => done(server)); });
}

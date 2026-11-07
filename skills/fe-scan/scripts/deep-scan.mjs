#!/usr/bin/env node
// Usage: node deep-scan.mjs <url> [--pages 10] [--devices all|mobile|desktop] [--monkey 60] [--no-forms] [--no-monkey]
// Requires: npm i -D playwright gremlins.js && npx playwright install chromium
// --no-forms: safe for production; monkey test will not type into or submit forms, and all form submissions are blocked.
import { chromium, devices as pwDevices } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args[0];
if (!url) { console.error('Usage: node deep-scan.mjs <url> [--pages N] [--devices all|mobile|desktop] [--monkey SECONDS] [--no-forms] [--no-monkey]'); process.exit(1); }
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
const maxPages = Number(opt('pages', 10));
const monkeySeconds = Number(opt('monkey', 60));
const deviceSel = opt('devices', 'all');
const noForms = args.includes('--no-forms');
const noMonkey = args.includes('--no-monkey');

const origin = new URL(url).origin;
const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const stamp = new Date().toISOString().slice(0, 10);
const out = join('design', 'reports', 'scan', site, stamp);
mkdirSync(out, { recursive: true });

const matrix = {
  'pixel-7': { ...pwDevices['Pixel 7'] },
  'iphone-14': { ...pwDevices['iPhone 14'] },
  'ipad': { ...pwDevices['iPad (gen 7)'] },
  'laptop': { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  'desktop': { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }
};
const chosen = deviceSel === 'mobile' ? ['pixel-7', 'iphone-14'] : deviceSel === 'desktop' ? ['laptop', 'desktop'] : Object.keys(matrix);

const browser = await chromium.launch();
const report = { url, stamp, noForms, pages: [], devices: chosen, errors: [], flows: [], monkey: [], perf: {} };
const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { report.errors.push(String(e.message || e).slice(0, 160)); return fallback; } };

async function discoverPages() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let urls = [];
  try {
    const res = await page.goto(`${origin}/sitemap.xml`, { timeout: 15000 });
    if (res && res.ok()) { const xml = await page.content(); urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(u => u.startsWith(origin) && !u.endsWith('.xml') && !/\.(jpg|jpeg|png|webp|gif|svg|pdf)$/i.test(u)); }
  } catch {}
  if (!urls.length) {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    urls = await safe(() => page.evaluate(o => [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith(o) && !h.includes('#')))], origin), []);
  }
  await ctx.close();
  const ranked = [url, ...urls.filter(u => u !== url)];
  return [...new Set(ranked)].slice(0, maxPages);
}

const SECTION_JS = () => {
  const toNum = v => parseFloat(v) || 0;
  const nodes = [...document.querySelectorAll('header, footer, main > *, body > section, body > div > section, [class*=section]')].filter(n => n.getBoundingClientRect().height > 40);
  const seen = new Set();
  return nodes.filter(n => { if (seen.has(n)) return false; seen.add(n); return true; }).slice(0, 40).map((n, i) => {
    const r = n.getBoundingClientRect(); const s = getComputedStyle(n);
    const h = n.querySelector('h1,h2,h3'); const hs = h ? getComputedStyle(h) : null;
    const imgs = [...n.querySelectorAll('img')].map(im => ({ rendered: [Math.round(im.clientWidth), Math.round(im.clientHeight)], intrinsic: [im.naturalWidth, im.naturalHeight], alt: !!im.alt, lazy: im.loading === 'lazy' }));
    const ctas = [...n.querySelectorAll('a[class*=btn],a[class*=button],button')].map(b => { const br = b.getBoundingClientRect(); return { text: b.textContent.trim().slice(0, 40), w: Math.round(br.width), h: Math.round(br.height) }; });
    const pads = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(toNum);
    const off4 = pads.filter(p => p % 4 !== 0).length;
    const texts = [...n.querySelectorAll('p,li,span')].slice(0, 30).map(t => toNum(getComputedStyle(t).fontSize)).filter(Boolean);
    return { index: i, tag: n.tagName.toLowerCase(), id: n.id || null, cls: (n.className || '').toString().slice(0, 80), top: Math.round(r.top + scrollY), height: Math.round(r.height), width: Math.round(r.width), padding: pads, margin: [s.marginTop, s.marginBottom].map(toNum), gap: toNum(s.gap || s.rowGap), background: s.backgroundColor, heading: h ? { level: h.tagName, size: toNum(hs.fontSize), lineHeight: hs.lineHeight, family: hs.fontFamily.split(',')[0] } : null, minTextPx: texts.length ? Math.min(...texts) : null, images: imgs, ctas, flags: { paddingOffScale: off4 > 0, tallOnMobile: innerWidth < 500 && r.height > innerHeight * 2, smallText: texts.some(t => t < 16) && innerWidth < 500, smallTap: ctas.some(c => c.h < 44 || c.w < 44), upscaledImage: imgs.some(im => im.intrinsic[0] && im.rendered[0] > im.intrinsic[0] * 1.5) } };
  });
};

async function scanPage(pageUrl, devKey) {
  const ctx = await browser.newContext({ ...matrix[devKey] });
  const page = await ctx.newPage();
  const errs = []; const failed = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => m.type() === 'error' && errs.push(m.text())); page.on('requestfailed', r => failed.push(r.url()));
  const t0 = Date.now();
  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => errs.push('goto: ' + e.message));
  const loadMs = Date.now() - t0;
  const slug = new URL(pageUrl).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';
  const dir = join(out, 'screens', devKey, slug); mkdirSync(dir, { recursive: true });
  await safe(() => page.screenshot({ path: join(dir, 'fold.png') }));
  await safe(() => page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); }));
  await safe(() => page.screenshot({ path: join(dir, 'full.png'), fullPage: true }));
  const sections = await safe(() => page.evaluate(SECTION_JS), []);
  for (const s of sections) { await safe(() => page.screenshot({ path: join(dir, `${String(s.index).padStart(2, '0')}-${s.tag}${s.id ? '-' + s.id : ''}.png`), clip: { x: 0, y: s.top, width: matrix[devKey].viewport.width, height: Math.min(s.height, 4000) }, fullPage: true })); }
  const overflow = await safe(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const vitals = await safe(() => page.evaluate(() => new Promise(res => { const o = {}; try { new PerformanceObserver(l => { const e = l.getEntries().pop(); if (e) o.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); new PerformanceObserver(l => { o.cls = (o.cls || 0) + l.getEntries().reduce((a, e) => a + (e.hadRecentInput ? 0 : e.value), 0); }).observe({ type: 'layout-shift', buffered: true }); new PerformanceObserver(l => { o.longTasks = (o.longTasks || 0) + l.getEntries().length; o.tbt = (o.tbt || 0) + l.getEntries().reduce((a, e) => a + Math.max(0, e.duration - 50), 0); }).observe({ type: 'longtask', buffered: true }); } catch {} const n = performance.getEntriesByType('navigation')[0]; o.ttfb = n ? Math.round(n.responseStart) : null; o.requests = performance.getEntriesByType('resource').length; o.bytes = performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0); setTimeout(() => res(o), 1500); })), {});
  const links = await safe(() => page.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => a.closest('nav, header') || /btn|button|cta/i.test(a.className)).slice(0, 12).map(a => ({ text: a.textContent.trim().slice(0, 40), href: a.href }))), []);
  await ctx.close();
  return { url: pageUrl, device: devKey, slug, loadMs, overflow, vitals, sections, errors: errs, failedRequests: failed, keyLinks: links };
}

async function flowWalk(pageUrl, devKey, keyLinks) {
  const ctx = await browser.newContext({ ...matrix[devKey] }); const page = await ctx.newPage(); const steps = [];
  for (const l of keyLinks.filter(k => k.href.startsWith(origin)).slice(0, 8)) {
    const t = Date.now(); let status = 'ok';
    try { const r = await page.goto(l.href, { waitUntil: 'domcontentloaded', timeout: 30000 }); if (!r || r.status() >= 400) status = `http ${r && r.status()}`; } catch (e) { status = 'fail: ' + e.message.slice(0, 80); }
    const afterClick = await safe(() => page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent.trim().slice(0, 80) || null, hasForm: !!document.querySelector('form'), hasCta: !!document.querySelector('a[class*=btn],a[class*=button],button'), telLinks: document.querySelectorAll('a[href^="tel:"]').length, external: [...document.querySelectorAll('a[href]')].filter(a => !a.href.startsWith(location.origin) && /book|reserve|pay|inquire/i.test(a.textContent)).length })), null);
    steps.push({ from: pageUrl, text: l.text, href: l.href, ms: Date.now() - t, status, afterClick });
  }
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const forms = await safe(() => page.evaluate(() => [...document.querySelectorAll('form')].map(f => ({ action: f.action, method: f.method, fields: f.querySelectorAll('input,select,textarea').length, required: f.querySelectorAll('[required]').length, hasLabels: [...f.querySelectorAll('input')].every(i => i.labels?.length || i.getAttribute('aria-label') || i.placeholder), inputTypes: [...f.querySelectorAll('input')].map(i => i.type), hasConsent: !!f.querySelector('input[type=checkbox]'), hasHoneypotOrCaptcha: !!(f.querySelector('[name*=captcha],[class*=captcha],[name*=honey],[class*=g-recaptcha],[data-sitekey]')) }))), []);
  await ctx.close();
  return { url: pageUrl, device: devKey, steps, forms };
}

async function monkey(pageUrl, devKey) {
  const gpath = 'node_modules/gremlins.js/dist/gremlins.min.js';
  if (!existsSync(gpath)) return { url: pageUrl, device: devKey, skipped: 'gremlins.js not installed (npm i gremlins.js)' };
  const ctx = await browser.newContext({ ...matrix[devKey] }); const page = await ctx.newPage();
  const errs = []; const failed = []; let navigations = 0;
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => m.type() === 'error' && errs.push(m.text())); page.on('requestfailed', r => failed.push(r.url()));
  page.on('framenavigated', f => { if (f === page.mainFrame()) navigations++; });
  await page.route('**/*', route => {
    const r = route.request();
    if (r.isNavigationRequest() && r.frame() === page.mainFrame() && r.url() !== pageUrl && navigations > 0) return route.abort();
    if (noForms && r.method() === 'POST') return route.abort();
    return route.continue();
  });
  await page.addInitScript({ path: gpath });
  await page.addInitScript(nf => {
    window.__clicks = [];
    addEventListener('click', e => { window.__clicks.push([e.clientX, e.clientY + scrollY]); if (e.target.closest('a[href]')) e.preventDefault(); if (nf && e.target.closest('button[type=submit],input[type=submit],form button')) e.preventDefault(); }, true);
    addEventListener('submit', e => { if (nf) e.preventDefault(); }, true);
    addEventListener('beforeunload', e => { e.preventDefault(); });
    const stop = () => {}; window.open = stop;
  }, noForms);
  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  navigations = 1;
  await page.evaluate(({ sec, nf }) => new Promise(res => { const species = [gremlins.species.clicker(), gremlins.species.toucher(), gremlins.species.scroller()]; if (!nf) species.push(gremlins.species.formFiller(), gremlins.species.typer()); const h = gremlins.createHorde({ species, mogwais: [gremlins.mogwais.fps(), gremlins.mogwais.gizmo({ maxErrors: 50 })], strategies: [gremlins.strategies.distribution({ delay: 20 })] }); h.unleash(); setTimeout(res, sec * 1000); }), { sec: monkeySeconds, nf: noForms }).catch(e => errs.push('horde: ' + e.message.slice(0, 120)));
  const pts = await safe(() => page.evaluate(() => window.__clicks || []), []);
  const dims = await safe(() => page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })), { w: matrix[devKey].viewport.width, h: matrix[devKey].viewport.height });
  await ctx.close();
  return { url: pageUrl, device: devKey, seconds: monkeySeconds, noForms, errors: errs, failedRequests: failed, navigationsBlocked: Math.max(0, navigations - 1), clickPoints: pts.length, clicks: pts, pageDims: dims };
}

function heatmapSVG(points, dims, w = 600) {
  const scale = w / Math.max(1, dims.w); const h = Math.round(dims.h * scale);
  const circles = points.map(([x, y]) => `<circle cx="${(x * scale).toFixed(1)}" cy="${(y * scale).toFixed(1)}" r="14" fill="url(#g)"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="g"><stop offset="0" stop-color="red" stop-opacity=".35"/><stop offset="1" stop-color="red" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="#0000"/>${circles}</svg>`;
}

function attentionSVG(sections, dims, w = 600) {
  const scale = w / Math.max(1, dims.w); const h = Math.round(dims.h * scale);
  const vh = dims.vh || 900;
  const rects = sections.map(s => { const aboveFold = s.top < vh ? 1 : s.top < vh * 2 ? 0.6 : 0.3; const hasH = s.heading ? 1.2 : 1; const img = s.images.length ? 1.15 : 1; const cta = s.ctas.length ? 1.2 : 1; const score = Math.min(1, 0.25 * aboveFold * hasH * img * cta); return `<rect x="0" y="${(s.top * scale).toFixed(1)}" width="${w}" height="${(s.height * scale).toFixed(1)}" fill="hsl(${Math.round(240 - 240 * score)},90%,50%)" fill-opacity="${(0.15 + 0.35 * score).toFixed(2)}"/><text x="6" y="${(s.top * scale + 14).toFixed(1)}" font-size="11" fill="#000">${s.tag}${s.id ? '#' + s.id : ''} attn=${score.toFixed(2)}</text>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rects}</svg>`;
}

function writeReport() {
  const all = Object.values(report.perf);
  const flat = all.flatMap(r => r.sections.map(s => ({ ...s, device: r.device, page: r.slug })));
  const onScale = flat.filter(s => !s.flags.paddingOffScale).length / Math.max(1, flat.length);
  const summary = {
    pagesScanned: report.pages.length, devices: chosen, noForms,
    overflowPages: all.filter(r => r.overflow).map(r => `${r.slug}@${r.device}`),
    avgLoadMs: Math.round(all.reduce((a, r) => a + r.loadMs, 0) / Math.max(1, all.length)),
    worstLcp: all.map(r => ({ p: `${r.slug}@${r.device}`, lcp: r.vitals.lcp })).filter(x => x.lcp).sort((a, b) => b.lcp - a.lcp).slice(0, 5),
    worstCls: all.map(r => ({ p: `${r.slug}@${r.device}`, cls: +(r.vitals.cls || 0).toFixed(3) })).sort((a, b) => b.cls - a.cls).slice(0, 5),
    longTaskHotspots: all.map(r => ({ p: `${r.slug}@${r.device}`, longTasks: r.vitals.longTasks || 0, tbt: Math.round(r.vitals.tbt || 0) })).sort((a, b) => b.tbt - a.tbt).slice(0, 5),
    heaviestPages: all.map(r => ({ p: `${r.slug}@${r.device}`, kb: Math.round((r.vitals.bytes || 0) / 1024), requests: r.vitals.requests })).sort((a, b) => b.kb - a.kb).slice(0, 5),
    paddingOnScaleRatio: +onScale.toFixed(2),
    flaggedSections: flat.filter(s => Object.values(s.flags).some(Boolean)).length,
    runtimeErrors: all.reduce((a, r) => a + r.errors.length, 0),
    flowFailures: report.flows.flatMap(f => f.steps).filter(s => s.status !== 'ok'),
    deadEndsAfterClick: report.flows.flatMap(f => f.steps).filter(s => s.afterClick && !s.afterClick.hasCta && !s.afterClick.hasForm).map(s => s.href),
    monkeyErrors: report.monkey.reduce((a, m) => a + (m.errors ? m.errors.length : 0), 0),
    scriptErrors: report.errors.length
  };
  report.summary = summary;
  writeFileSync(join(out, 'scan.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(out, 'sections.json'), JSON.stringify(flat, null, 2));
  const md = [`# Deep scan: ${url} (${stamp})${noForms ? ' [no-forms mode]' : ''}`, '', '## Summary', '```json', JSON.stringify(summary, null, 2), '```', '', '## Sections (flagged)', '| page | device | section | height | padding | heading | flags |', '|---|---|---|---|---|---|---|', ...flat.filter(s => Object.values(s.flags).some(Boolean)).map(s => `| ${s.page} | ${s.device} | ${s.tag}${s.id ? '#' + s.id : ''} | ${s.height} | ${s.padding.join('/')} | ${s.heading ? s.heading.level + ' ' + s.heading.size + 'px' : '-'} | ${Object.entries(s.flags).filter(([, v]) => v).map(([k]) => k).join(', ')} |`), '', '## Flow log (what happens after the click)', '| from | link | ms | status | lands on H1 | next step available |', '|---|---|---|---|---|---|', ...report.flows.flatMap(f => f.steps.map(s => `| ${f.device} ${new URL(f.url).pathname} | ${s.text} | ${s.ms} | ${s.status} | ${s.afterClick?.h1 || '-'} | ${s.afterClick ? (s.afterClick.hasForm ? 'form' : s.afterClick.hasCta ? 'cta' : 'DEAD END') : '-'} |`)), '', '## Forms', ...report.flows.flatMap(f => f.forms.map(fm => `- ${f.device} ${new URL(f.url).pathname}: ${fm.fields} fields (${fm.required} required), types ${[...new Set(fm.inputTypes)].join('/')}, labels ${fm.hasLabels}, consent ${fm.hasConsent}, spam protection ${fm.hasHoneypotOrCaptcha}, action ${fm.action}`)), '', '## Monkey test', ...report.monkey.map(m => `- ${m.device} ${new URL(m.url).pathname}: ${m.skipped || `${m.seconds}s${m.noForms ? ' (forms protected)' : ''}, ${m.clickPoints} clicks, ${m.errors.length} errors, ${m.failedRequests.length} failed requests, ${m.navigationsBlocked} navigations blocked`}`), '', report.errors.length ? `## Script warnings (${report.errors.length})\n` + report.errors.slice(0, 20).map(e => '- ' + e).join('\n') : '', '', `Artifacts: screens/, heatmaps/ (PREDICTED attention, MONKEY click), scan.json, sections.json. Next: elements.mjs, trace.mjs, seo-hygiene.mjs, psi.mjs.`].join('\n');
  writeFileSync(join(out, 'report.md'), md);
  return summary;
}

process.on('unhandledRejection', e => { report.errors.push('unhandled: ' + String(e.message || e).slice(0, 160)); });

try {
  const pages = await discoverPages();
  report.pages = pages;
  mkdirSync(join(out, 'heatmaps'), { recursive: true });
  for (const p of pages) {
    for (const d of chosen) {
      const r = await safe(() => scanPage(p, d), null); if (!r) continue;
      report.perf[`${r.slug}|${d}`] = r;
      const dims = { w: matrix[d].viewport.width, h: r.sections.length ? r.sections.at(-1).top + r.sections.at(-1).height : matrix[d].viewport.height, vh: matrix[d].viewport.height };
      writeFileSync(join(out, 'heatmaps', `${r.slug}-${d}-attention-PREDICTED.svg`), attentionSVG(r.sections, dims));
      if (pages.indexOf(p) < 3) {
        const f = await safe(() => flowWalk(p, d, r.keyLinks), null); if (f) report.flows.push(f);
        if (!noMonkey && (d === 'pixel-7' || d === 'desktop')) { const m = await safe(() => monkey(p, d), null); if (m) { report.monkey.push({ ...m, clicks: undefined }); if (m.clicks && m.clicks.length) writeFileSync(join(out, 'heatmaps', `${r.slug}-${d}-click-MONKEY.svg`), heatmapSVG(m.clicks, m.pageDims)); } }
      }
      console.error(`scanned ${r.slug} @ ${d}`);
    }
  }
} finally {
  await browser.close().catch(() => {});
  const summary = writeReport();
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${out}/report.md`);
}

#!/usr/bin/env node
// Usage:
//   node layers.mjs read <url> --name <name> [--pages 12]            measure every page of a site, layer by layer; write a draft spec
//   node layers.mjs colour <spec.json> <tokens.json>                 take the colour layer from a style guide (fe-pinterest) instead
//   node layers.mjs css <spec.json> [--out src/styles/layers.css]    the approved spec as CSS variables, one cascade layer each
//   node layers.mjs gate <url> --spec <spec.json> [--pages 12] [--layer type,space] [--keep-urls <old read.json>]
//   node layers.mjs --selftest
// Read-only: it loads pages, scrolls, presses Tab and hovers. It never clicks, types or submits.
// gate exits 0 PASS, 1 FAIL or REGRESSED, 2 could not run, 3 STUCK (stop and ask a person).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LAYERS, STUCK_AFTER, decide, draftSpec, formatRead, formatScorecard, scoreLayers, specCss, withColour, worstOf } from './layers-core.mjs';

const WIDTHS = { mobile: 390, desktop: 1440 };
const MAX_KEPT = 80;

// Runs in the page. Counts what every visible element uses, layer by layer. Each entry is [value, count, example].
const CENSUS = (ignore) => {
  const maps = {};
  // Chat bubbles and cookie banners belong to another company's product, not to the site's look. They are named, not counted.
  const vendors = ['chaty', 'tawk', 'crisp-client', 'intercom', 'drift-', 'hubspot-messages', 'zopim', 'joinchat', 'fb-customerchat', 'fb_dialog', 'tidio', 'livechat', 'elfsight', 'onetrust', 'cky-consent', 'cookieyes', 'cookiebot', 'grecaptcha'];
  const guests = [...document.querySelectorAll(vendors.map(v => `[class*="${v}" i],[id*="${v}" i]`).join(','))].filter(el => !/^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName));
  try { if (ignore) guests.push(...document.querySelectorAll(ignore)); } catch { /* a bad selector ignores nothing */ }
  const roots = guests.filter(el => !guests.some(other => other !== el && other.contains(el)));
  const label = el => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '');
  const add = (key, value, el) => { if (value == null || value === '') return; const m = maps[key] || (maps[key] = new Map()); const hit = m.get(value); if (hit) hit[1] += 1; else m.set(value, [value, 1, label(el)]); };
  const clear = v => !v || v === 'transparent' || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(v);
  const ms = v => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000);
  const tenth = v => `${Math.round(parseFloat(v) * 10) / 10}px`;
  const radius = v => (v === '50%' ? 'round' : /px$/.test(v) && parseFloat(v) >= 500 ? 'pill' : /px$/.test(v) ? tenth(v) : v);
  let moving = 0; const headingFamilies = {};
  const all = [document.body, ...document.querySelectorAll('body *')].filter(el => {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|BR)$/.test(el.tagName) || (el.closest('svg') && el.tagName.toLowerCase() !== 'svg')) return false;
    if (roots.some(root => root.contains(el))) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }).slice(0, 5000);
  for (const el of all) {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.opacity === '0') continue;
    const box = el.getBoundingClientRect();
    const hasText = box.width > 2 && box.height > 2 && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      const family = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      add('text', s.color, el); if (!/icon|awesome|glyph|symbols?\b|dashicons/i.test(family)) add('families', family, el); add('sizes', tenth(s.fontSize), el); add('weights', s.fontWeight, el);
      if (/^H[1-3]$/.test(el.tagName)) headingFamilies[family] = (headingFamilies[family] || 0) + 1;
    }
    const filled = !clear(s.backgroundColor);
    if (filled) add('fill', s.backgroundColor, el);
    let edged = false;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const width = parseFloat(s[`border${side}Width`]);
      if (width > 0 && s[`border${side}Style`] !== 'none' && !clear(s[`border${side}Color`])) { edged = true; add('line', s[`border${side}Color`], el); add('borders', tenth(s[`border${side}Width`]), el); break; }
    }
    const shadowed = s.boxShadow && s.boxShadow !== 'none';
    if (shadowed) add('shadows', s.boxShadow, el);
    const corners = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
    if (corners.some(c => parseFloat(c) > 0) && (filled || edged || shadowed || s.backgroundImage !== 'none' || /^(IMG|VIDEO|IFRAME)$/.test(el.tagName))) {
      add('radii', corners.every(c => c === corners[0]) ? radius(corners[0]) : corners.map(radius).join(' '), el);
    }
    for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom']) { const gap = parseFloat(s[prop]); if (gap > 0 && gap <= 200) add('space', tenth(s[prop]), el); }
    if (/flex|grid/.test(s.display)) for (const prop of ['rowGap', 'columnGap']) { if (parseFloat(s[prop]) > 0) add('space', tenth(s[prop]), el); }
    const durations = s.transitionProperty === 'none' ? [] : [...new Set(s.transitionDuration.split(',').map(v => ms(v.trim())).filter(v => v > 0))];
    for (const d of durations) add('durations', String(Math.round(d)), el);
    if (durations.length) add('easings', s.transitionTimingFunction.split(/,(?![^(]*\))/)[0].trim(), el);
    if (s.animationName && s.animationName !== 'none') for (const d of new Set(s.animationDuration.split(',').map(v => ms(v.trim())).filter(v => v > 0))) add('durations', String(Math.round(d)), el);
    if (durations.length || (s.animationName && s.animationName !== 'none')) moving += 1;
  }
  let reducedRules = 0; let unreadable = 0;
  const walk = rules => { for (const rule of rules) { if (rule.media && /prefers-reduced-motion/.test(rule.conditionText || rule.media.mediaText || '')) reducedRules += 1; if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules); } };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { unreadable += 1; } }
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => h.getBoundingClientRect().width > 0);
  const levels = headings.map(h => Number(h.tagName[1]));
  const skip = levels.findIndex((level, i) => i > 0 && level > levels[i - 1] + 1);
  const h1 = levels.filter(level => level === 1).length;
  const over = document.documentElement.scrollWidth - window.innerWidth;
  const has = sel => !!document.querySelector(sel);
  const structure = [
    ['one h1', h1 === 1, `${h1} found`],
    ['main landmark', has('main,[role=main]'), ''],
    ['nav landmark', has('nav,[role=navigation]'), ''],
    ['footer', has('footer,[role=contentinfo]'), ''],
    ['heading order', skip === -1, skip === -1 ? '' : `h${levels[skip - 1]} then h${levels[skip]}`],
    ['no sideways scroll', over <= 1, `${over}px too wide`],
    ['lang set', !!document.documentElement.lang, ''],
    ['title set', !!document.title.trim(), ''],
  ];
  const list = key => [...(maps[key] || new Map()).values()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  return {
    structure,
    outline: { title: document.title.slice(0, 80), headings: headings.slice(0, 30).map(h => `${h.tagName.toLowerCase()} ${h.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)}`), images: document.images.length, forms: document.forms.length, heightPx: document.documentElement.scrollHeight },
    colour: { text: list('text'), fill: list('fill'), line: list('line') },
    type: { families: list('families'), sizes: list('sizes'), weights: list('weights') },
    space: { values: list('space') },
    shape: { radii: list('radii'), borders: list('borders') },
    depth: { shadows: list('shadows') },
    motion: { durations: list('durations'), easings: list('easings'), moving, reducedRules: reducedRules === 0 && unreadable > 0 ? null : reducedRules },
    notCounted: [...new Set(roots.map(label))].slice(0, 8),
    headingFamily: Object.entries(headingFamilies).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  };
};

// Installed in the page once: a fingerprint of how a control looks, and the fingerprint of every control at rest.
const INSTALL = () => {
  window.__feSnap = el => {
    const s = getComputedStyle(el); const c = el.firstElementChild ? getComputedStyle(el.firstElementChild) : null;
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.backgroundColor, s.backgroundImage, s.color, s.borderTopColor, s.borderBottomColor, s.borderBottomWidth, s.textDecorationLine, s.transform, s.opacity, s.filter, c && c.color, c && c.transform, c && c.opacity].join('|');
  };
  window.scrollTo(0, 0); window.__feBase = new Map();
  for (const el of [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].slice(0, 120)) window.__feBase.set(el, window.__feSnap(el));
};

// Tab eight times and look for a visible focus mark; on a wide screen, hover eight controls and look for a change.
async function probe(page, device) {
  const out = [];
  await page.evaluate(INSTALL);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab'); await page.waitForTimeout(80);
    const seen = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.tagName === 'IFRAME' || !window.__feBase.has(el)) return null;
      const s = getComputedStyle(el);
      const ring = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      return { ok: ring || window.__feBase.get(el) !== window.__feSnap(el), label: `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || el.name || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"` };
    }).catch(() => null);
    if (seen) out.push(['focus', seen.ok, seen.label]);
  }
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.scrollTo(0, 0); }).catch(() => {});
  if (device === 'desktop') {
    let done = 0; let tried = 0;
    for (const handle of await page.$$('button, [role=button], a[class*=btn], a[class*=button], input[type=submit], nav a[href], header a[href]')) {
      if (done >= 8 || tried >= 20) break;
      if (!(await handle.isVisible().catch(() => false))) continue;
      tried += 1;
      try {
        const before = await handle.evaluate(el => window.__feSnap(el));
        await handle.hover({ timeout: 800 }); await page.waitForTimeout(180);
        const after = await handle.evaluate(el => ({ now: window.__feSnap(el), label: `${el.tagName.toLowerCase()} "${(el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"` }));
        out.push(['hover', before !== after.now, after.label]); done += 1;
      } catch { /* covered or moved away: not a finding */ }
    }
    await page.mouse.move(0, 0).catch(() => {});
  }
  return out;
}

const SITEMAP_LOC = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/g;
export function parseSitemap(xml) {
  const locs = [...String(xml).matchAll(SITEMAP_LOC)].map(m => m[1].replace(/&amp;/g, '&'));
  const index = /<sitemapindex/i.test(xml);
  return { sitemaps: index ? locs : [], pages: index ? [] : locs.filter(u => !/\.(xml|jpe?g|png|webp|avif|gif|svg|pdf|mp4)(\?|$)/i.test(u)) };
}

// The home page first, then the sitemap pages it links to, then the rest of the sitemap (an index is followed, pages before posts), then other links.
async function discover(page, startUrl, max, net) {
  const origin = new URL(page.url()).origin;
  const found = new Set([page.url().split('#')[0]]);
  const fetchText = async url => { try { const res = await net.safeFetch(url, { allowLoopbackFixture: net.loopback, signal: AbortSignal.timeout(15_000) }); return res.ok ? await res.text() : ''; } catch { return ''; } };
  const first = parseSitemap(await fetchText(`${origin}/sitemap.xml`));
  const children = first.sitemaps.filter(u => u.startsWith(origin)).sort((a, b) => (/page/.test(b) ? 1 : 0) - (/page/.test(a) ? 1 : 0)).slice(0, 4);
  const depth = u => new URL(u).pathname.split('/').filter(Boolean).length;
  const tidy = list => list.filter(u => u.startsWith(origin)).map(u => u.split('#')[0]).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  // Each sitemap keeps its place in the queue, so the pages sitemap is read before the posts one.
  const listed = tidy(first.pages);
  for (const child of children) listed.push(...tidy(parseSitemap(await fetchText(child)).pages));
  const links = await page.evaluate(o => [...document.querySelectorAll('a[href]')].map(a => a.href.split('#')[0]).filter(h => h.startsWith(o) && !/\.(jpe?g|png|webp|avif|gif|svg|pdf|zip|mp4)(\?|$)/i.test(h) && !/\/(wp-admin|wp-login|cart|checkout|account|logout)/i.test(h)), origin).catch(() => []);
  const bare = u => u.replace(/\/$/, '');
  const known = new Set(listed.map(bare));
  // Pages the home page itself points at come first: they are the ones a visitor reaches. Then the rest of the sitemap.
  const surfaced = listed.length ? links.filter(u => known.has(bare(u))) : links;
  for (const url of [...surfaced, ...listed, ...links]) { if (found.size >= max) break; if (![...found].some(f => bare(f) === bare(url))) found.add(url); }
  return { origin, urls: [...found], fromSitemap: listed.length };
}

// Many sites hold their scripts back until the visitor moves, and reveal sections only as they scroll into view.
// So: move, walk the whole page, then wait until the page has stopped growing before anything is counted.
async function settle(page) {
  const size = () => page.evaluate(() => `${document.querySelectorAll('body *').length}:${document.documentElement.scrollHeight}`).catch(() => '');
  const walk = () => page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, step * 40); y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.mouse.move(40, 40).catch(() => {}); await page.mouse.move(60, 90).catch(() => {});
  await walk();
  let last = await size();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(450);
    const now = await size();
    if (now === last && i >= 1) break;
    if (now !== last && i === 3) await walk();
    last = now;
  }
  await page.mouse.move(0, 0).catch(() => {});
}

// Visit every page on a phone and a wide screen. Returns { origin, paths, devices: { mobile: [page], desktop: [page] } }.
export async function readSite(startUrl, { maxPages = 12, allowLoopbackFixture = false, interaction = true, ignore = '' } = {}) {
  const { assertRequestAllowed, installRequestGuard, safeFetch } = await import('../../fe-scan/scripts/network-policy.mjs');
  await assertRequestAllowed(startUrl, 'GET', { allowLoopbackFixture });
  const { chromium, devices } = await import('playwright');
  const browser = await chromium.launch();
  const result = { origin: null, paths: [], devices: {}, failed: [], headingFamily: null, notCounted: [] };
  try {
    let urls = null;
    for (const device of ['desktop', 'mobile']) {
      const profile = device === 'desktop' ? { viewport: { width: WIDTHS.desktop, height: 900 } } : { ...devices['iPhone 14'], viewport: { width: WIDTHS.mobile, height: 844 } };
      const context = await browser.newContext({ ...profile, serviceWorkers: 'block' });
      await installRequestGuard(context, { allowLoopbackFixture });
      const page = await context.newPage();
      result.devices[device] = [];
      if (!urls) {
        await page.goto(startUrl, { waitUntil: 'load', timeout: 45_000 });
        const found = await discover(page, startUrl, maxPages, { safeFetch, loopback: allowLoopbackFixture });
        urls = found.urls; result.origin = found.origin; result.fromSitemap = found.fromSitemap;
        result.paths = urls.map(u => new URL(u).pathname + new URL(u).search);
      }
      for (const url of urls) {
        const path = new URL(url).pathname + new URL(url).search;
        try {
          const response = await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
          if (!response || response.status() >= 400) { result.failed.push({ path, device, status: response ? response.status() : 0 }); continue; }
          await settle(page);
          const census = await page.evaluate(CENSUS, ignore);
          for (const guest of census.notCounted) if (!result.notCounted.includes(guest)) result.notCounted.push(guest);
          if (!result.headingFamily && census.headingFamily) result.headingFamily = census.headingFamily;
          result.devices[device].push({ path, ...census, interaction: interaction ? await probe(page, device) : [] });
        } catch (error) { result.failed.push({ path, device, status: 0, reason: String(error.message || error).split('\n')[0].slice(0, 120) }); }
      }
      await context.close();
    }
  } finally { await browser.close(); }
  return result;
}

async function checkKept(origin, paths, allowLoopbackFixture) {
  const { safeFetch } = await import('../../fe-scan/scripts/network-policy.mjs');
  const out = [];
  for (const path of paths.slice(0, MAX_KEPT)) {
    try { const res = await safeFetch(origin + path, { allowLoopbackFixture, signal: AbortSignal.timeout(20_000) }); out.push({ path, status: res.status, ok: res.status < 400 }); } catch { out.push({ path, status: 0, ok: false }); }
  }
  return out;
}

function selftest() {
  const page = (path, over = {}) => ({ path, structure: [['one h1', true, '']], colour: { text: [['rgb(31, 25, 19)', 40, 'p']], fill: [['rgb(252, 245, 238)', 6, 'body']], line: [] }, type: { families: [['Inter', 40, 'p']], sizes: [['16px', 30, 'p'], ['32px', 10, 'h2']], weights: [['400', 30, 'p'], ['600', 10, 'h2']] }, space: { values: [['16px', 20, 'div'], ['24px', 10, 'section']] }, shape: { radii: [['8px', 6, 'a.btn']], borders: [['1px', 4, 'input']] }, depth: { shadows: [['rgba(0, 0, 0, 0.1) 0px 4px 12px 0px', 3, 'div.card']] }, motion: { durations: [['200', 8, 'a.btn']], easings: [['ease', 8, 'a.btn']], moving: 8, reducedRules: 1 }, interaction: [['focus', true, 'a'], ['hover', true, 'a']], ...over });
  const read = { name: 'self', origin: 'https://example.test', date: '2026-01-01', paths: ['/'], widths: [390, 1440], devices: { desktop: [page('/')] } };
  const spec = draftSpec(read);
  const good = scoreLayers([page('/')], spec);
  const drift = scoreLayers([page('/', { type: { families: [['Inter', 20, 'p'], ['Arial', 20, 'p.note']], sizes: [['16px', 30, 'p'], ['15px', 10, 'p.note']], weights: [['400', 40, 'p']] } })], spec);
  const still = scoreLayers([page('/', { motion: { durations: [['200', 8, 'a']], easings: [['ease', 8, 'a']], moving: 8, reducedRules: 0 } })], spec);
  const run = layers => ({ layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, { score: v.score, passed: v.passed }])) });
  const checks = [
    ['a draft spec keeps the values the site uses most', spec.type.sizes.join() === '16,32' && spec.space.base === 8 && spec.colour.palette.includes('#1f1913')],
    ['a page built from the spec passes every layer', decide(good).verdict === 'PASS' && Object.values(good).every(r => r.passed)],
    ['a second font and an off-scale size fail the type layer and are named', !drift.type.passed && drift.type.offenders.some(o => o.value === 'Arial') && drift.type.offenders.some(o => o.value === '15px')],
    ['only the layer that drifted fails', drift.colour.passed && drift.space.passed && decide(drift).next === 'type'],
    ['motion with no reduced-motion rule fails', !still.motion.passed],
    ['a layer that passed last run and fails now is a regression', decide(drift, [run(good)]).verdict === 'REGRESSED'],
    [`the same layer failing ${STUCK_AFTER} runs without a gain stops the loop`, decide(drift, [run(drift), run(drift)]).verdict === 'STUCK' && decide(drift, [run(drift)]).verdict === 'FAIL'],
    ['colour can come from a style guide instead', withColour(spec, { color: { accent: { $value: '#B1572C', $type: 'color' } } }).colour.palette.join() === '#b1572c'],
    ['the spec becomes CSS variables in cascade layers, with reduced motion handled', /@layer colour, type, space/.test(specCss(spec)) && /--text-1: 1rem/.test(specCss(spec)) && /prefers-reduced-motion/.test(specCss(spec))],
  ];
  checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} selftest checks passed`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selftest());
  const flag = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const json = path => JSON.parse(readFileSync(path, 'utf8'));
  const save = async (path, value) => { const { writeArtifact } = await import('../../fe-scan/scripts/artifacts.mjs'); mkdirSync(dirname(path), { recursive: true }); writeArtifact(path, value); };
  const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
  const [command, first, second] = args;
  const loopback = args.includes('--allow-loopback-fixture');
  const stamp = process.env.FE_SCAN_STAMP || new Date().toISOString().slice(0, 10);
  const fail = message => { console.error(message); process.exit(2); };
  const refused = error => {
    const reason = String(error.message || error).split('\n')[0];
    if (/^blocked/.test(reason)) return 'Target refused by the read-only network policy. For a dev server on this machine, add --allow-loopback-fixture.';
    if (/fe-scan/.test(reason)) return 'It needs the fe-scan skill installed beside it (that is where the read-only network guard lives): npx skills add jcrosento/frontend-mastery-skills --skill fe-scan';
    if (/playwright|Executable doesn't exist/i.test(reason)) return 'It needs a browser. Install one beside the skills: npm i --prefix ~/.agents playwright && ~/.agents/node_modules/.bin/playwright install chromium (for skills installed in a project, use --prefix .agents and keep .agents/node_modules out of git).';
    return `Could not run: ${reason}`;
  };

  if (command === 'read') {
    if (!first || first.startsWith('--')) fail('Usage: node layers.mjs read <url> --name <name> [--pages 12]');
    let site;
    try { site = await readSite(first, { maxPages: Number(flag('--pages') || 12), allowLoopbackFixture: loopback, interaction: false, ignore: flag('--ignore') || '' }); } catch (error) { fail(refused(error)); }
    const name = slug(flag('--name') || new URL(site.origin).hostname.replace(/^www\./, ''));
    const read = { name, origin: site.origin, date: stamp, widths: Object.values(WIDTHS), ...site };
    const spec = draftSpec(read);
    if (flag('--ignore')) spec.ignore = flag('--ignore');
    const out = flag('--out') || join('design', 'layers', name);
    await save(join(out, 'read.json'), read); await save(join(out, 'spec.draft.json'), spec);
    console.log(formatRead(read, spec));
    if (site.notCounted.length) console.log(`  NOT COUNTED ${site.notCounted.join(', ')} (another company's widget; name more with --ignore "<css selector>")`);
    const thin = (site.devices.desktop || []).filter(p => p.outline.heightPx <= 950 && p.outline.images <= 1).map(p => p.path);
    if (thin.length) console.log(`  THIN ${thin.join(', ')} (one screen, almost no content: decide whether each is kept, merged or redirected)`);
    if (site.fromSitemap > site.paths.length) console.log(`  ${site.paths.length} of ${site.fromSitemap} listed pages were read. Raise --pages to read more.`);
    if (site.failed.length) console.log(`  UNREAD ${site.failed.map(f => `${f.path} (${f.device}, ${f.status || 'timeout'})`).join(', ')}`);
    console.log(`WROTE ${join(out, 'read.json')} and spec.draft.json. Read the draft, edit it, save it as spec.json and delete its "status" line: that is the approval.`);
    process.exit(0);
  }

  if (command === 'colour' || command === 'color') {
    if (!first || !second) fail('Usage: node layers.mjs colour <spec.json> <tokens.json>');
    let next; try { next = withColour(json(first), json(second)); } catch (error) { fail(`Could not take the colours: ${error.message}`); }
    writeFileSync(first, JSON.stringify(next, null, 2));
    console.log(`Colour layer of ${first} now comes from ${second}: ${next.colour.palette.join('  ')}`);
    process.exit(0);
  }

  if (command === 'css') {
    if (!first) fail('Usage: node layers.mjs css <spec.json> [--out <file>]');
    const out = flag('--out') || join(dirname(first), 'layers.css');
    mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, specCss(json(first)));
    console.log(`WROTE ${out}`); process.exit(0);
  }

  if (command === 'gate') {
    const specPath = flag('--spec');
    if (!first || first.startsWith('--') || !specPath) fail('Usage: node layers.mjs gate <url> --spec <spec.json> [--pages 12] [--layer type,space] [--keep-urls <old read.json>]');
    if (!existsSync(specPath)) fail(`No spec at ${specPath}. Run "read" on the reference first, then approve the draft.`);
    const spec = json(specPath);
    if (/^draft/i.test(spec.status || '')) fail('This spec is still a draft. A person reads it, edits it and deletes its "status" line before anything is gated against it.');
    const only = flag('--layer') ? flag('--layer').split(',').map(s => s.trim()) : null;
    if (only && only.some(layer => !LAYERS.includes(layer))) fail(`Unknown layer. The layers are: ${LAYERS.join(', ')}`);
    let site; let kept = null;
    try {
      site = await readSite(first, { maxPages: only && only.join() === 'pages' ? 1 : Number(flag('--pages') || 12), allowLoopbackFixture: loopback, interaction: !only || only.includes('interaction'), ignore: [spec.ignore, flag('--ignore')].filter(Boolean).join(',') });
      if (flag('--keep-urls')) {
        // Paths that were already dead on the old site are not owed anything.
        const old = json(flag('--keep-urls')); const dead = new Set((old.failed || []).map(f => f.path));
        kept = await checkKept(site.origin, (old.paths || []).filter(path => !dead.has(path)), loopback);
      }
    } catch (error) { fail(refused(error)); }
    if (!site.devices.desktop.length && !site.devices.mobile.length) fail('No page could be read.');
    const byDevice = Object.fromEntries(Object.entries(site.devices).map(([device, pages]) => [device, scoreLayers(pages, spec, { only, kept })]));
    const layers = worstOf(byDevice);
    const out = flag('--out') || dirname(specPath);
    const log = join(out, 'runs.jsonl');
    // A run of one layer is a spot check: it is not logged, so it can neither lock nor unlock a layer.
    const history = !only && existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    const decision = decide(layers, history);
    const text = formatScorecard(spec.name || 'site', site.origin, layers, decision, site.paths.length)
      + (site.failed.length ? `\nUNREAD ${site.failed.map(f => `${f.path} (${f.device})`).join(', ')}` : '');
    await save(join(out, 'scorecard.json'), { name: spec.name, target: site.origin, date: stamp, pages: site.paths, verdict: decision.verdict, next: decision.next, tries: decision.tries, regressed: decision.regressed, layers, unread: site.failed });
    if (!only) appendFileSync(log, `${JSON.stringify({ date: stamp, verdict: decision.verdict, layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, { score: v.score, passed: v.passed }])) })}\n`);
    console.log(text);
    process.exit(decision.status);
  }

  fail('Usage: node layers.mjs read|colour|css|gate ...   (see the top of this file)');
}

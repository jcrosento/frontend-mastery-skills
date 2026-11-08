#!/usr/bin/env node
// Usage: node seo-hygiene.mjs <url> [--pages 20] [--keywords "island hopping iloilo,gigantes island tour"] [--gl ph] [--hl en]
// Checks sitemap, robots, canonical, titles/meta lengths, duplicates, encoding/mojibake, headings, JSON-LD presence/validity, hreflang; expands long-tail keywords via Google Suggest.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertRequestAllowed, safeFetch } from './network-policy.mjs';
import { writeArtifact, redactText } from './artifacts.mjs';

const url = process.argv[2];
if (!url) { console.error('Usage: node seo-hygiene.mjs <url> [--pages N] [--keywords "a,b"] [--gl ph] [--hl en]'); process.exit(1); }
const opt = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const maxPages = Number(opt('pages', 20)); const gl = opt('gl', 'ph'); const hl = opt('hl', 'en');
const seedKeywords = (opt('keywords', '') || '').split(',').map(s => s.trim()).filter(Boolean);
await assertRequestAllowed(url);
const origin = new URL(url).origin; const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const out = join('design', 'reports', 'scan', site, new Date().toISOString().slice(0, 10), 'seo'); mkdirSync(out, { recursive: true });
const UA = 'Mozilla/5.0 (compatible; fe-scan/0.1; +https://github.com/jcrosento/frontend-mastery-skills)';
const get = async u => { try { const r = await safeFetch(u, { headers: { 'user-agent': UA } }); return { status: r.status, text: await r.text(), ct: r.headers.get('content-type') || '', finalUrl: r.url }; } catch (e) { return { status: 0, text: '', ct: '', error: e.message }; } };

const report = { url, robots: {}, sitemap: {}, pages: [], issues: [], longTail: {} };
const robots = await get(`${origin}/robots.txt`);
report.robots = { status: robots.status, hasSitemap: /sitemap:/i.test(robots.text), disallows: [...robots.text.matchAll(/^disallow:\s*(\S+)/gim)].map(m => m[1]), blocksAssets: /disallow:\s*\/(wp-content|wp-includes|assets|static)/i.test(robots.text) };
if (robots.status !== 200) report.issues.push('robots.txt missing'); if (!report.robots.hasSitemap) report.issues.push('robots.txt does not reference a sitemap'); if (report.robots.blocksAssets) report.issues.push('robots.txt blocks CSS/JS/asset paths');

const smUrl = (robots.text.match(/sitemap:\s*(\S+)/i) || [])[1] || `${origin}/sitemap.xml`;
const collect = async (u, depth = 0) => { const r = await get(u); if (r.status !== 200) return { urls: [], errors: [`${u} -> ${r.status}`] }; if (!/xml/.test(r.ct) && !r.text.trim().startsWith('<?xml')) return { urls: [], errors: [`${u} not XML`] }; const locs = [...r.text.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map(m => m[1]); if (/<sitemapindex/.test(r.text) && depth < 2) { const all = []; const errs = []; for (const child of locs.slice(0, 20)) { const c = await collect(child, depth + 1); all.push(...c.urls); errs.push(...c.errors); } return { urls: all, errors: errs }; } const lastmods = [...r.text.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map(m => m[1]); return { urls: locs, errors: [], lastmods }; };
const sm = await collect(smUrl);
report.sitemap = { url: smUrl, count: sm.urls.length, errors: sm.errors, hasLastmod: !!(sm.lastmods && sm.lastmods.length), sameDayLastmod: sm.lastmods ? new Set(sm.lastmods.map(d => d.slice(0, 10))).size === 1 && sm.lastmods.length > 5 : false, offOrigin: sm.urls.filter(u => !u.startsWith(origin)).length };
if (!sm.urls.length) report.issues.push('sitemap missing or empty'); if (report.sitemap.sameDayLastmod) report.issues.push('all sitemap lastmod identical (fake lastmod)'); if (report.sitemap.offOrigin) report.issues.push(`${report.sitemap.offOrigin} sitemap URLs on another origin`);

const pages = [url, ...sm.urls.filter(u => u !== url && u.startsWith(origin) && !/\.(jpg|png|pdf|webp)$/i.test(u))].slice(0, maxPages);
const titles = {}; const descs = {};
const mojibake = /Ã[ -¿]|â€[™œ“”–—]|ï¿½|\uFFFD/;
for (const p of pages) {
  const r = await get(p); const h = r.text; const pg = { url: p, status: r.status, issues: [] };
  if (r.status !== 200) { pg.issues.push(`HTTP ${r.status}`); report.pages.push(pg); continue; }
  if (r.finalUrl && r.finalUrl.replace(/\/$/, '') !== p.replace(/\/$/, '')) pg.issues.push(`redirects to ${r.finalUrl}`);
  const title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim().replace(/\s+/g, ' ') || ''; const desc = (h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || h.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] || '';
  const canonical = (h.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || [])[1] || null; const charset = (h.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || null; const lang = (h.match(/<html[^>]+lang=["']([^"']+)/i) || [])[1] || null;
  const h1s = [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()); const h2s = [...h.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  const ld = [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]); const ldTypes = []; let ldErrors = 0; for (const s of ld) { try { const j = JSON.parse(s); const nodes = j['@graph'] || (Array.isArray(j) ? j : [j]); nodes.forEach(n => n && n['@type'] && ldTypes.push([].concat(n['@type']).join('/'))); } catch { ldErrors++; } }
  const ogImage = /<meta[^>]+property=["']og:image["']/i.test(h); const hreflang = (h.match(/hreflang=/g) || []).length; const noindex = /<meta[^>]+robots[^>]+noindex/i.test(h);
  const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
  Object.assign(pg, { title, titleLen: title.length, desc, descLen: desc.length, canonical, charset, lang, h1Count: h1s.length, h1: h1s[0] || null, h2Count: h2s.length, ldTypes, ldErrors, ogImage, hreflang, noindex, words: text.split(/\s+/).filter(Boolean).length });
  if (!title) pg.issues.push('missing title'); else if (title.length < 30 || title.length > 60) pg.issues.push(`title ${title.length} chars (target 50-60)`);
  if (!desc) pg.issues.push('missing meta description'); else if (desc.length < 110 || desc.length > 160) pg.issues.push(`description ${desc.length} chars (target 120-160)`);
  if (h1s.length !== 1) pg.issues.push(`${h1s.length} H1`); if (!canonical) pg.issues.push('no canonical'); if (!charset) pg.issues.push('no charset meta'); else if (!/utf-?8/i.test(charset)) pg.issues.push(`charset ${charset}`); if (!lang) pg.issues.push('no html lang');
  if (mojibake.test(text) || mojibake.test(title)) pg.issues.push('mojibake / broken characters detected'); if (/\s{2,}[A-Za-z]/.test(title + desc) && /  /.test(title + desc)) pg.issues.push('double spaces in title/description'); if (/[\u201C\u201D\u2019]/.test(title) && /["']/.test(title)) pg.issues.push('mixed straight and smart quotes in title');
  if (!ld.length) pg.issues.push('no JSON-LD'); if (ldErrors) pg.issues.push(`${ldErrors} invalid JSON-LD blocks`); if (ldTypes.filter(t => /Organization|LocalBusiness/.test(t)).length > 1) pg.issues.push('duplicate Organization/LocalBusiness schema'); if (ldTypes.some(t => /FAQPage/.test(t)) && !/faq|frequently asked/i.test(text)) pg.issues.push('FAQPage schema but no visible FAQ text');
  if (!ogImage) pg.issues.push('no og:image'); if (noindex) pg.issues.push('NOINDEX on a sitemap URL'); if (pg.words < 150) pg.issues.push(`thin content (${pg.words} words)`);
  if (title) (titles[title] = titles[title] || []).push(p); if (desc) (descs[desc] = descs[desc] || []).push(p);
  report.pages.push(pg);
}
for (const [t, us] of Object.entries(titles)) if (us.length > 1) report.issues.push(`duplicate title on ${us.length} pages: "${t.slice(0, 50)}"`);
for (const [d, us] of Object.entries(descs)) if (us.length > 1) report.issues.push(`duplicate description on ${us.length} pages`);

const seeds = seedKeywords.length ? seedKeywords : [...new Set(report.pages.map(p => p.h1).filter(Boolean))].slice(0, 5).map(h => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 4).join(' '));
const suggest = async q => { try { const safeQ = redactText(q); const r = await safeFetch(`https://suggestqueries.google.com/complete/search?client=firefox&gl=${gl}&hl=${hl}&q=${encodeURIComponent(safeQ)}`, { headers: { 'user-agent': UA } }); const j = await r.json(); return j[1] || []; } catch { return []; } };
const modifiers = ['price', 'package', 'rates', 'itinerary', 'how to get to', 'best time', 'near', 'tour', 'booking', 'review', 'vs', 'for families', 'day trip', 'overnight'];
const questions = ['how', 'what', 'where', 'when', 'is', 'can', 'why'];
for (const seed of seeds) {
  const set = new Set(); const base = await suggest(seed); base.forEach(s => set.add(s));
  for (const q of questions) (await suggest(`${q} ${seed}`)).forEach(s => set.add(s));
  for (const m of modifiers.slice(0, 8)) (await suggest(`${seed} ${m}`)).forEach(s => set.add(s));
  for (const c of 'abcdefghijklmnopqrstuvwxyz'.slice(0, 12)) (await suggest(`${seed} ${c}`)).forEach(s => set.add(s));
  const list = [...set].filter(s => s !== seed); const long = list.filter(s => s.split(' ').length >= 4); const qs = list.filter(s => /^(how|what|where|when|is|can|why|do|does)\b/.test(s));
  report.longTail[seed] = { total: list.length, longTail: long.slice(0, 40), questions: qs.slice(0, 25), all: list };
}
writeArtifact(join(out, 'seo.json'), report);
const md = [`# SEO hygiene: ${url}`, '', '## Site-level issues', ...(report.issues.length ? report.issues.map(i => '- ' + i) : ['- none']), '', `## Sitemap: ${report.sitemap.url}`, `- URLs: ${report.sitemap.count}, lastmod: ${report.sitemap.hasLastmod}, errors: ${report.sitemap.errors.join('; ') || 'none'}`, `- robots.txt: ${report.robots.status}, sitemap ref: ${report.robots.hasSitemap}, disallows: ${report.robots.disallows.join(' ') || 'none'}`, '', '## Pages', '| url | title (len) | desc len | H1 | schema | issues |', '|---|---|---|---|---|---|', ...report.pages.map(p => `| ${p.url.replace(origin, '')} | ${(p.title || '').slice(0, 45)} (${p.titleLen || 0}) | ${p.descLen || 0} | ${p.h1Count} | ${(p.ldTypes || []).join(', ') || '-'} | ${p.issues.join('; ') || 'ok'} |`), '', '## Long-tail keyword opportunities (Google Suggest, gl=' + gl + ')', ...Object.entries(report.longTail).flatMap(([seed, v]) => [``, `### ${seed} (${v.total} suggestions)`, `**Questions (FAQ/H2 candidates):**`, ...v.questions.map(q => '- ' + q), `**Long-tail (4+ words):**`, ...v.longTail.slice(0, 25).map(q => '- ' + q)])].join('\n');
writeArtifact(join(out, 'seo.md'), md);
console.log(JSON.stringify({ siteIssues: report.issues.length, pages: report.pages.length, pagesWithIssues: report.pages.filter(p => p.issues.length).length, sitemapUrls: report.sitemap.count, longTailSeeds: Object.keys(report.longTail) }, null, 2));
console.log(`\nWrote ${out}/seo.md`);

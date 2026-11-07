#!/usr/bin/env node
// Usage: PSI_API_KEY=... node psi.mjs <url> [--strategy mobile|desktop|both]
// Pulls PageSpeed Insights (Lighthouse lab) and CrUX field data (URL + origin), writes JSON + a bottleneck summary.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2];
if (!url) { console.error('Usage: node psi.mjs <url> [--strategy mobile|desktop|both]'); process.exit(1); }
const i = process.argv.indexOf('--strategy'); const strategyArg = i > -1 ? process.argv[i + 1] : 'both';
const strategies = strategyArg === 'both' ? ['mobile', 'desktop'] : [strategyArg];
const key = process.env.PSI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) console.warn('No PSI_API_KEY set: unauthenticated quota is very low.');
const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const out = join('design', 'reports', 'scan', site, new Date().toISOString().slice(0, 10), 'psi'); mkdirSync(out, { recursive: true });
const slug = new URL(url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';

const OPP = ['render-blocking-resources', 'unused-javascript', 'unused-css-rules', 'uses-responsive-images', 'modern-image-formats', 'offscreen-images', 'server-response-time', 'uses-text-compression', 'uses-long-cache-ttl', 'third-party-summary', 'largest-contentful-paint-element', 'lcp-lazy-loaded', 'prioritize-lcp-image', 'font-display', 'layout-shift-elements', 'long-tasks', 'mainthread-work-breakdown', 'bootup-time', 'dom-size', 'total-byte-weight'];

for (const strategy of strategies) {
  const q = new URLSearchParams({ url, strategy, category: 'performance' }); q.append('category', 'accessibility'); q.append('category', 'seo'); q.append('category', 'best-practices'); if (key) q.set('key', key);
  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`);
  if (!res.ok) { console.error(strategy, 'PSI error', res.status, await res.text()); continue; }
  const j = await res.json();
  writeFileSync(join(out, `${slug}-${strategy}.json`), JSON.stringify(j, null, 2));
  const lr = j.lighthouseResult; const a = lr.audits;
  const lab = { performance: Math.round(lr.categories.performance.score * 100), accessibility: Math.round(lr.categories.accessibility.score * 100), seo: Math.round(lr.categories.seo.score * 100), bestPractices: Math.round(lr.categories['best-practices'].score * 100), fcp: a['first-contentful-paint'].displayValue, lcp: a['largest-contentful-paint'].displayValue, tbt: a['total-blocking-time'].displayValue, cls: a['cumulative-layout-shift'].displayValue, speedIndex: a['speed-index'].displayValue };
  const fieldOf = le => le && le.metrics ? Object.fromEntries(Object.entries(le.metrics).map(([k, v]) => [k, { p75: v.percentile, category: v.category }])) : null;
  const field = { url: fieldOf(j.loadingExperience), origin: fieldOf(j.originLoadingExperience) };
  const opportunities = OPP.map(id => a[id]).filter(x => x && x.score !== null && x.score < 0.9).map(x => ({ id: x.id, title: x.title, savingsMs: x.details?.overallSavingsMs || null, savingsBytes: x.details?.overallSavingsBytes || null, display: x.displayValue || null })).sort((p, q2) => (q2.savingsMs || 0) - (p.savingsMs || 0));
  const lcpEl = a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet || a['largest-contentful-paint-element']?.details?.items?.[0]?.node?.snippet || null;
  const bottleneck = opportunities[0] ? `${opportunities[0].title} (${opportunities[0].savingsMs ? Math.round(opportunities[0].savingsMs) + ' ms' : opportunities[0].display || ''})` : 'none above threshold';
  const summary = { url, strategy, lab, field, lcpElement: lcpEl, biggestBottleneck: bottleneck, topFixes: opportunities.slice(0, 8) };
  writeFileSync(join(out, `${slug}-${strategy}-summary.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
console.log(`\nWrote ${out}`);

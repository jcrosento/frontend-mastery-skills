#!/usr/bin/env node
// Usage: node compare.mjs <baselineFolder> <currentFolder>   |   node compare.mjs --selftest
// Before/after between two scan folders: metric deltas, flags resolved/new, element census deltas, SEO issue deltas, crawler deltas.
// Writes compare.md + compare.json in the current folder. Exit 3 on REGRESSED so CI can block.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

export function compareFolders(base, cur, { write = true } = {}) {
  const J = (dir, f) => { const p = join(dir, f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
  const b = { scan: J(base, 'scan.json'), el: J(base, 'elements.json'), tr: J(join(base, 'trace'), 'trace.json'), seo: J(join(base, 'seo'), 'seo.json'), cr: J(base, 'crawlers.json') };
  const c = { scan: J(cur, 'scan.json'), el: J(cur, 'elements.json'), tr: J(join(cur, 'trace'), 'trace.json'), seo: J(join(cur, 'seo'), 'seo.json'), cr: J(cur, 'crawlers.json') };
  const rows = []; const verdicts = []; const covered = { trace: !!(b.tr && c.tr), scan: !!(b.scan && c.scan), elements: !!(b.el && c.el), seo: !!(b.seo && c.seo), crawlers: !!(b.cr && c.cr) };
  const delta = (name, bv, cv, lowerIsBetter = true, unit = '') => { if (bv == null || cv == null) { rows.push([name, bv ?? '-', cv ?? '-', 'n/a', '']); return; } const d = cv - bv; const better = lowerIsBetter ? d < 0 : d > 0; const pct = bv ? Math.round((d / Math.abs(bv)) * 100) : (d ? 100 : 0); const tag = d === 0 ? 'same' : better ? 'BETTER' : 'WORSE'; if (tag !== 'same' && Math.abs(pct) >= 10) verdicts.push(`${tag}: ${name} ${bv}${unit} -> ${cv}${unit} (${pct > 0 ? '+' : ''}${pct}%)`); rows.push([name, `${bv}${unit}`, `${cv}${unit}`, `${d > 0 ? '+' : ''}${Number.isInteger(d) ? d : d.toFixed(3)}${unit}`, tag]); };
  if (covered.trace) { const s1 = b.tr.summary, s2 = c.tr.summary; delta('CLS (throttled mobile)', s1.cls, s2.cls); delta('LCP ms', s1.lcp?.time, s2.lcp?.time, true, 'ms'); delta('TBT ms', s1.tbt, s2.tbt, true, 'ms'); delta('TTFB ms', s1.nav?.ttfb, s2.nav?.ttfb, true, 'ms'); delta('FCP ms', s1.paint?.['first-contentful-paint'], s2.paint?.['first-contentful-paint'], true, 'ms'); delta('JS KB', s1.byType?.Script?.kb, s2.byType?.Script?.kb, true, 'KB'); delta('Image KB', s1.byType?.Image?.kb, s2.byType?.Image?.kb, true, 'KB'); delta('DOM nodes', s1.domNodes, s2.domNodes); }
  if (covered.scan) { const s1 = b.scan.summary, s2 = c.scan.summary; delta('Flagged sections', s1.flaggedSections, s2.flaggedSections); delta('Padding on 4px scale', s1.paddingOnScaleRatio, s2.paddingOnScaleRatio, false); delta('Overflow pages', s1.overflowPages?.length, s2.overflowPages?.length); delta('Runtime errors', s1.runtimeErrors, s2.runtimeErrors); delta('Monkey errors', s1.monkeyErrors, s2.monkeyErrors); delta('Flow failures', s1.flowFailures?.length, s2.flowFailures?.length); delta('Dead ends after click', s1.deadEndsAfterClick?.length, s2.deadEndsAfterClick?.length); delta('Avg load ms', s1.avgLoadMs, s2.avgLoadMs, true, 'ms'); }
  const flagKey = s => `${s.page}|${s.device}|${s.tag}${s.id ? '#' + s.id : ''}|${Object.entries(s.flags || {}).filter(([, v]) => v).map(([k]) => k).sort().join('+')}`;
  let resolved = [], added = [];
  if (covered.scan) { const keys = scan => new Set(Object.values(scan.perf || {}).flatMap(r => (r.sections || []).map(s => flagKey({ ...s, page: r.slug, device: r.device }))).filter(k => !k.endsWith('|'))); const fb = keys(b.scan), fc = keys(c.scan); resolved = [...fb].filter(k => !fc.has(k)); added = [...fc].filter(k => !fb.has(k)); }
  const elRows = [];
  for (const dev of ['mobile', 'desktop']) { if (b.el?.[dev] && c.el?.[dev]) { const x = b.el[dev].census, y = c.el[dev].census; for (const [n, f] of [['font families', v => v.families.length], ['weight combos', v => v.weights.length], ['font sizes', v => v.sizes.length], ['radii', v => v.radii.length], ['text colors', v => v.textColors.length], ['taps < 44px', v => v.taps.under44], ['tap pairs < 8px', v => v.taps.pairsCloserThan8px]]) { const bv = f(x), cv = f(y); elRows.push([`${dev}: ${n}`, bv, cv, cv - bv, cv < bv ? 'BETTER' : cv > bv ? 'WORSE' : 'same']); if (Math.abs(cv - bv) >= 2) verdicts.push(`${cv < bv ? 'BETTER' : 'WORSE'}: ${dev} ${n} ${bv} -> ${cv}`); } } }
  let seoResolved = [], seoAdded = [];
  if (covered.seo) { const all = s => new Set([...(s.issues || []), ...(s.pages || []).flatMap(p => (p.issues || []).map(i => `${p.url}: ${i}`))]); const bi = all(b.seo), ci = all(c.seo); seoResolved = [...bi].filter(i => !ci.has(i)); seoAdded = [...ci].filter(i => !bi.has(i)); }
  let crawlerDelta = null; if (covered.crawlers) crawlerDelta = { before: (b.cr.issues || []).length, after: (c.cr.issues || []).length };
  const score = verdicts.filter(v => v.startsWith('BETTER')).length - verdicts.filter(v => v.startsWith('WORSE')).length + (resolved.length - added.length) / 20 + (seoResolved.length - seoAdded.length) / 5 + (crawlerDelta ? (crawlerDelta.before - crawlerDelta.after) / 2 : 0);
  const verdict = score > 1 ? 'IMPROVED' : score < -1 ? 'REGRESSED' : 'NEUTRAL / WITHIN NOISE';
  const result = { base: basename(base), cur: basename(cur), verdict, score: +score.toFixed(2), verdicts, covered, flagsResolved: resolved.length, flagsNew: added.length, seoResolved: seoResolved.length, seoNew: seoAdded.length, crawlerDelta };
  if (write) {
    const md = [`# Compare: ${basename(base)} -> ${basename(cur)}`, '', `## Verdict: ${verdict}`, ...(verdicts.length ? verdicts.map(v => '- ' + v) : ['- no metric moved more than 10%']), '', `Coverage: ${Object.entries(covered).map(([k, v]) => `${k}=${v ? 'yes' : 'missing'}`).join(', ')}`, '', '## Metrics', '| metric | baseline | current | delta | |', '|---|---|---|---|---|', ...rows.map(r => `| ${r.join(' | ')} |`), '', '## Element census', '| metric | baseline | current | delta | |', '|---|---|---|---|---|', ...elRows.map(r => `| ${r.join(' | ')} |`), '', `## Section flags: ${resolved.length} resolved, ${added.length} new`, ...resolved.slice(0, 25).map(k => '- resolved: ' + k), ...added.slice(0, 25).map(k => '- NEW: ' + k), '', `## SEO issues: ${seoResolved.length} resolved, ${seoAdded.length} new`, ...seoResolved.slice(0, 25).map(i => '- resolved: ' + i), ...seoAdded.slice(0, 25).map(i => '- NEW: ' + i), '', crawlerDelta ? `## Crawler access issues: ${crawlerDelta.before} -> ${crawlerDelta.after}` : '', '', 'Noise note: single-run lab metrics (CLS, LCP, TBT) can vary 10-30% between runs. Treat < 10% deltas as noise; use --runs 3 for medians and the two-try rule (fe-regress) before claiming a regression.'].join('\n');
    writeFileSync(join(cur, 'compare.md'), md); writeFileSync(join(cur, 'compare.json'), JSON.stringify(result, null, 2));
  }
  return result;
}

function synthetic(dir, v) {
  mkdirSync(join(dir, 'trace'), { recursive: true }); mkdirSync(join(dir, 'seo'), { recursive: true });
  writeFileSync(join(dir, 'trace', 'trace.json'), JSON.stringify({ summary: { cls: v.cls, lcp: { time: v.lcp }, tbt: v.tbt, nav: { ttfb: 300 }, paint: { 'first-contentful-paint': 700 }, byType: { Script: { kb: v.js }, Image: { kb: 200 } }, domNodes: 1500 } }));
  writeFileSync(join(dir, 'scan.json'), JSON.stringify({ summary: { flaggedSections: v.flags.length, paddingOnScaleRatio: v.pad, overflowPages: [], runtimeErrors: 0, monkeyErrors: 0, flowFailures: [], deadEndsAfterClick: [], avgLoadMs: 2000 }, perf: { 'home|pixel-7': { slug: 'home', device: 'pixel-7', sections: v.flags.map(f => ({ tag: 'section', id: `s-${f}`, flags: { [f]: true } })) } } }));
  writeFileSync(join(dir, 'elements.json'), JSON.stringify({ mobile: { census: { families: Array(v.fam).fill(['x', 1]), weights: Array(8).fill(['x', 1]), sizes: Array(v.sizes).fill(['x', 1]), radii: Array(5).fill(['x', 1]), textColors: Array(10).fill(['x', 1]), taps: { under44: v.taps, pairsCloserThan8px: 3 } } } }));
  writeFileSync(join(dir, 'seo', 'seo.json'), JSON.stringify({ issues: v.seo, pages: [] }));
  writeFileSync(join(dir, 'crawlers.json'), JSON.stringify({ issues: v.crawl }));
}

if (process.argv.includes('--selftest')) {
  const root = join(tmpdir(), `fe-compare-selftest-${Date.now()}`); const A = join(root, '2026-01-01'), B = join(root, '2026-01-02'), C = join(root, '2026-01-03'), D = join(root, '2026-01-04');
  synthetic(A, { cls: 0.6, lcp: 3000, tbt: 300, js: 400, flags: ['smallTap', 'smallText', 'upscaledImage'], pad: 0.8, fam: 4, sizes: 20, taps: 30, seo: ['a', 'b', 'c'], crawl: ['GPTBot blocked'] });
  synthetic(B, { cls: 0.05, lcp: 1800, tbt: 50, js: 150, flags: ['smallText'], pad: 0.95, fam: 2, sizes: 9, taps: 2, seo: [], crawl: [] });
  synthetic(C, { cls: 1.2, lcp: 4500, tbt: 600, js: 800, flags: ['smallTap', 'smallText', 'upscaledImage', 'tallOnMobile'], pad: 0.6, fam: 6, sizes: 30, taps: 60, seo: ['a', 'b', 'c', 'd', 'e'], crawl: ['GPTBot blocked', 'Googlebot blocked'] });
  synthetic(D, { cls: 0.62, lcp: 3050, tbt: 310, js: 405, flags: ['smallTap', 'smallText', 'upscaledImage'], pad: 0.8, fam: 4, sizes: 20, taps: 30, seo: ['a', 'b', 'c'], crawl: ['GPTBot blocked'] });
  const r1 = compareFolders(A, B), r2 = compareFolders(A, C), r3 = compareFolders(A, D);
  const checks = [['improved detected', r1.verdict === 'IMPROVED'], ['regressed detected', r2.verdict === 'REGRESSED'], ['noise stays neutral', r3.verdict === 'NEUTRAL / WITHIN NOISE'], ['flags resolved counted', r1.flagsResolved === 2 && r1.flagsNew === 0], ['new flags counted', r2.flagsNew === 1], ['seo deltas counted', r1.seoResolved === 3 && r2.seoNew === 2], ['compare.md written', existsSync(join(B, 'compare.md'))], ['missing inputs tolerated', (() => { const E = join(root, 'empty'); mkdirSync(E, { recursive: true }); const r = compareFolders(A, E, { write: false }); return r.verdict === 'NEUTRAL / WITHIN NOISE' && Object.values(r.covered).every(v => v === false); })()]];
  rmSync(root, { recursive: true, force: true });
  const failed = checks.filter(([, ok]) => !ok); checks.forEach(([n, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}`)); console.log(`\n${checks.length - failed.length}/${checks.length} selftest checks passed`); process.exit(failed.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` && !process.argv.includes('--selftest')) {
  const [base, cur] = process.argv.slice(2);
  if (!base || !cur) { console.error('Usage: node compare.mjs <baselineFolder> <currentFolder> | --selftest'); process.exit(1); }
  const r = compareFolders(base, cur); console.log(JSON.stringify(r, null, 2)); console.log(`\nWrote ${cur}/compare.md`); if (r.verdict === 'REGRESSED') process.exit(3);
}

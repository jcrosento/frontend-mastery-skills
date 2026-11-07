#!/usr/bin/env node
// Usage: node lighthouse-gate.mjs <url> [--desktop]
// Requires: npx lighthouse available (npm i -D lighthouse)
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const [url, flag] = process.argv.slice(2);
if (!url) { console.error('Usage: node lighthouse-gate.mjs <url> [--desktop]'); process.exit(1); }
const preset = flag === '--desktop' ? '--preset=desktop' : '--form-factor=mobile --screenEmulation.mobile';
mkdirSync('design/reports/perf', { recursive: true });
const out = `design/reports/perf/${Date.now()}.json`;
execSync(`npx lighthouse ${url} ${preset} --output=json --output-path=${out} --chrome-flags="--headless" --quiet`, { stdio: 'inherit' });
const r = JSON.parse(readFileSync(out, 'utf8'));
const a = r.audits;
const metrics = {
  performance: Math.round(r.categories.performance.score * 100),
  lcp: a['largest-contentful-paint'].numericValue,
  cls: a['cumulative-layout-shift'].numericValue,
  tbt: a['total-blocking-time'].numericValue,
  ttfb: a['server-response-time'].numericValue,
};
const fails = [];
if (metrics.performance < 90) fails.push(`performance ${metrics.performance} < 90`);
if (metrics.lcp > 2500) fails.push(`LCP ${Math.round(metrics.lcp)}ms > 2500`);
if (metrics.cls > 0.1) fails.push(`CLS ${metrics.cls.toFixed(3)} > 0.1`);
if (metrics.tbt > 200) fails.push(`TBT ${Math.round(metrics.tbt)}ms > 200 (INP proxy)`);
console.log(JSON.stringify(metrics, null, 2));
if (fails.length) { console.error('GATE FAILED:\n- ' + fails.join('\n- ')); process.exit(2); }
console.log('GATE PASSED');

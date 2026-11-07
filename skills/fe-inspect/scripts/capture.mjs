#!/usr/bin/env node
// Usage: node capture.mjs <url> <slug>
// Requires: npm i -D playwright && npx playwright install chromium
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [url, slug = 'reference'] = process.argv.slice(2);
if (!url) { console.error('Usage: node capture.mjs <url> <slug>'); process.exit(1); }

const breakpoints = [320, 390, 768, 1024, 1280, 1920];
const out = `design/inspection/${slug}`;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const report = { url, capturedAt: new Date().toISOString(), breakpoints: {} };

for (const width of breakpoints) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const requests = [];
  page.on('response', r => requests.push({ url: r.url(), type: r.request().resourceType(), size: Number(r.headers()['content-length'] || 0) }));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: `${out}/${width}-fold.png` });
  await page.screenshot({ path: `${out}/${width}-full.png`, fullPage: true });

  const styles = await page.evaluate(() => {
    const pick = sel => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return { fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: s.color }; };
    const fonts = [...new Set([...document.querySelectorAll('*')].slice(0, 3000).map(e => getComputedStyle(e).fontFamily))];
    const overflow = document.documentElement.scrollWidth > window.innerWidth;
    return { h1: pick('h1'), h2: pick('h2'), body: pick('body'), button: pick('button, a[class*=btn], .button'), fonts, horizontalOverflow: overflow, pageHeight: document.documentElement.scrollHeight };
  });

  report.breakpoints[width] = { styles, requestCount: requests.length, totalBytes: requests.reduce((a, r) => a + r.size, 0) };
  await ctx.close();
}

await browser.close();
writeFileSync(`${out}/capture.json`, JSON.stringify(report, null, 2));
console.log(`Saved screenshots and capture.json to ${out}`);

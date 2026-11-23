#!/usr/bin/env node
// Usage: node ux-audit.mjs <url> [--device mobile|desktop] [--allow-loopback-fixture]
//        node ux-audit.mjs --selftest
// The machine half of a UX audit on one screen. Read-only: it never clicks, types or submits.
// Pass --allow-loopback-fixture to audit a dev server on your own machine.
// Exit 0 PASS, 1 FAIL (a severity 3 or 4 finding), 2 could not run or UNVERIFIED.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fromAxe, fromCensus, fromRuntime, fromText, summarize, formatReport } from './ux-audit-core.mjs';

const CENSUS = () => {
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0; };
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('name') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const controls = [...document.querySelectorAll('a[href], button, [role=button], input:not([type=hidden]), select, textarea, summary')].filter(visible);
  // A link inside a sentence is exempt from the target-size rule, as in WCAG 2.5.8.
  const inline = el => el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.innerText.trim().length > el.innerText.trim().length + 20;
  const targets = controls.filter(el => !inline(el)).map(el => { const r = el.getBoundingClientRect(); return { label: label(el), w: Math.round(r.width), h: Math.round(r.height) }; });
  const smallText = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode; const el = node.parentElement; const text = node.nodeValue.trim();
    if (!el || text.length < 2 || seen.has(el) || !visible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 12) { seen.add(el); smallText.push({ text: text.slice(0, 30), px: Math.round(px * 10) / 10 }); }
  }
  const zoomInputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')].filter(visible)
    .filter(el => parseFloat(getComputedStyle(el).fontSize) < 16).map(label);
  const doc = document.documentElement; const overflowPx = Math.max(0, doc.scrollWidth - doc.clientWidth);
  const widest = overflowPx > 1 ? [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > doc.clientWidth + 1).slice(0, 3).map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList[0] ? '.' + el.classList[0] : ''}`) : [];
  const dead = controls.filter(el => {
    if (el.tagName === 'A') { const href = el.getAttribute('href').trim(); return href === '' || href === '#' || /^javascript:/i.test(href); }
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return !(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim() && !el.querySelector('img[alt]:not([alt=""]), svg title');
    return false;
  }).map(label);
  const unsizedImages = [...document.querySelectorAll('img')].filter(visible).filter(img => !(img.getAttribute('width') && img.getAttribute('height')) && !getComputedStyle(img).aspectRatio.includes('/')).length;
  return { targets, smallText, zoomInputs, overflowPx, widest, dead, h1: document.querySelectorAll('h1').length, unsizedImages, text: document.body.innerText };
};

function axeSource() {
  try { return readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8'); } catch { return null; }
}

export async function auditPage(page, { mobile = true } = {}) {
  const consoleErrors = []; const failedRequests = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 160)); });
  page.on('pageerror', error => consoleErrors.push(String(error.message || error).slice(0, 160)));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return {
    async run() {
      const census = await page.evaluate(CENSUS);
      const source = axeSource();
      let axe = 'skipped'; let violations = [];
      if (source) {
        await page.evaluate(source);
        violations = (await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }))).violations;
        axe = 'ran';
      }
      const findings = [...violations.map(fromAxe), ...fromCensus(census, { mobile }), ...fromText(census.text), ...fromRuntime({ consoleErrors, failedRequests })];
      return { axe, summary: summarize(findings, { axe }) };
    },
  };
}

function selftest() {
  const census = { targets: [{ label: 'Save', w: 20, h: 20 }, { label: 'Next', w: 40, h: 40 }], smallText: [{ text: 'fine print', px: 10 }], zoomInputs: ['Amount'], overflowPx: 30, widest: ['table.rows'], dead: ['More'], h1: 0, unsizedImages: 1 };
  const found = [...fromCensus(census), ...fromText('Total ₱₱1,200 for undefined'), ...fromRuntime({ consoleErrors: ['x is not a function'] }), fromAxe({ id: 'color-contrast', impact: 'serious', help: 'Text needs contrast', nodes: [{ target: ['.muted'] }], tags: ['wcag143'] })];
  const ids = found.map(item => item.check);
  const clean = summarize(fromCensus({ targets: [{ label: 'Save', w: 48, h: 48 }], smallText: [], zoomInputs: [], overflowPx: 0, widest: [], dead: [], h1: 1, unsizedImages: 0 }));
  const checks = [
    ['small targets, small text, zooming fields, sideways scroll and dead controls are found', ['tap:under-24', 'tap:under-44', 'text:under-12', 'input:zooms', 'layout:sideways-scroll', 'control:dead'].every(id => ids.includes(id))],
    ['a doubled currency sign and "undefined" are found', ids.includes('leak:a doubled currency sign') && ids.includes('leak:the word "undefined"')],
    ['a serious accessibility rule is severity 3', found.find(item => item.check === 'axe:color-contrast').severity === 3],
    ['a severity 3 finding fails the screen', summarize(found).verdict === 'FAIL'],
    ['a clean screen passes, and is UNVERIFIED when the accessibility rules did not run', clean.verdict === 'PASS' && summarize([], { axe: 'skipped' }).verdict === 'UNVERIFIED'],
  ];
  checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} selftest checks passed`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const url = process.argv[2];
  if (!url || url.startsWith('--')) { console.error('Usage: node ux-audit.mjs <url> [--device mobile|desktop] [--allow-loopback-fixture]'); process.exit(2); }
  const device = process.argv.includes('--device') ? process.argv[process.argv.indexOf('--device') + 1] : 'mobile';
  const allowLoopbackFixture = process.argv.includes('--allow-loopback-fixture');
  const { assertRequestAllowed, installRequestGuard } = await import('../../fe-scan/scripts/network-policy.mjs');
  const { writeArtifact, redactText } = await import('../../fe-scan/scripts/artifacts.mjs');
  try { await assertRequestAllowed(url, 'GET', { allowLoopbackFixture }); } catch {
    console.error('Target refused by the read-only network policy. For a dev server on this machine, add --allow-loopback-fixture.');
    process.exit(2);
  }
  const { chromium, devices } = await import('playwright');
  const profile = device === 'desktop' ? { viewport: { width: 1440, height: 900 } } : { ...devices['iPhone 14'] };
  const browser = await chromium.launch();
  let status = 2;
  try {
    const context = await browser.newContext(profile);
    await installRequestGuard(context, { allowLoopbackFixture });
    const page = await context.newPage();
    const audit = await auditPage(page, { mobile: device !== 'desktop' });
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    const { axe, summary } = await audit.run();
    const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    const out = join('design', 'reports', 'ux-audit', host, process.env.FE_SCAN_STAMP || new Date().toISOString().slice(0, 10));
    mkdirSync(out, { recursive: true });
    const target = redactText(new URL(url).origin + new URL(url).pathname);
    const text = formatReport(target, device, summary, axe);
    writeArtifact(join(out, `findings-${device}.json`), { target, device, axe, ...summary });
    writeArtifact(join(out, `report-${device}.txt`), text);
    console.log(redactText(text));
    status = summary.verdict === 'PASS' ? 0 : summary.verdict === 'FAIL' ? 1 : 2;
  } catch (error) {
    console.error(`UX audit could not run: ${String(error.message || error).split('\n')[0]}`);
  } finally { await browser.close(); }
  process.exit(status);
}

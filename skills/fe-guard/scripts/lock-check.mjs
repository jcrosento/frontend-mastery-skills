#!/usr/bin/env node
// Check rendered HTML against a landmarks lock.
//
//   node lock-check.mjs --lock design/landmarks.lock.json --state <id> --html <rendered.html>
//   node lock-check.mjs --census --html <rendered.html> [--attribute data-testid]
//
// The HTML file is whatever the app's own test or build rendered for that screen state.
// It is loaded in an offline Chromium page: scripts are disabled and every network
// request is aborted, so nothing in the file can call a backend.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { censusFromDocument, checkLock, INTERACTIVE_SELECTOR, validateLock } from './lock-core.mjs';

export { INTERACTIVE_SELECTOR };

export async function censusFromHtml(html, { attribute = 'data-testid' } = {}) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    // The same function an app's own test calls, sent to the page as text so both paths count alike.
    return await page.evaluate(`(${censusFromDocument.toString()})(document, ${JSON.stringify({ attribute, selector: INTERACTIVE_SELECTOR })})`);
  } finally {
    await browser.close();
  }
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const htmlPath = arg('--html');
  if (!htmlPath) { console.error('usage: lock-check.mjs --lock <lock.json> --state <id> --html <rendered.html> | --census --html <rendered.html>'); return 2; }
  const html = readFileSync(htmlPath, 'utf8');
  if (argv.includes('--census')) {
    console.log(JSON.stringify(await censusFromHtml(html, { attribute: arg('--attribute') || 'data-testid' }), null, 2));
    return 0;
  }
  const lockPath = arg('--lock'), state = arg('--state');
  if (!lockPath || !state) { console.error('--lock and --state are required'); return 2; }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const problems = validateLock(lock);
  if (problems.length) { console.error(`lock is invalid:\n${problems.map(p => `  - ${p}`).join('\n')}`); return 2; }
  const census = await censusFromHtml(html, { attribute: lock.attribute || 'data-testid' });
  const result = checkLock(lock, state, census);
  if (result.ok) {
    console.log(`PASS: state "${state}" keeps every locked landmark (${census.landmarks.length} tagged elements, ${census.interactive} interactive).`);
    return 0;
  }
  console.error(`FAIL: state "${state}" breaks the lock (${result.failures.length}):`);
  for (const f of result.failures) console.error(`  - [${f.kind}] ${f.landmark ?? ''} ${f.detail}`.replace(/\s+/g, ' '));
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code), error => { console.error(error.message); process.exit(2); });
}

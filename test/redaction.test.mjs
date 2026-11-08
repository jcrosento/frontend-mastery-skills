import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { redactData, redactText, writeArtifact, redactPageForScreenshot, restorePageAfterScreenshot } from '../skills/fe-scan/scripts/artifacts.mjs';

const EMAIL = 'owner@example.test';
const TOKEN = 'sk_test_FAKE1234567890';
const privateValue = `${EMAIL} ${TOKEN} https://example.test/?access_token=abcdefghijk12345`;
const assertClean = text => {
  assert.equal(text.includes(EMAIL), false, 'email must be absent');
  assert.equal(text.includes(TOKEN), false, 'token must be absent');
  assert.equal(text.includes('access_token=abcdefghijk12345'), false, 'URL token must be absent');
};

test('text and structured artifact redaction covers every generated text artifact type', () => {
  const out = mkdtempSync(join(tmpdir(), 'fe-redaction-'));
  const artifacts = [
    ['scan.json', { url: privateValue, page: { email: EMAIL, heading: privateValue } }],
    ['sections.json', [{ headingText: privateValue }]],
    ['elements.json', { desktop: { buttons: [{ text: privateValue }] } }],
    ['trace.json', { requests: [{ url: privateValue, headers: { authorization: `Bearer ${TOKEN}` } }] }],
    ['seo.json', { pages: [{ url: privateValue, title: privateValue }] }],
    ['crawlers.json', { target: privateValue }],
    ['manifest.json', { url: privateValue, steps: [{ stderr: privateValue }] }],
    ['compare.json', { verdicts: [privateValue] }],
    ['report.md', `# Report\n${privateValue}`],
    ['elements.md', `| text |\n| ${privateValue} |`],
    ['bottleneck.md', `## URL\n${privateValue}`],
    ['crawlers.md', `## Target\n${privateValue}`],
    ['seo.md', `## Search\n${privateValue}`],
    ['compare.md', `## Changes\n${privateValue}`],
    ['heatmap.svg', `<svg><text>${privateValue}</text></svg>`],
    ['run.log', privateValue]
  ];
  try {
    for (const [name, payload] of artifacts) {
      const path = join(out, name); writeArtifact(path, payload);
      assertClean(readFileSync(path, 'utf8'));
    }
    assertClean(JSON.stringify(redactData({ EMAIL, text: privateValue })));
    assertClean(redactText(privateValue));
    assert.throws(() => writeArtifact(join(out, 'unsafe.png'), Buffer.from([1, 2, 3])), /unsanitized binary/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('screenshot redaction masks visible and form values, then restores page state', { timeout: 20_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>${EMAIL} ${TOKEN}</h1><p title="${privateValue}">Visible ${privateValue}</p><input value="${EMAIL}"><input type="password" value="secret-fake-password-123"></main>`);
    const changes = await redactPageForScreenshot(page);
    assert.ok(changes >= 4);
    const screenshot = await page.screenshot();
    assert.ok(screenshot.length > 100);
    const text = await page.locator('body').innerText();
    assert.equal(text.includes(EMAIL), false);
    assert.equal(text.includes(TOKEN), false);
    assert.equal(await page.locator('input').first().inputValue(), '[REDACTED_EMAIL]');
    assert.equal(await page.locator('input[type=password]').inputValue(), '[REDACTED]');
    await restorePageAfterScreenshot(page);
    assert.equal(await page.locator('h1').innerText(), `${EMAIL} ${TOKEN}`);
  } finally { await browser.close(); }
});

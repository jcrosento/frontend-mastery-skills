#!/usr/bin/env node
// Usage: node elements.mjs <url> [--device mobile|desktop|both]
// Designer census: fonts, weights, sizes, line-heights, colors, radii, shadows, buttons + their hover/focus/active deltas, tap padding, vh usage, cursor, transitions.
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2];
if (!url) { console.error('Usage: node elements.mjs <url> [--device mobile|desktop|both]'); process.exit(1); }
const di = process.argv.indexOf('--device'); const which = di > -1 ? process.argv[di + 1] : 'both';
const profiles = { mobile: { ...devices['iPhone 14'] }, desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } };
const run = which === 'both' ? ['mobile', 'desktop'] : [which];
const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const out = join('design', 'reports', 'scan', site, new Date().toISOString().slice(0, 10)); mkdirSync(out, { recursive: true });

const CENSUS = () => {
  const count = (m, k) => { if (k == null || k === '' || k === 'none' || k === 'rgba(0, 0, 0, 0)') return; m[k] = (m[k] || 0) + 1; };
  const fam = {}, weights = {}, sizes = {}, lh = {}, colors = {}, bgs = {}, radii = {}, shadows = {}, cursors = {}, transitions = {};
  const all = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 6000);
  for (const e of all) {
    const s = getComputedStyle(e); const hasText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasText) { const f = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); count(fam, f); count(weights, `${f} ${s.fontWeight}`); count(sizes, s.fontSize); count(lh, `${s.fontSize}/${s.lineHeight}`); count(colors, s.color); }
    count(bgs, s.backgroundColor); if (s.borderRadius !== '0px') count(radii, s.borderRadius); count(shadows, s.boxShadow);
  }
  const vhUsers = all.filter(e => { const h = e.style?.height || ''; const mh = e.style?.minHeight || ''; return /vh/.test(h + mh); }).length;
  const sheets = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch { return []; } });
  const vhRules = sheets.filter(r => r.cssText && /\b100vh\b/.test(r.cssText)).length; const dvhRules = sheets.filter(r => r.cssText && /\b100(d|s)vh\b/.test(r.cssText)).length;
  const synthBold = all.filter(e => { const s = getComputedStyle(e); return +s.fontWeight >= 600 && !document.fonts.check(`${s.fontWeight} 16px ${s.fontFamily}`); }).length;
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => { const s = getComputedStyle(h); return { tag: h.tagName, text: h.textContent.trim().slice(0, 60), size: s.fontSize, weight: s.fontWeight, family: s.fontFamily.split(',')[0] }; });
  const btnSel = 'a[class*=btn],a[class*=button],button,[role=button],input[type=submit]';
  const btns = [...document.querySelectorAll(btnSel)].filter(b => b.getBoundingClientRect().width > 0).slice(0, 40).map((b, i) => { b.setAttribute('data-fe-idx', i); const r = b.getBoundingClientRect(); const s = getComputedStyle(b); return { idx: i, text: (b.textContent || b.value || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), padding: s.padding, radius: s.borderRadius, bg: s.backgroundColor, color: s.color, weight: s.fontWeight, size: s.fontSize, cursor: s.cursor, transition: s.transitionDuration, outlineNone: s.outlineStyle === 'none', top: Math.round(r.top + scrollY), foldPct: Math.round(((r.top + scrollY) / document.documentElement.scrollHeight) * 100) }; });
  const taps = [...document.querySelectorAll('a,button,input,select,textarea,[role=button]')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
  let tooClose = 0; for (let i = 0; i < Math.min(taps.length, 300); i++) for (let j = i + 1; j < Math.min(taps.length, 300); j++) { const a = taps[i], b = taps[j]; const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)); const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)); if (dx < 8 && dy < 8) tooClose++; }
  const smallTaps = taps.filter(r => r.width < 44 || r.height < 44).length;
  const inputs = [...document.querySelectorAll('input,select,textarea')].map(i => ({ type: i.type, fontSize: getComputedStyle(i).fontSize, hasLabel: !!(i.labels?.length || i.getAttribute('aria-label') || i.placeholder), autocomplete: i.getAttribute('autocomplete') }));
  const top = m => Object.entries(m).sort((a, b) => b[1] - a[1]);
  return { families: top(fam), weights: top(weights), sizes: top(sizes), lineHeights: top(lh).slice(0, 25), textColors: top(colors), backgrounds: top(bgs).slice(0, 25), radii: top(radii), shadows: top(shadows).slice(0, 10), headings, buttons: btns, taps: { total: taps.length, under44: smallTaps, pairsCloserThan8px: tooClose }, inputs, viewportUnits: { inlineVh: vhUsers, css100vhRules: vhRules, cssDvhSvhRules: dvhRules }, syntheticBoldCandidates: synthBold, iosZoomRiskInputs: inputs.filter(i => parseFloat(i.fontSize) < 16).length };
};

const browser = await chromium.launch();
const result = { url };
for (const key of run) {
  const ctx = await browser.newContext(profiles[key]); const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  const census = await page.evaluate(CENSUS);
  const states = [];
  for (const b of census.buttons.slice(0, 15)) {
    const loc = page.locator(`[data-fe-idx="${b.idx}"]`).first();
    const grab = () => loc.evaluate(e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color, border: s.borderColor, shadow: s.boxShadow, transform: s.transform, outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor, textDecoration: s.textDecorationLine }; });
    try {
      await loc.scrollIntoViewIfNeeded(); const base = await grab();
      await loc.hover({ timeout: 2000 }); await page.waitForTimeout(350); const hover = await grab();
      await loc.focus(); await page.waitForTimeout(100); const focus = await grab();
      await page.mouse.move(0, 0);
      const diff = (a, c) => Object.keys(a).filter(k => a[k] !== c[k]);
      states.push({ text: b.text, hoverChanges: diff(base, hover), focusVisible: diff(base, focus).length > 0 && !b.outlineNone || diff(base, focus).includes('outline') || diff(base, focus).includes('shadow'), base, hover, focus });
    } catch (e) { states.push({ text: b.text, error: e.message.slice(0, 60) }); }
  }
  const findings = [];
  if (census.families.length > 3) findings.push(`${census.families.length} font families in use (target <= 3)`);
  if (census.weights.length > 6) findings.push(`${census.weights.length} family/weight combos (target <= 6)`);
  if (census.sizes.length > 12) findings.push(`${census.sizes.length} distinct font sizes (target <= 12 for a scale)`);
  if (census.radii.length > 4) findings.push(`${census.radii.length} distinct border radii (target <= 3)`);
  if (census.textColors.length > 12) findings.push(`${census.textColors.length} distinct text colors`);
  if (census.taps.under44) findings.push(`${census.taps.under44} tap targets under 44px`);
  if (census.taps.pairsCloserThan8px) findings.push(`${census.taps.pairsCloserThan8px} tap-target pairs closer than 8px`);
  if (census.viewportUnits.css100vhRules && !census.viewportUnits.cssDvhSvhRules) findings.push(`100vh used without svh/dvh fallback (${census.viewportUnits.css100vhRules} rules)`);
  if (census.iosZoomRiskInputs) findings.push(`${census.iosZoomRiskInputs} inputs under 16px (iOS zoom on focus)`);
  const noHover = states.filter(s => s.hoverChanges && s.hoverChanges.length === 0).length; if (noHover) findings.push(`${noHover}/${states.length} buttons have no hover change`);
  const noFocus = states.filter(s => s.focusVisible === false).length; if (noFocus) findings.push(`${noFocus}/${states.length} buttons have no visible focus state`);
  const noPointer = census.buttons.filter(b => b.cursor !== 'pointer').length; if (noPointer) findings.push(`${noPointer} buttons without cursor:pointer`);
  const h1s = census.headings.filter(h => h.tag === 'H1').length; if (h1s !== 1) findings.push(`${h1s} H1 elements (target exactly 1)`);
  result[key] = { census, buttonStates: states, findings };
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, 'elements.json'), JSON.stringify(result, null, 2));
const md = ['# Element census: ' + url, ...run.flatMap(k => { const r = result[k]; const c = r.census; return [``, `## ${k}`, `### Findings`, ...(r.findings.length ? r.findings.map(f => '- ' + f) : ['- none flagged']), `### Families / weights`, ...c.weights.slice(0, 12).map(([w, n]) => `- ${w} (${n})`), `### Font sizes`, c.sizes.map(([s, n]) => `${s}(${n})`).join(', '), `### Radii`, c.radii.map(([s, n]) => `${s}(${n})`).join(', ') || '-', `### Text colors`, c.textColors.slice(0, 12).map(([s, n]) => `${s}(${n})`).join(', '), `### Headings`, ...c.headings.slice(0, 20).map(h => `- ${h.tag} ${h.size}/${h.weight} ${h.family}: ${h.text}`), `### Buttons`, '| text | size | padding | radius | fold% | hover changes | focus visible |', '|---|---|---|---|---|---|---|', ...c.buttons.slice(0, 15).map((b, i) => { const s = r.buttonStates[i] || {}; return `| ${b.text} | ${b.w}x${b.h} | ${b.padding} | ${b.radius} | ${b.foldPct}% | ${(s.hoverChanges || []).join(',') || (s.error ? 'err' : 'none')} | ${s.focusVisible === undefined ? '-' : s.focusVisible ? 'yes' : 'NO'} |`; })]; })].join('\n');
writeFileSync(join(out, 'elements.md'), md);
console.log(JSON.stringify(Object.fromEntries(run.map(k => [k, result[k].findings])), null, 2));
console.log(`\nWrote ${out}/elements.md`);

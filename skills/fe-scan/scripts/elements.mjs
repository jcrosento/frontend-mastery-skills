#!/usr/bin/env node
// Usage: node elements.mjs <url> [--device mobile|desktop|both]
// Designer census + banner-aware state probes. Consent banners are never dismissed unless --dismiss-consent is explicitly supplied.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertRequestAllowed, installRequestGuard } from './network-policy.mjs';
import { writeArtifact } from './artifacts.mjs';

const url = process.argv[2];
if (!url) { console.error('Usage: node elements.mjs <url> [--device mobile|desktop|both]'); process.exit(1); }
const di = process.argv.indexOf('--device'); const which = di > -1 ? process.argv[di + 1] : 'both';
const profiles = { mobile: { ...devices['iPhone 14'] }, desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } };
const allowLoopbackFixture = process.argv.includes('--allow-loopback-fixture');
const dismissConsent = process.argv.includes('--dismiss-consent');
const blockedRequests = [];
await assertRequestAllowed(url, 'GET', { allowLoopbackFixture });
const run = which === 'both' ? ['mobile', 'desktop'] : [which];
const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const stamp = process.env.FE_SCAN_STAMP || new Date().toISOString().slice(0, 10);
const out = join('design', 'reports', 'scan', site, stamp); mkdirSync(out, { recursive: true });

const BANNER_SEL = '[class*=cookie],[id*=cookie],[class*=consent],[id*=consent],[class*=gdpr],[id*=gdpr],[aria-label*=cookie i],[class*=cc-window],#onetrust-banner-sdk,.cky-consent-container';
const PREFER_RE = 'essential|reject|decline|necessary|no thanks|dismiss';
const FALLBACK_RE = '^(accept( all)?|agree|got it|ok|close)$';

const CENSUS = () => {
  const count = (m, k) => { if (k == null || k === '' || k === 'none' || k === 'rgba(0, 0, 0, 0)') return; m[k] = (m[k] || 0) + 1; };
  const fam = {}, weights = {}, sizes = {}, lh = {}, colors = {}, bgs = {}, radii = {}, shadows = {};
  const all = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 6000);
  for (const e of all) {
    const s = getComputedStyle(e); const hasText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasText) { const f = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); count(fam, f); count(weights, `${f} ${s.fontWeight}`); count(sizes, s.fontSize); count(lh, `${s.fontSize}/${s.lineHeight}`); count(colors, s.color); }
    count(bgs, s.backgroundColor); if (s.borderRadius !== '0px') count(radii, s.borderRadius); count(shadows, s.boxShadow);
  }
  const sheets = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch { return []; } });
  const vhRules = sheets.filter(r => r.cssText && /\b100vh\b/.test(r.cssText)).length; const dvhRules = sheets.filter(r => r.cssText && /\b100(d|s)vh\b/.test(r.cssText)).length;
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => { const s = getComputedStyle(h); return { tag: h.tagName, text: h.textContent.trim().slice(0, 60), size: s.fontSize, weight: s.fontWeight, family: s.fontFamily.split(',')[0] }; });
  const btnSel = 'a[class*=btn],a[class*=button],button,[role=button],input[type=submit]';
  const label = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
  const btns = [...document.querySelectorAll(btnSel)].filter(b => b.getBoundingClientRect().width > 0).slice(0, 40).map((b, i) => { b.setAttribute('data-fe-idx', i); const r = b.getBoundingClientRect(); const s = getComputedStyle(b); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const inView = cy >= 0 && cy <= innerHeight && cx >= 0 && cx <= innerWidth; const topEl = inView ? document.elementFromPoint(cx, cy) : null; const covered = !!(topEl && !b.contains(topEl) && !topEl.contains(b)); return { idx: i, text: (b.textContent || b.value || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), padding: s.padding, radius: s.borderRadius, bg: s.backgroundColor, color: s.color, weight: s.fontWeight, size: s.fontSize, cursor: s.cursor, transition: s.transitionDuration, outlineNone: s.outlineStyle === 'none', top: Math.round(r.top + scrollY), foldPct: Math.round(((r.top + scrollY) / document.documentElement.scrollHeight) * 100), coveredBy: covered ? label(topEl) : null }; });
  const taps = [...document.querySelectorAll('a,button,input,select,textarea,[role=button]')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
  let tooClose = 0; for (let i = 0; i < Math.min(taps.length, 300); i++) for (let j = i + 1; j < Math.min(taps.length, 300); j++) { const a = taps[i], b = taps[j]; const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)); const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)); if (dx < 8 && dy < 8) tooClose++; }
  const inputs = [...document.querySelectorAll('input,select,textarea')].map(i => ({ type: i.type, fontSize: getComputedStyle(i).fontSize, hasLabel: !!(i.labels?.length || i.getAttribute('aria-label') || i.placeholder), autocomplete: i.getAttribute('autocomplete') }));
  const top = m => Object.entries(m).sort((a, b) => b[1] - a[1]);
  return { families: top(fam), weights: top(weights), sizes: top(sizes), lineHeights: top(lh).slice(0, 25), textColors: top(colors), backgrounds: top(bgs).slice(0, 25), radii: top(radii), shadows: top(shadows).slice(0, 10), headings, buttons: btns, taps: { total: taps.length, under44: taps.filter(r => r.width < 44 || r.height < 44).length, pairsCloserThan8px: tooClose }, inputs, viewportUnits: { css100vhRules: vhRules, cssDvhSvhRules: dvhRules }, iosZoomRiskInputs: inputs.filter(i => parseFloat(i.fontSize) < 16).length };
};

async function dismissBanner(page) {
  const info = await page.evaluate(({ sel, prefer, fallback }) => {
    const label = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
    const banners = [...document.querySelectorAll(sel)].filter(b => { const r = b.getBoundingClientRect(); const s = getComputedStyle(b); return r.width > 100 && r.height > 40 && s.visibility !== 'hidden' && s.display !== 'none'; });
    if (!banners.length) return { found: false };
    const b = banners[0]; const r = b.getBoundingClientRect(); const ctrls = [...b.querySelectorAll('button,a,[role=button]')];
    const pick = ctrls.find(x => new RegExp(prefer, 'i').test(x.textContent)) || ctrls.find(x => new RegExp(fallback, 'i').test(x.textContent.trim()));
    if (pick) pick.setAttribute('data-fe-dismiss', '1');
    return { found: true, selector: label(b), position: r.top < innerHeight / 2 ? 'top' : 'bottom', heightPx: Math.round(r.height), coversFoldPct: Math.round((r.height / innerHeight) * 100), buttons: ctrls.map(x => x.textContent.trim()).slice(0, 8), chosen: pick ? pick.textContent.trim() : null };
  }, { sel: BANNER_SEL, prefer: PREFER_RE, fallback: FALLBACK_RE });
  if (info.found && !dismissConsent) info.dismissed = 'not-requested';
  if (info.found && dismissConsent && info.chosen) { try { await page.locator('[data-fe-dismiss="1"]').first().click({ timeout: 2000 }); await page.waitForTimeout(100); info.dismissed = 'clicked'; } catch { info.dismissed = false; } }
  if (info.found && dismissConsent && !info.dismissed) { await page.evaluate(sel => document.querySelectorAll(sel).forEach(b => (b.style.display = 'none')), BANNER_SEL); info.dismissed = 'hidden'; }
  return info;
}

async function probe(page, buttons) {
  const states = [];
  // Force :active through Chromium's inspection protocol; a real mouse down/up can
  // activate a consent button or other user action while the scan is read-only.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  for (const b of buttons.slice(0, 15)) {
    const loc = page.locator(`[data-fe-idx="${b.idx}"]`).first();
    const grab = () => loc.evaluate(e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color, border: s.borderColor, shadow: s.boxShadow, transform: s.transform, outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor, textDecoration: s.textDecorationLine }; });
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 1500 }); const base = await grab();
      await loc.hover({ timeout: 1500 }); await page.waitForTimeout(300); const hover = await grab();
      const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-fe-idx="${b.idx}"]` });
      if (!nodeId) throw new Error('active-state target disappeared from DOM');
      let active;
      try {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        active = await grab();
      } finally {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      }
      await loc.focus(); await page.waitForTimeout(100); const focus = await grab();
      await page.mouse.move(0, 0);
      const diff = (a, c) => Object.keys(a).filter(k => a[k] !== c[k]);
      const fd = diff(base, focus);
      states.push({ text: b.text, hoverChanges: diff(base, hover), activeChanges: diff(base, active), focusVisible: fd.includes('outline') || fd.includes('shadow') || (fd.length > 0 && !b.outlineNone) });
    } catch (e) {
      const message = String(e.message || e);
      const blocked = /intercepts pointer events|not visible|outside of the viewport/i.test(message);
      const errorKind = /timeout/i.test(message) ? 'timeout' : 'probe-error';
      states.push({ text: b.text, status: blocked ? 'blocked' : 'unknown', blocked, errorKind, error: message.split('\n')[0].slice(0, 120) });
    }
  }
  return states;
}

const browser = await chromium.launch();
const result = { url, stamp, coverage: { devices: run, buttonsProbedPerDevice: 15, activeState: 'Chromium forced :active pseudo-state (no pointer/click activation)', bannerHandling: 'probe as-is; post-consent probe only with --dismiss-consent' } };
for (const key of run) {
  const ctx = await browser.newContext({ ...profiles[key], serviceWorkers: 'block' }); const page = await ctx.newPage();
  await installRequestGuard(ctx, { allowLoopbackFixture, blocked: blockedRequests });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}' });
  await Promise.race([page.evaluate(() => document.fonts.ready), new Promise(resolve => setTimeout(resolve, 3000))]);
  const census = await page.evaluate(CENSUS);
  const coveredBefore = census.buttons.filter(b => b.coveredBy);
  const probeBlocked = await probe(page, census.buttons);
  const banner = await dismissBanner(page);
  const c = banner.found && dismissConsent ? await page.evaluate(CENSUS) : census;
  const states = banner.found && dismissConsent ? await probe(page, c.buttons) : probeBlocked;
  const findings = [];
  if (banner.found) findings.push(`Cookie/consent banner (${banner.selector}, ${banner.position}, ${banner.heightPx}px = ${banner.coversFoldPct}% of viewport) covers ${coveredBefore.length} interactive element(s) at the fold${coveredBefore.length ? ': ' + coveredBefore.map(b => b.text || '#' + b.idx).slice(0, 4).join(', ') : ''}; consent handling: ${banner.dismissed === 'not-requested' ? 'left untouched (use --dismiss-consent only for authorized tests)' : banner.dismissed === 'hidden' ? 'CSS hidden after explicit opt-in' : `explicit opt-in: "${banner.chosen}"`}`);
  const blocked = probeBlocked.filter(s => s.status === 'blocked').length; if (blocked) findings.push(`${blocked} button(s) could not be hovered before dismissing the banner (overlay intercepts pointer)`);
  const unknown = states.filter(s => s.status === 'unknown').length; if (unknown) findings.push(`${unknown}/${states.length} button interaction probe(s) unknown; inspect timeout/error details before treating as pass`);
  if (c.families.length > 3) findings.push(`${c.families.length} font families in use (target <= 3): ${c.families.slice(0, 4).map(f => f[0]).join(', ')}`);
  if (c.weights.length > 6) findings.push(`${c.weights.length} family/weight combos (target <= 6)`);
  if (c.sizes.length > 12) findings.push(`${c.sizes.length} distinct font sizes (target <= 12 for a scale)`);
  const tiny = c.sizes.filter(([s]) => parseFloat(s) < 12).reduce((a, [, n]) => a + n, 0); if (tiny) findings.push(`${tiny} text elements under 12px`);
  if (c.radii.length > 4) findings.push(`${c.radii.length} distinct border radii (target <= 3)`);
  if (c.textColors.length > 12) findings.push(`${c.textColors.length} distinct text colors`);
  if (c.taps.under44) findings.push(`${c.taps.under44} tap targets under 44px`);
  if (c.taps.pairsCloserThan8px) findings.push(`${c.taps.pairsCloserThan8px} tap-target pairs closer than 8px`);
  if (c.viewportUnits.css100vhRules && !c.viewportUnits.cssDvhSvhRules) findings.push(`100vh used without svh/dvh fallback (${c.viewportUnits.css100vhRules} rules)`);
  if (c.iosZoomRiskInputs) findings.push(`${c.iosZoomRiskInputs} inputs under 16px (iOS zoom on focus)`);
  const noHover = states.filter(s => s.hoverChanges && s.hoverChanges.length === 0).length; if (noHover) findings.push(`${noHover}/${states.length} buttons have no hover change`);
  const noActive = states.filter(s => s.activeChanges && s.activeChanges.length === 0).length; if (noActive) findings.push(`${noActive}/${states.length} buttons have no pressed (active) state`);
  const noFocus = states.filter(s => s.focusVisible === false).length; if (noFocus) findings.push(`${noFocus}/${states.length} buttons have no visible focus state`);
  const noPointer = c.buttons.filter(b => b.cursor !== 'pointer').length; if (noPointer) findings.push(`${noPointer} buttons without cursor:pointer`);
  const h1s = c.headings.filter(h => h.tag === 'H1').length; if (h1s !== 1) findings.push(`${h1s} H1 elements (target exactly 1)`);
  const dupH = c.headings.filter((h, i, a) => a.findIndex(x => x.text === h.text) !== i).length; if (dupH) findings.push(`${dupH} duplicated heading text(s) (duplicate hero/DOM variants?)`);
  result[key] = { banner, census: c, buttonStatesBlocked: probeBlocked, buttonStates: states, findings, network: { blockedRequests: blockedRequests.filter(r => r.url.startsWith(new URL(url).origin) || /non-public|method|local hostname/.test(r.reason)).map(r => ({ method: r.method, reason: r.reason })) } };
  await ctx.close();
}
await browser.close();
writeArtifact(join(out, 'elements.json'), result);
const md = ['# Element census: ' + url, '', `Coverage: devices ${run.join(', ')}; first 15 buttons probed per device; banner handling: ${result.coverage.bannerHandling}.`,  ...run.flatMap(k => { const r = result[k]; const c = r.census; return [``, `## ${k}`, `### Banner`, r.banner.found ? `- ${r.banner.selector} at ${r.banner.position}, ${r.banner.heightPx}px (${r.banner.coversFoldPct}% of viewport); controls: ${r.banner.buttons.join(' | ')}; dismissed: ${r.banner.dismissed}` : '- none detected', `### Findings`, ...(r.findings.length ? r.findings.map(f => '- ' + f) : ['- none flagged']), `### Families / weights`, ...c.weights.slice(0, 12).map(([w, n]) => `- ${w} (${n})`), `### Font sizes`, c.sizes.map(([s, n]) => `${s}(${n})`).join(', '), `### Radii`, c.radii.map(([s, n]) => `${s}(${n})`).join(', ') || '-', `### Text colors`, c.textColors.slice(0, 12).map(([s, n]) => `${s}(${n})`).join(', '), `### Headings`, ...c.headings.slice(0, 20).map(h => `- ${h.tag} ${h.size}/${h.weight} ${h.family}: ${h.text}`), `### Buttons (post-consent only when explicitly opted in)`,  '| text | size | padding | radius | fold% | covered before | hover | active | focus |', '|---|---|---|---|---|---|---|---|---|', ...c.buttons.slice(0, 15).map((b, i) => { const s = r.buttonStates[i] || {}; const before = r.buttonStatesBlocked[i]; return `| ${b.text} | ${b.w}x${b.h} | ${b.padding} | ${b.radius} | ${b.foldPct}% | ${before && before.blocked ? 'BLOCKED' : b.coveredBy || '-'} | ${(s.hoverChanges || []).join(',') || (s.error ? 'err' : 'none')} | ${(s.activeChanges || []).join(',') || (s.error ? 'err' : 'none')} | ${s.focusVisible === undefined ? '-' : s.focusVisible ? 'yes' : 'NO'} |`; })]; })].join('\n');
writeArtifact(join(out, 'elements.md'), md);
console.log(JSON.stringify(Object.fromEntries(run.map(k => [k, result[k].findings])), null, 2));
console.log(`\nWrote ${out}/elements.md`);

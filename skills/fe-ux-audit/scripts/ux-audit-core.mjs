// Rules for the machine half of a UX audit. Pure: no browser, no files, no network.
// Severity is Nielsen's 0-4 scale: 1 cosmetic, 2 minor, 3 major, 4 blocks the task.

export const HEURISTICS = {
  H1: 'Visibility of system status',
  H2: 'Match between the system and the real world',
  H3: 'User control and freedom',
  H4: 'Consistency and standards',
  H5: 'Error prevention',
  H6: 'Recognition rather than recall',
  H7: 'Flexibility and efficiency of use',
  H8: 'Aesthetic and minimalist design',
  H9: 'Help users recognize, diagnose and recover from errors',
  H10: 'Help and documentation',
};

export const SEVERITY = ['not a problem', 'cosmetic', 'minor', 'major', 'blocks the task'];
export const FAIL_AT = 3;

const AXE_SEVERITY = { critical: 4, serious: 3, moderate: 2, minor: 1 };
// Which heuristic an accessibility rule most often breaks. Anything unlisted is H4.
const AXE_HEURISTIC = [
  [/^(label|select-name|input-button-name|aria-input-field-name|form-field-multiple-labels|autocomplete-valid)$/, 'H5'],
  [/^(button-name|link-name|image-alt|input-image-alt|role-img-alt|svg-img-alt|area-alt|frame-title|document-title)$/, 'H6'],
  [/^(color-contrast|color-contrast-enhanced|link-in-text-block|meta-viewport|target-size)$/, 'H8'],
  [/^(bypass|scrollable-region-focusable|tabindex|focus-order-semantics|nested-interactive)$/, 'H3'],
  [/^(aria-live|status-messages|aria-progressbar-name)$/, 'H1'],
];

const LEAKS = [
  ['lorem ipsum', /lorem ipsum/i, 3],
  ['the word "undefined"', /(^|[\s:>(])undefined($|[\s.,)<])/, 3],
  ['"NaN"', /(^|[\s:>(₱$€£¥])NaN($|[\s.,)<%])/, 3],
  ['"[object Object]"', /\[object Object\]/, 3],
  ['an unfilled template tag', /\{\{[^}]{1,60}\}\}|\$\{[^}]{1,60}\}/, 3],
  ['a doubled currency sign', /([₱$€£¥])\s?\1/, 2],
  ['"TODO" or "TBD"', /\b(TODO|TBD|FIXME)\b/, 2],
  ['the word "null"', /(^|[\s:>(])null($|[\s.,)<])/, 2],
];

function finding(check, severity, heuristic, what, fix, extra = {}) {
  return { check, severity, heuristic, what, fix, ...extra };
}

export function fromAxe(violation) {
  const severity = AXE_SEVERITY[violation.impact] ?? 2;
  const heuristic = (AXE_HEURISTIC.find(([pattern]) => pattern.test(violation.id)) || [null, 'H4'])[1];
  const nodes = Array.isArray(violation.nodes) ? violation.nodes : [];
  const wcag = (violation.tags || []).filter(tag => /^wcag\d{3,4}$/.test(tag));
  return finding(`axe:${violation.id}`, severity, heuristic, violation.help || violation.id, violation.helpUrl || 'See the rule page.', {
    count: nodes.length,
    where: nodes.slice(0, 3).map(node => String(node.target?.[0] ?? '')).filter(Boolean),
    ...(wcag.length ? { wcag } : {}),
  });
}

export function fromText(text) {
  const out = [];
  for (const [name, pattern, severity] of LEAKS) {
    const hit = String(text).match(pattern);
    if (!hit) continue;
    const at = Math.max(0, hit.index - 30);
    out.push(finding(`leak:${name}`, severity, 'H2', `The screen shows ${name}.`, 'Show the real value, or hide the row until there is one.', {
      where: [String(text).slice(at, hit.index + hit[0].length + 30).replace(/\s+/g, ' ').trim()],
    }));
  }
  return out;
}

// census is what the page reported about itself. See CENSUS in ux-audit.mjs.
export function fromCensus(census, { mobile = true } = {}) {
  const out = [];
  const tiny = census.targets.filter(target => Math.min(target.w, target.h) < 24);
  const small = census.targets.filter(target => Math.min(target.w, target.h) >= 24 && Math.min(target.w, target.h) < 44);
  if (tiny.length) out.push(finding('tap:under-24', 3, 'H7', `${tiny.length} control(s) are smaller than 24px, the WCAG 2.2 minimum.`, 'Give the control at least 24px, and 44px on a phone.', { count: tiny.length, where: tiny.slice(0, 3).map(t => `${t.label} ${t.w}x${t.h}`), wcag: ['wcag258'] }));
  if (mobile && small.length) out.push(finding('tap:under-44', 2, 'H7', `${small.length} control(s) are smaller than 44px on a phone.`, 'Pad the control to 44px in both directions.', { count: small.length, where: small.slice(0, 3).map(t => `${t.label} ${t.w}x${t.h}`) }));
  if (census.smallText.length) out.push(finding('text:under-12', 2, 'H8', `${census.smallText.length} piece(s) of text are smaller than 12px.`, 'Use the smallest size in the type scale, never below 12px.', { count: census.smallText.length, where: census.smallText.slice(0, 3).map(t => `${t.text} ${t.px}px`) }));
  if (mobile && census.zoomInputs.length) out.push(finding('input:zooms', 2, 'H5', `${census.zoomInputs.length} field(s) use text under 16px, so an iPhone zooms the page on tap.`, 'Set the field text to 16px or more.', { count: census.zoomInputs.length, where: census.zoomInputs.slice(0, 3) }));
  if (census.overflowPx > 1) out.push(finding('layout:sideways-scroll', 3, 'H8', `The page is ${census.overflowPx}px wider than the screen.`, 'Find the element that is too wide and let it wrap or shrink.', { where: census.widest.slice(0, 3) }));
  if (census.dead.length) out.push(finding('control:dead', 3, 'H3', `${census.dead.length} control(s) go nowhere or have no name.`, 'Give it a destination and a label, or remove it.', { count: census.dead.length, where: census.dead.slice(0, 3) }));
  if (census.h1 !== 1) out.push(finding('heading:h1', 1, 'H4', `The page has ${census.h1} top headings. It should have one.`, 'Keep one h1 that names the screen.'));
  if (census.unsizedImages) out.push(finding('image:no-size', 1, 'H1', `${census.unsizedImages} image(s) have no width and height, so the page jumps while it loads.`, 'Set width and height on every image.', { count: census.unsizedImages }));
  return out;
}

export function fromRuntime({ consoleErrors = [], failedRequests = [] } = {}) {
  const out = [];
  if (consoleErrors.length) out.push(finding('runtime:console-error', 2, 'H9', `${consoleErrors.length} error(s) in the browser console.`, 'Fix the error, or handle it and tell the person what happened.', { count: consoleErrors.length, where: consoleErrors.slice(0, 3) }));
  if (failedRequests.length) out.push(finding('runtime:failed-request', 3, 'H1', `${failedRequests.length} request(s) failed while the screen loaded.`, 'Fix the request, or show an error state with one next action.', { count: failedRequests.length, where: failedRequests.slice(0, 3) }));
  return out;
}

export function summarize(findings, { axe = 'ran' } = {}) {
  const sorted = [...findings].sort((a, b) => b.severity - a.severity || a.check.localeCompare(b.check));
  const bySeverity = [0, 0, 0, 0, 0];
  for (const item of sorted) bySeverity[item.severity] += 1;
  const blocking = sorted.filter(item => item.severity >= FAIL_AT).length;
  // An audit that could not run its accessibility rules is not a pass.
  const verdict = blocking ? 'FAIL' : axe === 'ran' ? 'PASS' : 'UNVERIFIED';
  return { verdict, blocking, bySeverity, findings: sorted };
}

export function formatReport(target, device, summary, axe) {
  const lines = [`UX AUDIT  ${target}  ${device}`];
  if (axe !== 'ran') lines.push('SKIPPED accessibility rules: axe-core is not installed beside the skills. Accessibility is unverified.');
  for (const item of summary.findings) {
    lines.push(`S${item.severity} ${item.heuristic} ${item.check}  ${item.what}`);
    if (item.where?.length) lines.push(`     at ${item.where.join(' | ')}`);
    lines.push(`     fix ${item.fix}`);
  }
  if (!summary.findings.length) lines.push('No machine finding.');
  lines.push(`VERDICT ${summary.verdict}  ${summary.blocking} at severity 3 or 4`);
  lines.push('A machine finds about half of what an auditor finds. The by-hand list in SKILL.md is still owed.');
  return lines.join('\n');
}

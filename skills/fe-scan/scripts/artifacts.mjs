import { appendFileSync, writeFileSync } from 'node:fs';

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TOKEN_PATTERNS = [
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{6,}["']?/gi
];
const SENSITIVE_KEY = /^(?:e-?mail|authorization|cookie|password|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token)$/i;

export function redactText(input) {
  let text = String(input);
  text = text.replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[REDACTED]@');
  text = text.replace(/([?&](?:token|access_token|refresh_token|api_key|key|secret|password|email|authorization)=)[^&#\s]*/gi, '$1[REDACTED]');
  text = text.replace(EMAIL, '[REDACTED_EMAIL]');
  for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, '[REDACTED_SECRET]');
  return text;
}

export function redactData(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(item => redactData(item));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactData(childValue, childKey)]));
  }
  return value;
}

export function writeArtifact(path, value, { append = false } = {}) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    throw new TypeError('Refusing an unsanitized binary artifact; sanitize its rendered content first.');
  }
  const safe = typeof value === 'string' ? redactText(value) : JSON.stringify(redactData(value), null, 2);
  if (append) appendFileSync(path, safe);
  else writeFileSync(path, safe);
}

export async function redactPageForScreenshot(page) {
  return page.evaluate(() => {
    const redact = value => String(value)
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
      .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, '[REDACTED_SECRET]')
      .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED_SECRET]')
      .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_SECRET]')
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_SECRET]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, '[REDACTED_SECRET]');
    const restore = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode; const safe = redact(node.nodeValue);
      if (safe !== node.nodeValue) { restore.push(() => { node.nodeValue = node.__feOriginal; delete node.__feOriginal; }); node.__feOriginal = node.nodeValue; node.nodeValue = safe; }
    }
    for (const el of document.querySelectorAll('body *')) {
      for (const attr of [...el.attributes]) {
        const safe = redact(attr.value);
        if (safe !== attr.value) { const name = attr.name, original = attr.value; restore.push(() => el.setAttribute(name, original)); el.setAttribute(name, safe); }
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const safe = redact(el.value);
        if (safe !== el.value || (el instanceof HTMLInputElement && el.type === 'password' && el.value)) {
          const original = el.value; restore.push(() => { el.value = original; }); el.value = safe === original ? '[REDACTED]' : safe;
        }
      }
    }
    window.__feArtifactRestore = restore;
    return restore.length;
  });
}

export async function restorePageAfterScreenshot(page) {
  await page.evaluate(() => { for (const restore of window.__feArtifactRestore || []) restore(); delete window.__feArtifactRestore; });
}

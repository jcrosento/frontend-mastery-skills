#!/usr/bin/env node
// Usage: node wp-export-audit.mjs <path-to-extracted-export-folder>
// Works on an extracted Elementor Website Kit or Bricks Global Export. Writes inventory.json next to the folder.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('Usage: node wp-export-audit.mjs <folder>'); process.exit(1); }

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : extname(p) === '.json' && files.push(p); } })(root);

const inv = { source: root, type: 'unknown', globals: { colors: [], fonts: [], classes: [], variables: [] }, hardcoded: { colors: {}, fontFamilies: {}, fontSizesPx: {} }, globalRefs: 0, literalStyleProps: 0, icons: {}, widgets: {}, templates: [], files: files.length };

const hexRe = /#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

function scan(node, path = '') {
  if (Array.isArray(node)) return node.forEach((n, i) => scan(n, `${path}[${i}]`));
  if (!node || typeof node !== 'object') return;
  if (node.__globals__) inv.globalRefs += Object.keys(node.__globals__).length;
  if (node.widgetType || node.elType) bump(inv.widgets, node.widgetType || node.elType);
  if (node.name && typeof node.name === 'string' && node.settings && !node.widgetType) bump(inv.widgets, `bricks:${node.name}`);
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      if (/color|background/i.test(k) && hexRe.test(v)) { v.match(hexRe).forEach(h => bump(inv.hardcoded.colors, h.toLowerCase())); inv.literalStyleProps++; }
      if (/font_family|fontFamily|font-family/i.test(k)) { bump(inv.hardcoded.fontFamilies, v); inv.literalStyleProps++; }
      if (/icon|library/i.test(k) && /^(fa|fas|far|fab|eicon|ti-|ion-|themify)/.test(v)) bump(inv.icons, v.split(' ')[0]);
    } else if (typeof v === 'object' && v !== null) {
      if (/font_size|fontSize/i.test(k) && v.unit === 'px' && v.size) bump(inv.hardcoded.fontSizesPx, String(v.size));
      scan(v, `${path}.${k}`);
    }
  }
}

for (const f of files) {
  let j; try { j = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  const name = f.toLowerCase();
  if (name.includes('manifest')) { inv.type = j.bricks || name.includes('bricks') ? 'bricks' : (j.content || j.templates ? 'elementor' : inv.type); inv.manifest = j; continue; }
  if (j.system_colors || j.custom_colors) { inv.type = 'elementor'; inv.globals.colors.push(...(j.system_colors || []), ...(j.custom_colors || [])); }
  if (j.system_typography || j.custom_typography) inv.globals.fonts.push(...(j.system_typography || []), ...(j.custom_typography || []));
  if (j.settings?.system_colors) inv.globals.colors.push(...j.settings.system_colors, ...(j.settings.custom_colors || []));
  if (j.settings?.system_typography) inv.globals.fonts.push(...j.settings.system_typography, ...(j.settings.custom_typography || []));
  if (name.includes('color') && Array.isArray(j)) inv.globals.colors.push(...j);
  if (name.includes('class') && Array.isArray(j)) inv.globals.classes.push(...j.map(c => c.name || c.id));
  if (name.includes('variable') && Array.isArray(j)) inv.globals.variables.push(...j.map(c => c.name || c.id));
  if (name.includes('template')) inv.templates.push(f.replace(root, ''));
  scan(j);
}

inv.summary = {
  globalColorCount: inv.globals.colors.length,
  globalFontCount: inv.globals.fonts.length,
  distinctHardcodedColors: Object.keys(inv.hardcoded.colors).length,
  distinctHardcodedFontFamilies: Object.keys(inv.hardcoded.fontFamilies).length,
  distinctPxFontSizes: Object.keys(inv.hardcoded.fontSizesPx).length,
  globalBindingRatio: inv.globalRefs / Math.max(1, inv.globalRefs + inv.literalStyleProps),
  iconLibraries: Object.keys(inv.icons),
  topWidgets: Object.entries(inv.widgets).sort((a, b) => b[1] - a[1]).slice(0, 15)
};
writeFileSync(join(root, 'inventory.json'), JSON.stringify(inv, null, 2));
console.log(JSON.stringify(inv.summary, null, 2));

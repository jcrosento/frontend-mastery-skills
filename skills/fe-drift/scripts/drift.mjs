#!/usr/bin/env node
// Usage: node drift.mjs --family <family.json> --products <dir>
//        node drift.mjs --selftest
// Exit 0 when shared craft matches and distinct brands do not share a brand color.
// Exit 1 when the family drifted. Exit 2 when the files cannot be checked.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateFamily, formatReport } from './drift-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function readJson(path) {
  try {
    return { ok: true, data: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function loadProductDir(dir) {
  let names;
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.json') && !name.startsWith('_')).sort();
  } catch (error) {
    return { ok: false, error: error.message, products: [] };
  }
  const products = [];
  for (const name of names) {
    const loaded = readJson(join(dir, name));
    if (!loaded.ok) return { ok: false, error: `${name}: ${loaded.error}`, products: [] };
    products.push(loaded.data);
  }
  return { ok: true, products };
}

export function checkFiles(familyPath, productsDir) {
  const family = readJson(familyPath);
  if (!family.ok) return { status: 2, text: `Cannot read family file: ${family.error}` };
  const loaded = loadProductDir(productsDir);
  if (!loaded.ok) return { status: 2, text: `Cannot read products: ${loaded.error}` };
  const result = evaluateFamily(family.data, loaded.products);
  const text = formatReport(family.data, loaded.products, result);
  if (result.ok) return { status: 0, text };
  if (result.failures.every(item => item.code === 'empty')) return { status: 2, text };
  return { status: 1, text };
}

function selftest() {
  const familyPath = join(here, '../templates/family.example.json');
  const productsDir = join(here, '../templates/products');
  const passed = checkFiles(familyPath, productsDir);
  const family = readJson(familyPath).data;
  const products = loadProductDir(productsDir).products.map(product => structuredClone(product));
  products[0].craft.tap_min_px = 40;
  const drifted = evaluateFamily(family, products);
  products[0].craft.tap_min_px = family.craft.tap_min_px;
  products[1].brand.palette = [...products[0].brand.palette];
  const sameBrand = evaluateFamily(family, products);
  const checks = [
    ['example family passes', passed.status === 0 && passed.text.includes('FAMILY PASSED 3 products')],
    ['a shorter tap fails', drifted.ok === false && drifted.failures.some(item => item.code === 'drift' && item.key === 'tap_min_px')],
    ['a shared brand color fails', sameBrand.ok === false && sameBrand.failures.some(item => item.code === 'brand')],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
  console.log(`\n${checks.length - failed.length}/${checks.length} selftest checks passed`);
  return failed.length ? 1 : 0;
}

function isDirectRun() {
  const arg = process.argv[1];
  return Boolean(arg) && import.meta.url === pathToFileURL(arg).href;
}

if (isDirectRun()) {
  if (process.argv.includes('--selftest')) {
    process.exit(selftest());
  }
  const familyFlag = process.argv.indexOf('--family');
  const productsFlag = process.argv.indexOf('--products');
  const familyPath = familyFlag >= 0 ? process.argv[familyFlag + 1] : '';
  const productsDir = productsFlag >= 0 ? process.argv[productsFlag + 1] : '';
  if (!familyPath || !productsDir) {
    console.error('Usage: node drift.mjs --family <family.json> --products <dir> | --selftest');
    process.exit(2);
  }
  const result = checkFiles(familyPath, productsDir);
  const out = result.status === 0 ? console.log : console.error;
  out(result.text);
  process.exit(result.status);
}

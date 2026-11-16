import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateFamily, formatReport } from '../skills/fe-drift/scripts/drift-core.mjs';
import { checkFiles } from '../skills/fe-drift/scripts/drift.mjs';

const root = new URL('../skills/fe-drift/', import.meta.url).pathname;
const familyPath = join(root, 'templates/family.example.json');
const productsDir = join(root, 'templates/products');

function example() {
  const checked = checkFiles(familyPath, productsDir);
  assert.equal(checked.status, 0, checked.text);
  const family = JSON.parse(read(familyPath));
  const products = ['harbor', 'ledger', 'field'].map(name => JSON.parse(read(join(productsDir, `${name}.json`))));
  return { family, products };
}

function read(path) {
  return readFileSync(path, 'utf8');
}

test('fe-drift: the example family passes and the report names three products', () => {
  const { family, products } = example();
  const result = evaluateFamily(family, products);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  const text = formatReport(family, products, result);
  assert.match(text, /PASS harbor/);
  assert.match(text, /PASS ledger/);
  assert.match(text, /PASS field/);
  assert.match(text, /FAMILY PASSED 3 products \(example-family\)/);
});

test('fe-drift: a product that leaves the family numbers fails on that key only', () => {
  const { family, products } = example();
  products[0].craft.tap_min_px = 40;
  products[0].craft.type_ratio = 1.2;
  const result = evaluateFamily(family, products);
  assert.equal(result.ok, false);
  const keys = result.failures.map(item => item.key).sort();
  assert.deepEqual(keys, ['tap_min_px', 'type_ratio']);
  assert.ok(result.failures.every(item => item.product === 'harbor' && item.code === 'drift'));
});

test('fe-drift: shared brand color fails, shared typeface does not, and same-brand mode can allow one palette', () => {
  const { family, products } = example();
  products[1].brand.font_families = [...products[0].brand.font_families];
  assert.equal(evaluateFamily(family, products).ok, true);
  products[1].brand.palette = ['#0e6b4f'];
  const shared = evaluateFamily(family, products);
  assert.equal(shared.ok, false);
  assert.ok(shared.failures.some(item => item.code === 'brand' && item.message.includes('#0e6b4f')));
  family.brand_must_differ = [];
  assert.equal(evaluateFamily(family, products).ok, true);
});

test('fe-drift: missing state, unknown state, extra craft key and a low family floor all fail', () => {
  const { family, products } = example();
  products[2].states = products[2].states.filter(state => state !== 'offline');
  const missing = evaluateFamily(family, products);
  assert.ok(missing.failures.some(item => item.code === 'state' && item.key === 'offline'));

  products[2].states = [...example().products[2].states, 'mystery'];
  const unknown = evaluateFamily(family, products);
  assert.ok(unknown.failures.some(item => item.key === 'states' && item.message.includes('mystery')));

  const extra = example();
  extra.products[0].craft.shadow = [2];
  assert.ok(evaluateFamily(extra.family, extra.products).failures.some(item => item.key === 'shadow'));

  const low = example();
  low.family.craft.tap_min_px = 40;
  low.products.forEach(product => { product.craft.tap_min_px = 40; });
  assert.ok(evaluateFamily(low.family, low.products).failures.some(item => item.code === 'floor' && item.key === 'tap_min_px'));
});

test('fe-drift: one product is not a family check', () => {
  const { family, products } = example();
  const result = evaluateFamily(family, [products[0]]);
  assert.equal(result.ok, false);
  assert.ok(result.failures.every(item => item.code === 'empty'));
  const dir = mkdtempSync(join(tmpdir(), 'fe-drift-'));
  writeFileSync(join(dir, 'harbor.json'), JSON.stringify(products[0]));
  const checked = checkFiles(familyPath, dir);
  assert.equal(checked.status, 2);
});

test('fe-drift: selftest passes and a missing flag cannot run', () => {
  const cli = join(root, 'scripts/drift.mjs');
  const self = spawnSync(process.execPath, [cli, '--selftest'], { encoding: 'utf8' });
  assert.equal(self.status, 0, self.stdout + self.stderr);
  assert.match(self.stdout, /3\/3 selftest checks passed/);
  const bare = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(bare.status, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../skills/fe-reference/', import.meta.url).pathname;

test('fe-reference: matrix schema parses and fixed weights sum to 100', () => {
  const schema = JSON.parse(readFileSync(join(root, 'templates/matrix.schema.json'), 'utf8'));
  const weights = schema['x-fixed-weights'];
  assert.ok(weights, 'x-fixed-weights missing');
  const ids = Object.keys(weights);
  assert.equal(ids.length, 5);
  const total = ids.reduce((s, k) => s + weights[k], 0);
  assert.equal(total, 100);
  const allowed = schema.properties.criteria.items.properties.id.enum;
  for (const id of ids) assert.ok(allowed.includes(id), `weight id ${id} not in criteria enum`);
});

test('fe-reference: every reference folder has patterns.md', () => {
  const refDir = join(root, 'references');
  const folders = readdirSync(refDir).filter((n) => statSync(join(refDir, n)).isDirectory());
  assert.ok(folders.length >= 2, 'expected at least two reference folders');
  for (const f of folders) {
    assert.doesNotThrow(() => statSync(join(refDir, f, 'patterns.md')), `${f}/patterns.md missing`);
  }
});

test('fe-reference: every pattern block has id, where, job, maps_to', () => {
  const refDir = join(root, 'references');
  const folders = readdirSync(refDir).filter((n) => statSync(join(refDir, n)).isDirectory());
  for (const f of folders) {
    const md = readFileSync(join(refDir, f, 'patterns.md'), 'utf8');
    const blocks = md.split(/^### /m).slice(1);
    assert.ok(blocks.length > 0, `${f}: no pattern blocks`);
    for (const b of blocks) {
      const id = b.split(/\s+/)[0];
      assert.match(id, /^[a-z]+-\d{2}$/, `${f}: bad pattern id ${id}`);
      for (const field of ['- where:', '- measured:', '- job:', '- maps_to:']) {
        assert.ok(b.includes(field), `${f}/${id}: missing ${field}`);
      }
    }
  }
});

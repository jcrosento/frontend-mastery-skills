import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DIMENSIONS, familyOf, independence } from '../skills/fe-second-eye/scripts/second-eye-core.mjs';

const script = new URL('../skills/fe-second-eye/scripts/second-eye.mjs', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

function packed() {
  const dir = mkdtempSync(join(tmpdir(), 'fe-second-eye-'));
  writeFileSync(join(dir, 'before.png'), Buffer.from('before-pixels'));
  writeFileSync(join(dir, 'after.png'), Buffer.from('after-pixels'));
  writeFileSync(join(dir, 'brief.md'), 'Task: send money to a department.\n');
  const out = join(dir, 'run');
  const done = run('pack', '--before', join(dir, 'before.png'), '--after', join(dir, 'after.png'), '--brief', join(dir, 'brief.md'), '--out', out);
  assert.equal(done.status, 0, done.stderr || done.stdout);
  return { dir, out, key: JSON.parse(readFileSync(join(out, 'key.json'), 'utf8')) };
}

function fill(out, order, pick, model) {
  const path = join(out, 'packet', `ballot-${order}.json`);
  const ballot = JSON.parse(readFileSync(path, 'utf8'));
  ballot.judge = { model };
  for (const id of DIMENSIONS) { ballot.choices[id] = pick; ballot.reasons[id] = 'The total is the largest thing on the screen.'; }
  writeFileSync(path, JSON.stringify(ballot));
}

test('fe-second-eye: families are read from the model name', () => {
  assert.equal(familyOf({ model: 'claude-opus-5.5' }), 'anthropic');
  assert.equal(familyOf({ model: 'gpt-6.2-sol' }), 'openai');
  assert.equal(familyOf({ model: 'gemini-4-neon' }), 'google');
  assert.equal(independence({ model: 'claude-opus-5.5' }, { model: 'gpt-6.2-sol' }), null);
  assert.ok(independence({ model: 'claude-opus-5.5' }, { model: 'claude-fable-5.2' }));
  assert.ok(independence({ model: 'some-unknown-model' }, { model: 'gpt-6.2-sol' }), 'an unknown builder cannot be shown to be independent');
});

test('fe-second-eye: the packet is blind - it holds no key and never says which screen is the before', () => {
  const { out, key } = packed();
  const files = readdirSync(join(out, 'packet')).sort();
  assert.deepEqual(files, ['A.png', 'B.png', 'INSTRUCTIONS.md', 'ballot-AB.json', 'ballot-BA.json', 'brief.md']);
  assert.deepEqual(Object.values(key).sort(), ['after', 'before']);
  for (const name of ['INSTRUCTIONS.md', 'ballot-AB.json', 'ballot-BA.json']) {
    assert.doesNotMatch(readFileSync(join(out, 'packet', name), 'utf8'), /\b(before|after)\b/i, `${name} leaks which screen is which`);
  }
  assert.equal(readFileSync(join(out, 'packet', 'A.png'), 'utf8'), `${key.A}-pixels`);
});

test('fe-second-eye: two other-family judges who pick the after in both orders prove it, and the verdict is written', () => {
  const { out, key } = packed();
  const after = key.A === 'after' ? 'A' : 'B';
  fill(out, 'AB', after, 'gpt-6.2-sol');
  fill(out, 'BA', after, 'gemini-4-neon');
  const done = run('tally', '--dir', out, '--builder-model', 'claude-opus-5.5');
  assert.equal(done.status, 0, done.stdout);
  assert.match(done.stdout, /AFTER BETTER/);
  assert.equal(JSON.parse(readFileSync(join(out, 'verdict.json'), 'utf8')).verdict, 'AFTER BETTER');
});

test('fe-second-eye: a judge who picks whichever screen it saw first proves nothing', () => {
  const { out } = packed();
  fill(out, 'AB', 'A', 'gpt-6.2-sol');
  fill(out, 'BA', 'B', 'gpt-6.2-sol');
  const done = run('tally', '--dir', out, '--builder-model', 'claude-opus-5.5');
  assert.equal(done.status, 1);
  assert.match(done.stdout, /NOT PROVEN/);
});

test('fe-second-eye: the builder\'s own family is refused and no verdict file is written', () => {
  const { out, key } = packed();
  const after = key.A === 'after' ? 'A' : 'B';
  fill(out, 'AB', after, 'claude-fable-5.2');
  fill(out, 'BA', after, 'claude-fable-5.2');
  const done = run('tally', '--dir', out, '--builder-model', 'claude-opus-5.5');
  assert.equal(done.status, 2);
  assert.equal(existsSync(join(out, 'verdict.json')), false);
  assert.equal(run('check', '--builder-model', 'claude-opus-5.5', '--judge-model', 'gpt-6.2-sol').status, 0);
  assert.equal(run('check', '--builder-model', 'claude-opus-5.5', '--judge-model', 'claude-sonnet-5.5').status, 2);
});

test('fe-second-eye: an unfilled ballot and an identical pair are refused', () => {
  const { dir, out } = packed();
  assert.equal(run('tally', '--dir', out, '--builder-model', 'claude-opus-5.5').status, 2);
  const same = run('pack', '--before', join(dir, 'before.png'), '--after', join(dir, 'before.png'), '--brief', join(dir, 'brief.md'), '--out', join(dir, 'same'));
  assert.equal(same.status, 2);
});

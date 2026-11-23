#!/usr/bin/env node
// Usage: node second-eye.mjs pack --before <png> --after <png> --brief <md> [--reference <png>] --out <dir>
//        node second-eye.mjs tally --dir <dir> --builder-model <id> | --builder-human <name>
//        node second-eye.mjs check --builder-model <id> --judge-model <id>
//        node second-eye.mjs --selftest
// pack writes <dir>/packet (what the judge may open) and <dir>/key.json (what the judge may not).
// tally exit 0 AFTER BETTER, 1 NOT PROVEN or BEFORE BETTER, 2 refused.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { INSTRUCTIONS, assign, blankBallot, formatVerdict, independence, tally } from './second-eye-core.mjs';

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function who(prefix) {
  const model = flag(`--${prefix}-model`); const human = flag(`--${prefix}-human`);
  return human ? { human } : { model: model || '' };
}

export function pack({ before, after, brief, reference, out }) {
  for (const [name, path] of [['--before', before], ['--after', after], ['--brief', brief]]) {
    if (!path || !existsSync(path)) return { status: 2, text: `${name} must be a file that exists.` };
  }
  if (readFileSync(before).equals(readFileSync(after))) return { status: 2, text: 'before and after are the same image. There is nothing to judge.' };
  const packet = join(out, 'packet');
  mkdirSync(packet, { recursive: true });
  const key = assign(() => randomInt(2) / 2 + 0.25);
  copyFileSync(key.A === 'before' ? before : after, join(packet, 'A.png'));
  copyFileSync(key.B === 'before' ? before : after, join(packet, 'B.png'));
  copyFileSync(brief, join(packet, 'brief.md'));
  if (reference && existsSync(reference)) copyFileSync(reference, join(packet, 'reference.png'));
  writeFileSync(join(packet, 'INSTRUCTIONS.md'), INSTRUCTIONS);
  for (const order of ['AB', 'BA']) writeFileSync(join(packet, `ballot-${order}.json`), `${JSON.stringify(blankBallot(order), null, 2)}\n`);
  writeFileSync(join(out, 'key.json'), `${JSON.stringify(key)}\n`);
  return { status: 0, text: `PACKED ${packet}\nGive the judge only that folder. Run the judge twice, each in a fresh chat: once on ballot-AB.json (look at A first), once on ballot-BA.json (look at B first).\nKeep ${join(out, 'key.json')} away from the judge.` };
}

export function tallyDir(dir, builder) {
  const result = tally({
    key: readJson(join(dir, 'key.json')),
    builder,
    ballots: { AB: readJson(join(dir, 'packet', 'ballot-AB.json')), BA: readJson(join(dir, 'packet', 'ballot-BA.json')) },
  });
  return { result, text: formatVerdict(result) };
}

function selftest() {
  const reasons = Object.fromEntries(['task', 'hierarchy', 'readable', 'clean', 'reference'].map(id => [id, 'The total is the largest thing on the screen.']));
  const ballot = (order, pick, model) => ({ order, judge: { model }, choices: Object.fromEntries(Object.keys(reasons).map(id => [id, pick])), reasons, defects: [] });
  const key = { A: 'before', B: 'after' };
  const builder = { model: 'claude-opus-5.5' };
  const good = tally({ key, builder, ballots: { AB: ballot('AB', 'B', 'gpt-6.2-sol'), BA: ballot('BA', 'B', 'gemini-4-neon') } });
  const flipped = tally({ key, builder, ballots: { AB: ballot('AB', 'A', 'gpt-6.2-sol'), BA: ballot('BA', 'B', 'gpt-6.2-sol') } });
  const own = tally({ key, builder, ballots: { AB: ballot('AB', 'B', 'claude-fable-5.2'), BA: ballot('BA', 'B', 'gpt-6.2-sol') } });
  const checks = [
    ['two other-family judges who agree in both orders prove the after', good.status === 0 && good.verdict === 'AFTER BETTER'],
    ['a choice that flips with the order proves nothing', flipped.verdict === 'NOT PROVEN' && flipped.reversals === 5],
    ['a judge from the builder\'s family is refused', own.status === 2 && /both anthropic/.test(own.problems.join(' '))],
    ['a person may judge any model, but not their own build', independence(builder, { human: 'Rhea' }) === null && independence({ human: 'Rhea' }, { human: 'rhea' }) !== null],
    ['a claimed family cannot override the model name', independence(builder, { model: 'claude-sonnet-5.5', family: 'openai' }) !== null],
  ];
  checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} selftest checks passed`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  if (command === '--selftest') process.exit(selftest());
  if (command === 'pack') {
    const out = flag('--out');
    if (!out) { console.error('pack needs --out <dir>'); process.exit(2); }
    const done = pack({ before: flag('--before'), after: flag('--after'), brief: flag('--brief'), reference: flag('--reference'), out });
    console.log(done.text);
    process.exit(done.status);
  }
  if (command === 'tally') {
    const dir = flag('--dir');
    if (!dir) { console.error('tally needs --dir <dir>'); process.exit(2); }
    const { result, text } = tallyDir(dir, who('builder'));
    console.log(text);
    if (result.status !== 2) writeFileSync(join(dir, 'verdict.json'), `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), ...result }, null, 2)}\n`);
    process.exit(result.status);
  }
  if (command === 'check') {
    const reason = independence(who('builder'), who('judge'));
    console.log(reason ? `REFUSED ${reason}` : 'OK this judge may judge this builder');
    process.exit(reason ? 2 : 0);
  }
  console.error('Usage: second-eye.mjs pack | tally | check | --selftest');
  process.exit(2);
}

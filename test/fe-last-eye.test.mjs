import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateCard, formatReport, formatReprompt, memoryRows } from '../skills/fe-last-eye/scripts/last-eye-core.mjs';
import { addNote, listMemory } from '../skills/fe-memory/scripts/memory.mjs';
import { openMisses } from '../skills/fe-memory/scripts/memory-core.mjs';

const cardPath = new URL('../skills/fe-last-eye/templates/scorecard.example.json', import.meta.url).pathname;
const lastEye = new URL('../skills/fe-last-eye/scripts/last-eye.mjs', import.meta.url).pathname;

function example() {
  return JSON.parse(readFileSync(cardPath, 'utf8'));
}

function drop(card, id, score, note) {
  const next = structuredClone(card);
  const line = next.lines.find(item => item.id === id);
  line.score = score;
  line.do_not_repeat = note;
  return next;
}

test('fe-last-eye: the example card is a merge', () => {
  const card = example();
  const result = evaluateCard(card, []);
  assert.equal(result.status, 0);
  assert.equal(result.verdict, 'MERGE');
  const text = formatReport(card, result);
  assert.match(text, /PASS animation 9/);
  assert.match(text, /SKIP backend/);
  assert.match(text, /VERDICT MERGE/);
  assert.equal(formatReprompt(card, result), '');
});

test('fe-last-eye: one line under 8 sends only that line back to the builder', () => {
  const card = drop(example(), 'animation', 5, 'Do not loop a hero video over the date.');
  const result = evaluateCard(card, []);
  assert.equal(result.status, 1);
  assert.equal(result.action, 'RECREATE');
  assert.deepEqual(result.misses.map(item => item.id), ['animation']);
  const reprompt = formatReprompt(card, result);
  assert.match(reprompt, /# New game/);
  assert.match(reprompt, /fe-build/);
  assert.match(reprompt, /\/build-agents/);
  assert.match(reprompt, /Do not loop a hero video/);
  assert.match(reprompt, /Passed/);
  assert.match(reprompt, /consistent 9/);
  assert.doesNotMatch(reprompt, /### Animation[\s\S]*### /);
});

test('fe-last-eye: a bad card is refused and a server change cannot skip backend', () => {
  const extra = example();
  extra.mood = 'calm';
  assert.equal(evaluateCard(extra, []).status, 2);

  const lazy = drop(example(), 'clean', 4, 'Do not ship placeholder copy.');
  lazy.lines.find(line => line.id === 'clean').evidence = 'looks good to me overall.';
  assert.equal(evaluateCard(lazy, []).status, 2);

  const server = example();
  server.touches_server = true;
  assert.equal(evaluateCard(server, []).status, 2);
  assert.match(formatReport(server, evaluateCard(server, [])), /cannot be skipped/);
});

test('fe-last-eye: the same finding is not logged twice, and the third distinct miss asks', () => {
  const first = drop(example(), 'clean', 6, 'Do not leave placeholder words in the hero.');
  const firstResult = evaluateCard(first, []);
  const logged = memoryRows(first, firstResult, []);
  assert.equal(logged.length, 1);
  const rerun = evaluateCard(first, logged);
  assert.equal(rerun.action, 'RECREATE');
  assert.deepEqual(rerun.already, ['clean']);
  assert.equal(memoryRows(first, rerun, logged).length, 0);
  assert.match(formatReport(first, rerun), /ALREADY LOGGED clean/);

  const second = drop(example(), 'clean', 6, 'Do not use lorem in the subhead.');
  second.lines.find(line => line.id === 'clean').evidence = 'The subhead still says lorem on the mobile hero.';
  const secondResult = evaluateCard(second, logged);
  const two = [...logged, ...memoryRows(second, secondResult, logged)];
  assert.equal(secondResult.action, 'RECREATE');

  const third = drop(example(), 'clean', 5, 'Do not hide the price under the fold.');
  third.lines.find(line => line.id === 'clean').evidence = 'The price sits below the fold at 390.';
  const thirdResult = evaluateCard(third, two);
  assert.equal(thirdResult.action, 'ASK');
  assert.match(formatReprompt(third, thirdResult), /# Stop/);
  assert.match(formatReprompt(third, thirdResult), /Ask the founder/);
});

test('fe-last-eye: a passing score that copies the open miss does not merge, and a real pass closes it', () => {
  const missed = drop(example(), 'reference', 4, 'Do not invent the fold. Match the approved frame.');
  missed.lines.find(line => line.id === 'reference').evidence = 'The fold was invented. The approved frame has a date field that this build dropped.';
  const prior = memoryRows(missed, evaluateCard(missed, []), []);
  const copied = example();
  copied.lines.find(line => line.id === 'reference').evidence = missed.lines.find(line => line.id === 'reference').evidence;
  const stuck = evaluateCard(copied, prior);
  assert.equal(stuck.status, 1);
  assert.equal(stuck.misses[0].forced, true);

  const passed = evaluateCard(example(), prior);
  assert.equal(passed.status, 0);
  const closed = memoryRows(example(), passed, prior);
  assert.deepEqual(closed[0].closes, ['reference']);
  assert.equal(openMisses([...prior, ...closed], 'harbor', 'home').length, 0);
});

test('fe-last-eye: another screen does not spend this screen\'s strikes', () => {
  const other = drop(example(), 'animation', 3, 'Do not autoplay the header.');
  other.subject = 'booking';
  const prior = memoryRows(other, evaluateCard(other, []), []);
  const home = drop(example(), 'animation', 4, 'Do not autoplay the header film.');
  home.lines.find(line => line.id === 'animation').evidence = 'The home header film starts on its own.';
  assert.equal(evaluateCard(home, prior).action, 'RECREATE');
});

test('fe-memory: a note is open until a last-eye merge closes that line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-memory-note-'));
  const noted = addNote(dir, {
    project: 'harbor',
    subject: 'home',
    date: '2026-11-17',
    line: 'animation',
    evidence: 'The hero video looped and covered the date picker.',
    doNotRepeat: 'Do not autoplay a hero video over the offer.',
  });
  assert.equal(addNote(dir, { project: 'harbor', subject: 'Home', date: '2026-11-17', line: 'animation', evidence: 'short', doNotRepeat: 'no' }).status, 2);
  assert.equal(noted.added, true);
  assert.equal(listMemory(dir, 'harbor', 'home').status, 1);
  const again = addNote(dir, {
    project: 'harbor',
    subject: 'home',
    date: '2026-11-17',
    line: 'animation',
    evidence: 'The hero video looped and covered the date picker.',
    doNotRepeat: 'Do not autoplay a hero video over the offer.',
  });
  assert.equal(again.added, false);

  const card = example();
  const memoryFile = join(dir, 'harbor.jsonl');
  const prior = readFileSync(memoryFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const passed = evaluateCard(card, prior);
  const rows = memoryRows(card, passed, prior);
  assert.deepEqual(rows[0].closes, ['animation']);
});

test('fe-last-eye: the command writes one memory line and a reprompt, and a second run does not duplicate them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-last-eye-'));
  const card = drop(example(), 'performance', 6, 'Do not ship a hero image without a reserved height.');
  const cardFile = join(dir, 'scorecard.json');
  const memoryFile = join(dir, 'harbor.jsonl');
  writeFileSync(cardFile, JSON.stringify(card));
  const first = spawnSync(process.execPath, [lastEye, '--card', cardFile, '--memory', memoryFile, '--write'], { encoding: 'utf8' });
  assert.equal(first.status, 1, first.stdout + first.stderr);
  assert.match(first.stdout, /VERDICT NEW GAME/);
  assert.equal(existsSync(join(dir, 'reprompt.md')), true);
  const lines = readFileSync(memoryFile, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const second = spawnSync(process.execPath, [lastEye, '--card', cardFile, '--memory', memoryFile, '--write'], { encoding: 'utf8' });
  assert.equal(second.status, 1);
  assert.match(second.stdout, /ALREADY LOGGED performance/);
  assert.equal(readFileSync(memoryFile, 'utf8').trim().split('\n').length, 1);
});

test('fe-last-eye: a card judged by the builder, or by a model of the builder\'s family, is refused', () => {
  const same = { ...example(), judge: { model: 'claude-opus-5.5' } };
  const family = { ...example(), judge: { model: 'claude-fable-5.2' } };
  for (const card of [same, family]) {
    const result = evaluateCard(card, []);
    assert.equal(result.status, 2, 'a self-graded card must not reach a verdict');
    assert.equal(result.verdict, null);
    assert.match(formatReport(card, result), /JUDGE/);
    assert.doesNotMatch(formatReport(card, result), /VERDICT MERGE/);
  }
});

test('fe-last-eye: a card with no builder or no judge is refused, and a person may judge any model', () => {
  const { builder, ...noBuilder } = example();
  const { judge, ...noJudge } = example();
  assert.equal(evaluateCard(noBuilder, []).status, 2);
  assert.equal(evaluateCard(noJudge, []).status, 2);
  const human = { ...example(), judge: { human: 'Rhea' } };
  assert.equal(evaluateCard(human, []).verdict, 'MERGE');
  const claimed = { ...example(), judge: { model: 'claude-sonnet-5.5', family: 'openai' } };
  assert.equal(evaluateCard(claimed, []).status, 2, 'a claimed family must not override the model name');
});

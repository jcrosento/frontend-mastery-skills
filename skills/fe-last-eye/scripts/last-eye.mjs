#!/usr/bin/env node
// Usage: node last-eye.mjs --card <scorecard.json> --memory <project.jsonl> [--write]
//        node last-eye.mjs --selftest
// Exit 0 when every line clears 8 (MERGE).
// Exit 1 when a line misses (NEW GAME). Exit 2 when the card or the memory cannot be scored.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateCard, formatReport, formatReprompt, memoryRows } from './last-eye-core.mjs';
import { readMemory, writeMemory } from '../../fe-memory/scripts/memory-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function readJson(path) {
  try {
    return { ok: true, data: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function checkCard(cardPath, memoryPath) {
  const card = readJson(cardPath);
  if (!card.ok) return { status: 2, text: `Cannot read scorecard: ${card.error}`, reprompt: '', rows: [] };
  const memory = readMemory(memoryPath);
  if (!memory.ok) return { status: 2, text: `Cannot read memory: ${memory.error}`, reprompt: '', rows: [] };
  const result = evaluateCard(card.data, memory.entries);
  const text = formatReport(card.data, result);
  const reprompt = formatReprompt(card.data, result);
  const rows = memoryRows(card.data, result, memory.entries);
  return { status: result.status, text, reprompt, rows, card: card.data, entries: memory.entries, result };
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function selftest() {
  const cardPath = join(here, '../templates/scorecard.example.json');
  const card = readJson(cardPath);
  const passed = evaluateCard(card.data, []);
  const low = structuredClone(card.data);
  const clean = low.lines.find(line => line.id === 'clean');
  clean.score = 6;
  clean.do_not_repeat = 'Do not leave placeholder words in the hero.';
  const missed = evaluateCard(low, []);
  const again = memoryRows(low, missed, []);
  const thirdPrior = [
    { ...again[0], evidence: 'First miss on the hero copy.', date: '2026-11-15' },
    { ...again[0], evidence: 'Second miss on the hero copy.', date: '2026-11-16' },
  ];
  const asked = evaluateCard(low, thirdPrior);
  const checks = [
    ['example card merges', passed.status === 0 && passed.verdict === 'MERGE'],
    ['a line under 8 is a new game', missed.status === 1 && missed.action === 'RECREATE' && missed.misses.some(item => item.id === 'clean')],
    ['the third distinct miss asks', asked.action === 'ASK' && formatReprompt(low, asked).includes('# Stop')],
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
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const cardPath = flag('--card');
  const memoryPath = flag('--memory');
  if (!cardPath || !memoryPath) {
    console.error('Usage: node last-eye.mjs --card <scorecard.json> --memory <project.jsonl> [--write]');
    process.exit(2);
  }
  const checked = checkCard(cardPath, memoryPath);
  console.log(checked.text);
  if (checked.reprompt) console.log(`\n${checked.reprompt}`);
  if (checked.status !== 2 && process.argv.includes('--write')) {
    const next = [...checked.entries, ...checked.rows];
    if (checked.rows.length) writeMemory(memoryPath, next);
    if (checked.status === 1) writeFileSync(join(dirname(cardPath), 'reprompt.md'), checked.reprompt);
  }
  process.exit(checked.status);
}

#!/usr/bin/env node
// Usage: node memory.mjs --project <slug> --dir <design/memory> [--subject <slug>]
//        node memory.mjs --note --project <slug> --dir <dir> --subject <slug> --line <id> --evidence "..." --do-not-repeat "..." --date YYYY-MM-DD
//        node memory.mjs --selftest
// Exit 0 when that project has no open miss. Exit 1 when a miss is still open.
// Exit 2 when the file or the arguments cannot be used. This script never edits a site.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LINE_IDS } from '../../fe-last-eye/scripts/last-eye-core.mjs';
import { formatOpen, memoryPath, noteEntry, openMisses, readMemory, validateEntry, writeMemory } from './memory-core.mjs';

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function slug(value) {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function listMemory(dir, project, subject) {
  if (!slug(project)) return { status: 2, text: 'project must be a short lowercase slug.' };
  if (subject && !slug(subject)) return { status: 2, text: 'subject must be a short lowercase slug.' };
  const loaded = readMemory(memoryPath(dir, project));
  if (!loaded.ok) return { status: 2, text: `Cannot read memory: ${loaded.error}` };
  const open = openMisses(loaded.entries, project, subject || null);
  return { status: open.length ? 1 : 0, text: formatOpen(project, open), entries: loaded.entries, open };
}

export function addNote(dir, fields) {
  if (!slug(fields.project) || !slug(fields.subject)) return { status: 2, text: 'project and subject must be short lowercase slugs.' };
  if (typeof fields.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) return { status: 2, text: 'date must be YYYY-MM-DD.' };
  if (typeof fields.evidence !== 'string' || fields.evidence.trim().length < 24 || fields.evidence.includes('\n')) {
    return { status: 2, text: 'evidence must be one specific sentence.' };
  }
  if (typeof fields.doNotRepeat !== 'string' || fields.doNotRepeat.trim().length < 12 || fields.doNotRepeat.includes('\n')) {
    return { status: 2, text: 'do_not_repeat must say what not to do again.' };
  }
  const entry = noteEntry(fields);
  const problem = validateEntry(entry);
  if (problem) return { status: 2, text: problem };
  if (!LINE_IDS.includes(fields.line)) return { status: 2, text: 'line must be one of the ten last-eye lines.' };
  const path = memoryPath(dir, fields.project);
  const loaded = readMemory(path);
  if (!loaded.ok) return { status: 2, text: `Cannot read memory: ${loaded.error}` };
  const duplicate = loaded.entries.some(item => item.verdict === 'NOTE'
    && item.subject === entry.subject
    && item.line === entry.line
    && item.evidence === entry.evidence);
  const entries = duplicate ? loaded.entries : [...loaded.entries, entry];
  if (!duplicate) writeMemory(path, entries);
  const open = openMisses(entries, fields.project, null);
  return { status: open.length ? 1 : 0, text: formatOpen(fields.project, open), added: !duplicate };
}

function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'fe-memory-'));
  const empty = listMemory(dir, 'harbor', 'home');
  const noted = addNote(dir, {
    project: 'harbor',
    subject: 'home',
    date: '2026-11-17',
    line: 'animation',
    evidence: 'The hero video looped and covered the date picker.',
    doNotRepeat: 'Do not autoplay a hero video over the offer.',
  });
  const twice = addNote(dir, {
    project: 'harbor',
    subject: 'home',
    date: '2026-11-17',
    line: 'animation',
    evidence: 'The hero video looped and covered the date picker.',
    doNotRepeat: 'Do not autoplay a hero video over the offer.',
  });
  const checks = [
    ['an empty project is clear', empty.status === 0 && empty.text.includes('clear')],
    ['a note stays open', noted.status === 1 && noted.text.includes('OPEN home animation')],
    ['the same note is not written twice', twice.added === false],
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
  const project = flag('--project');
  const dir = flag('--dir');
  if (!project || !dir) {
    console.error('Usage: node memory.mjs --project <slug> --dir <design/memory> [--subject <slug>]');
    process.exit(2);
  }
  if (process.argv.includes('--note')) {
    const result = addNote(dir, {
      project,
      subject: flag('--subject'),
      date: flag('--date'),
      line: flag('--line'),
      evidence: flag('--evidence'),
      doNotRepeat: flag('--do-not-repeat'),
    });
    console.log(result.text);
    process.exit(result.status);
  }
  const listed = listMemory(dir, project, flag('--subject'));
  console.log(listed.text);
  process.exit(listed.status);
}

// Project memory: one JSONL file per product. Pure helpers plus a file reader.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { LINE_IDS } from '../../fe-last-eye/scripts/last-eye-core.mjs';

const SOURCES = new Set(['fe-last-eye', 'fe-memory']);
const VERDICTS = new Set(['NEW GAME', 'MERGE', 'NOTE']);

export function memoryPath(dir, project) {
  return `${dir.replace(/\/+$/, '')}/${project}.jsonl`;
}

export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'A memory line must be an object.';
  if (typeof entry.project !== 'string' || typeof entry.subject !== 'string') return 'A memory line needs a project and a subject.';
  if (typeof entry.date !== 'string') return 'A memory line needs a date.';
  if (!SOURCES.has(entry.source)) return `Unknown memory source "${entry.source}".`;
  if (!VERDICTS.has(entry.verdict)) return `Unknown memory verdict "${entry.verdict}".`;
  if (entry.verdict === 'MERGE') {
    if (entry.action !== 'MERGE' || !Array.isArray(entry.closes) || entry.closes.some(id => !LINE_IDS.includes(id))) {
      return 'A MERGE memory line needs action MERGE and closes set to known lines.';
    }
    return null;
  }
  if (!LINE_IDS.includes(entry.line)) return 'A memory miss needs one of the ten lines.';
  if (typeof entry.evidence !== 'string' || typeof entry.do_not_repeat !== 'string') {
    return 'A memory miss needs evidence and do_not_repeat.';
  }
  if (entry.verdict === 'NOTE') {
    if (entry.action !== 'NOTE' || entry.source !== 'fe-memory') return 'A NOTE must come from fe-memory.';
    return null;
  }
  if (entry.action !== 'RECREATE' && entry.action !== 'ASK') return 'A NEW GAME memory line needs action RECREATE or ASK.';
  if (!Number.isInteger(entry.score) || entry.score < 0 || entry.score > 10) return 'A NEW GAME memory line needs a score.';
  return null;
}

export function parseJsonl(text) {
  const entries = [];
  const lines = String(text).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (error) {
      return { ok: false, error: `Memory line ${index + 1} is not JSON.`, entries: [] };
    }
    const problem = validateEntry(entry);
    if (problem) return { ok: false, error: `Memory line ${index + 1}: ${problem}`, entries: [] };
    entries.push(entry);
  }
  return { ok: true, entries };
}

export function readMemory(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: true, entries: [], missing: true };
    return { ok: false, error: error.message, entries: [] };
  }
  return { ...parseJsonl(text), missing: false };
}

export function writeMemory(path, entries) {
  mkdirSync(dirname(path), { recursive: true });
  const body = entries.length ? `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n` : '';
  writeFileSync(path, body);
}

export function noteEntry({ project, subject, date, line, evidence, doNotRepeat }) {
  return {
    project,
    subject,
    date,
    source: 'fe-memory',
    verdict: 'NOTE',
    action: 'NOTE',
    line,
    evidence,
    do_not_repeat: doNotRepeat,
  };
}

export function openMisses(entries, project, subject) {
  const open = new Map();
  for (const entry of entries) {
    if (entry.project !== project) continue;
    if (subject && entry.subject !== subject) continue;
    if (entry.verdict === 'MERGE') {
      for (const id of entry.closes) open.delete(`${entry.subject}:${id}`);
      continue;
    }
    open.set(`${entry.subject}:${entry.line}`, entry);
  }
  return [...open.values()];
}

export function formatOpen(project, open) {
  if (!open.length) return `MEMORY ${project}  clear`;
  const lines = [`MEMORY ${project}  ${open.length} open`];
  for (const entry of open) {
    lines.push(`OPEN ${entry.subject} ${entry.line}  ${entry.verdict}  ${entry.do_not_repeat}`);
  }
  return lines.join('\n');
}

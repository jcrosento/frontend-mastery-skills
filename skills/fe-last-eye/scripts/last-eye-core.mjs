// Scorecard rules for the last eye. Pure: no files, no network.
// A merge is allowed only when every scored line is 8 or higher.
// One miss is a new game: hand that line back to the builder.

export const LINE_IDS = [
  'consistent',
  'first-place',
  'animation',
  'performance',
  'responsive',
  'backend',
  'consistency',
  'clean',
  'reference',
  'new-game',
];

export const FLOOR = 8;
// Two logged misses may be rebuilt. The third distinct miss stops and asks.
export const ASK_AT = 3;

const CARD_KEYS = new Set(['project', 'subject', 'date', 'touches_server', 'lines']);
const LINE_KEYS = new Set(['id', 'score', 'na', 'evidence', 'source', 'do_not_repeat']);
const BANNED = new Set(['pass', 'ok', 'lgtm', 'looks good', 'todo', 'tbd', 'n/a', 'na', 'yes', 'fine', 'good', 'ship it']);

export function norm(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function realDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function slug(value, max) {
  return typeof value === 'string' && value.length <= max && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function sentence(value, min, max) {
  if (typeof value !== 'string' || value.includes('\n')) return false;
  const text = value.trim();
  if (text.length < min || text.length > max) return false;
  const normalized = norm(text);
  if (BANNED.has(normalized)) return false;
  const words = normalized.split(' ');
  if (words.length < 8 && /^(pass|ok|lgtm|looks good|todo|tbd|yes|fine|good|ship it)\b/.test(normalized)) return false;
  return true;
}

export function lineHistory(prior, project, subject, line) {
  let strikes = 0;
  let openEvidence = null;
  let openDoNot = null;
  let openDate = null;
  for (const entry of prior) {
    if (entry.project !== project || entry.subject !== subject) continue;
    if (entry.verdict === 'MERGE' && Array.isArray(entry.closes) && entry.closes.includes(line)) {
      strikes = 0;
      openEvidence = null;
      openDoNot = null;
      openDate = null;
      continue;
    }
    if (entry.verdict === 'NOTE' && entry.line === line) {
      openEvidence = norm(entry.evidence);
      openDoNot = entry.do_not_repeat;
      openDate = entry.date;
      continue;
    }
    if (entry.verdict === 'NEW GAME' && entry.line === line) {
      strikes += 1;
      openEvidence = norm(entry.evidence);
      openDoNot = entry.do_not_repeat;
      openDate = entry.date;
    }
  }
  return { strikes, openEvidence, openDoNot, openDate };
}

function shapeOf(card) {
  const failures = [];
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    return [{ code: 'shape', id: null, message: 'Scorecard must be an object.' }];
  }
  for (const key of Object.keys(card)) {
    if (!CARD_KEYS.has(key)) failures.push({ code: 'shape', id: null, message: `Unknown scorecard field "${key}".` });
  }
  if (!slug(card.project, 40)) failures.push({ code: 'shape', id: null, message: 'project must be a short lowercase slug.' });
  if (!slug(card.subject, 40)) failures.push({ code: 'shape', id: null, message: 'subject must be a short lowercase slug.' });
  if (!realDate(card.date)) failures.push({ code: 'shape', id: null, message: 'date must be a real YYYY-MM-DD day.' });
  if (typeof card.touches_server !== 'boolean') failures.push({ code: 'shape', id: null, message: 'touches_server must be true or false.' });
  if (!Array.isArray(card.lines) || card.lines.length !== LINE_IDS.length) {
    failures.push({ code: 'shape', id: null, message: `lines must be the ten lines, in order: ${LINE_IDS.join(', ')}.` });
    return failures;
  }
  card.lines.forEach((line, index) => {
    const id = LINE_IDS[index];
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      failures.push({ code: 'shape', id, message: `${id} must be an object.` });
      return;
    }
    for (const key of Object.keys(line)) {
      if (!LINE_KEYS.has(key)) failures.push({ code: 'shape', id, message: `${id} has unknown field "${key}".` });
    }
    if (line.id !== id) failures.push({ code: 'shape', id, message: `Line ${index + 1} must be "${id}".` });
    if (!sentence(line.evidence, 24, 280)) failures.push({ code: 'shape', id, message: `${id} needs a specific evidence sentence (24 to 280 characters).` });
    if (!sentence(line.source, 5, 180)) failures.push({ code: 'shape', id, message: `${id} needs a source path or address.` });
    const na = line.na === true;
    if (line.na !== undefined && line.na !== true) failures.push({ code: 'shape', id, message: `${id} na must be true when it is set.` });
    if (na && id !== 'backend') failures.push({ code: 'shape', id, message: `${id} cannot be skipped.` });
    if (na && card.touches_server === true) failures.push({ code: 'shape', id: 'backend', message: 'backend cannot be skipped when the change touches the server.' });
    if (na && line.score !== undefined) failures.push({ code: 'shape', id, message: `${id} cannot carry both na and a score.` });
    if (na && line.do_not_repeat !== undefined) failures.push({ code: 'shape', id, message: `${id} does not take do_not_repeat when it is skipped.` });
    if (!na) {
      if (!Number.isInteger(line.score) || line.score < 0 || line.score > 10) {
        failures.push({ code: 'shape', id, message: `${id} score must be a whole number from 0 to 10.` });
      } else if (line.score < FLOOR) {
        if (!sentence(line.do_not_repeat, 12, 200)) failures.push({ code: 'shape', id, message: `${id} is under 8, so it needs a do_not_repeat sentence.` });
      } else if (line.do_not_repeat !== undefined) {
        failures.push({ code: 'shape', id, message: `${id} is 8 or higher, so do_not_repeat must be left off.` });
      }
    }
  });
  return failures;
}

export function evaluateCard(card, prior = []) {
  const shape = shapeOf(card);
  if (shape.length) {
    return { ok: false, status: 2, verdict: null, action: null, failures: shape, misses: [], already: [] };
  }
  const misses = [];
  const already = [];
  for (const line of card.lines) {
    if (line.na === true) continue;
    const past = lineHistory(prior, card.project, card.subject, line.id);
    const same = past.openEvidence !== null && past.openEvidence === norm(line.evidence);
    const forced = line.score >= FLOOR && same;
    if (line.score >= FLOOR && !forced) continue;
    const item = {
      id: line.id,
      score: line.score,
      evidence: line.evidence.trim(),
      do_not_repeat: (line.do_not_repeat || past.openDoNot || 'Do not hand the same screen back.').trim(),
      same,
      strikes: past.strikes,
      forced,
    };
    misses.push(item);
    if (same) already.push(line.id);
  }
  if (!misses.length) {
    return { ok: true, status: 0, verdict: 'MERGE', action: 'MERGE', failures: [], misses: [], already: [] };
  }
  const ask = misses.some(item => item.strikes + (item.same ? 0 : 1) >= ASK_AT);
  return {
    ok: false,
    status: 1,
    verdict: 'NEW GAME',
    action: ask ? 'ASK' : 'RECREATE',
    failures: misses.map(item => ({
      code: item.forced ? 'repeat' : 'floor',
      id: item.id,
      message: item.forced
        ? `${item.id} repeats the open memory, so a passing score does not count.`
        : `${item.id} is ${item.score}/10. The floor is ${FLOOR}.`,
    })),
    misses,
    already,
  };
}

export function memoryRows(card, result, prior = []) {
  if (result.status === 2) return [];
  if (result.status === 0) {
    const closes = LINE_IDS.filter(id => {
      const past = lineHistory(prior, card.project, card.subject, id);
      return past.openEvidence !== null || past.strikes > 0;
    });
    const row = {
      project: card.project,
      subject: card.subject,
      date: card.date,
      source: 'fe-last-eye',
      verdict: 'MERGE',
      action: 'MERGE',
      closes,
    };
    const duplicate = prior.some(entry => entry.verdict === 'MERGE'
      && entry.project === row.project
      && entry.subject === row.subject
      && entry.date === row.date
      && Array.isArray(entry.closes)
      && entry.closes.join() === closes.join());
    return duplicate ? [] : [row];
  }
  return result.misses.filter(item => !item.same).map(item => ({
    project: card.project,
    subject: card.subject,
    date: card.date,
    source: 'fe-last-eye',
    verdict: 'NEW GAME',
    action: result.action,
    line: item.id,
    score: item.score,
    evidence: item.evidence,
    do_not_repeat: item.do_not_repeat,
  }));
}

function label(id) {
  if (id === 'first-place') return 'First place';
  if (id === 'new-game') return 'New game';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function formatReport(card, result) {
  if (result.status === 2) {
    return ['LAST EYE  card refused', ...result.failures.map(item => `SHAPE ${item.id || 'card'}  ${item.message}`)].join('\n');
  }
  const lines = [`LAST EYE  ${card.project}  ${card.subject}  ${card.date}`];
  for (const id of result.already) lines.push(`ALREADY LOGGED ${id}`);
  const byId = new Map(result.misses.map(item => [item.id, item]));
  for (const line of card.lines) {
    if (line.na === true) {
      lines.push(`SKIP backend  no server in this change`);
      continue;
    }
    const miss = byId.get(line.id);
    lines.push(miss ? `FAIL ${line.id} ${line.score}` : `PASS ${line.id} ${line.score}`);
  }
  lines.push(`VERDICT ${result.verdict}`);
  lines.push(`ACTION ${result.action}`);
  return lines.join('\n');
}

export function formatReprompt(card, result) {
  if (result.status !== 1) return '';
  const passed = card.lines
    .filter(line => line.na !== true && !result.misses.some(item => item.id === line.id))
    .map(line => `${line.id} ${line.score}`)
    .join(', ');
  const blocks = result.misses.map(item => {
    const same = item.same ? '\nAlready logged. The screen has not changed, so do not start another build on this finding.' : '';
    const nth = !item.same && item.strikes + 1 >= ASK_AT ? `\nThis is miss ${item.strikes + 1} for ${label(item.id)}. Stop and ask.` : '';
    return `### ${label(item.id)} — ${item.score}/10\nWhat the last eye saw: ${item.evidence}\nDo not repeat: ${item.do_not_repeat}${same}${nth}`;
  });
  const order = result.action === 'ASK'
    ? 'Do not start another build. Ask the founder what to change, then wait.'
    : 'Recreate only the lines below. Leave every passing line as it is. Hand this file to fe-build as the task. If this project builds with /build-agents, paste this file as the task. When the rebuild is done, run fe-last-eye again.';
  return [
    result.action === 'ASK' ? '# Stop' : '# New game',
    '',
    `Project: ${card.project}`,
    `Screen: ${card.subject}`,
    `Date: ${card.date}`,
    '',
    'Do not merge.',
    `Read the project memory first: design/memory/${card.project}.jsonl`,
    order,
    '',
    '## Recreate',
    ...blocks,
    '',
    `## Passed`,
    passed || '(none)',
    '',
  ].join('\n');
}

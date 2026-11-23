#!/usr/bin/env node
// Usage: node scripts/grade-skills.mjs [--strict] [--json] [--skill fe-x]
// Grades how each skill is packaged, out of 100. Every point comes from a check a machine can repeat.
// It does not grade the design a skill produces. That is fe-second-eye's job, on real screens.
// --strict exits 1 when any skill is under 100.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CHECKS = [
  ['installs', 15, 'Frontmatter is valid YAML and name equals the folder.'],
  ['short', 10, 'Description is 60 words or fewer. Every chat pays for every description.'],
  ['trigger', 10, 'Description says when to load it ("Use when", "Use before", "Use after", "Use for").'],
  ['boundary', 10, 'Description names the nearest job it is not for ("Not for").'],
  ['body', 10, 'SKILL.md is 10,000 characters or fewer.'],
  ['paths', 15, 'Every script, template or reference the skill names exists.'],
  ['scripts', 10, 'Every .mjs in the skill passes node --check.'],
  ['routed', 10, 'AGENTS.md or fe-master names the skill, so something loads it.'],
  ['output', 5, 'The skill says what it writes or where the result goes.'],
  ['independent', 5, 'A skill that scores work points at fe-second-eye, so the builder is not its own judge.'],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path)); else out.push(path);
  }
  return out;
}

export function words(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

export function gradeSkill(folder, { skillsDir = join(root, 'skills'), routing = '' } = {}) {
  const dir = join(skillsDir, folder);
  const file = join(dir, 'SKILL.md');
  const got = Object.fromEntries(CHECKS.map(([id]) => [id, 0]));
  const notes = [];
  if (!existsSync(file)) return { skill: folder, score: 0, got, notes: ['no SKILL.md'] };
  const text = readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  let data = null;
  try { data = match ? parse(match[1]) : null; } catch { data = null; }
  const body = match ? text.slice(match[0].length) : text;
  const description = data && typeof data.description === 'string' ? data.description : '';

  if (data && data.name === folder && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(folder) && description.length >= 40) got.installs = 15;
  else notes.push('frontmatter does not parse, or name differs from the folder, or the description is missing');

  const count = words(description);
  if (description && count <= 60) got.short = 10; else notes.push(`description is ${count} words; the limit is 60`);
  if (/\bUse (it )?(when|before|after|for|on|to|at)\b/i.test(description)) got.trigger = 10; else notes.push('description does not say when to use it');
  if (/\bNot for\b/i.test(description)) got.boundary = 10; else notes.push('description does not say what it is not for');
  if (text.length <= 10_000) got.body = 10; else notes.push(`SKILL.md is ${text.length} characters; the limit is 10,000`);

  const missing = new Set();
  for (const [, path] of text.matchAll(/\bskills\/(fe-[a-z-]+\/[\w./-]+\.[a-z]{2,5})\b/g)) {
    if (!existsSync(join(skillsDir, path))) missing.add(`skills/${path}`);
  }
  for (const [, path] of text.matchAll(/(?:^|[\s`(])((?:scripts|templates|references|examples)\/[\w./-]+\.[a-z]{2,5})\b/g)) {
    // A skill with no folder of that name is pointing at a file in the user's project, not in the skill.
    if (!existsSync(join(dir, path.split('/')[0]))) continue;
    if (!existsSync(join(dir, path))) missing.add(path);
  }
  if (!missing.size) got.paths = 15; else notes.push(`named but missing: ${[...missing].join(', ')}`);

  const broken = walk(dir).filter(path => path.endsWith('.mjs'))
    .filter(path => spawnSync(process.execPath, ['--check', path]).status !== 0);
  if (!broken.length) got.scripts = 10; else notes.push(`does not parse: ${broken.map(path => path.slice(dir.length + 1)).join(', ')}`);

  if (new RegExp(`\\b${folder}\\b`).test(routing)) got.routed = 10; else notes.push('neither AGENTS.md nor fe-master names it');
  if (/^#+ *(Output|What you write|Deliver|Report)/im.test(body) || /design\/[\w<>./-]+/.test(body)) got.output = 5;
  else notes.push('does not say what it writes');

  const judges = (body.match(/\b(scores?|scored|verdict|rubric)\b/gi) || []).length >= 3;
  if (!judges || folder === 'fe-second-eye' || /\bfe-second-eye\b/.test(body)) got.independent = 5;
  else notes.push('scores work but does not send the score to fe-second-eye');

  const score = Object.values(got).reduce((sum, value) => sum + value, 0);
  return { skill: folder, score, got, notes };
}

export function gradeAll({ skillsDir = join(root, 'skills') } = {}) {
  const folders = readdirSync(skillsDir).filter(name => statSync(join(skillsDir, name)).isDirectory()).sort();
  const master = join(skillsDir, 'fe-master', 'SKILL.md');
  const agents = join(root, 'AGENTS.md');
  const base = (existsSync(agents) ? readFileSync(agents, 'utf8') : '');
  const masterBody = existsSync(master) ? readFileSync(master, 'utf8').replace(/^---[\s\S]*?---/, '') : '';
  const rows = folders.map(folder => gradeSkill(folder, { skillsDir, routing: folder === 'fe-master' ? base : `${base}\n${masterBody}` }));
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  const descriptionWords = folders.reduce((sum, folder) => {
    const text = readFileSync(join(skillsDir, folder, 'SKILL.md'), 'utf8');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    try { return sum + words(parse(match[1]).description); } catch { return sum; }
  }, 0);
  return { rows, mean: Math.round((total / rows.length) * 10) / 10, lowest: Math.min(...rows.map(row => row.score)), descriptionWords };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = process.argv.includes('--skill') ? process.argv[process.argv.indexOf('--skill') + 1] : null;
  const result = gradeAll();
  const rows = only ? result.rows.filter(row => row.skill === only) : result.rows;
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...result, rows }, null, 2));
  else {
    for (const row of rows) {
      console.log(`${String(row.score).padStart(3)}  ${row.skill}`);
      for (const note of row.notes) console.log(`       - ${note}`);
    }
    console.log(`\nGRADE ${result.lowest}/100 lowest, ${result.mean}/100 average, ${result.rows.length} skills, ${result.descriptionWords} description words loaded in every chat`);
    console.log('This grades packaging. It does not grade the design a skill produces.');
  }
  process.exit(process.argv.includes('--strict') && result.lowest < 100 ? 1 : 0);
}

#!/usr/bin/env node
// Usage: node scripts/grade-skills.mjs [--strict] [--json] [--skill fe-x] [--dir <a skills folder>]
// --dir grades any project's skills folder (for example an app's .cursor/skills) and writes nothing.
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

export function gradeSkill(folder, { skillsDir = join(root, 'skills'), routing = '', outside = false } = {}) {
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
  for (const [, path] of text.matchAll(/\bskills\/([a-z0-9]+(?:-[a-z0-9]+)*\/[\w./-]+\.[a-z]{2,5})\b/g)) {
    // Only a skill that is installed here can be checked; a path into somebody else's skill pack is not ours to fail.
    if (!existsSync(join(skillsDir, path.split('/')[0]))) continue;
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

  if (new RegExp(`\\b${folder}\\b`).test(routing)) got.routed = 10;
  else notes.push(outside ? 'no AGENTS.md, rule or other skill names it; it loads only when its description matches' : 'neither AGENTS.md nor fe-master names it');
  if (/^#+ *(Output|What you write|Deliver|Report)/im.test(body) || /design\/[\w<>./-]+/.test(body)) got.output = 5;
  else notes.push('does not say what it writes');

  const judges = (body.match(/\b(scores?|scored|verdict|rubric)\b/gi) || []).length >= 3;
  // In another project the second eye may go by another name, as long as the scorer is not the builder.
  const elsewhere = outside && /\b(second[- ]eye|another model|different model|independent (judge|review|reviewer)|a person (scores|judges|reviews))\b/i.test(body);
  if (!judges || folder === 'fe-second-eye' || /\bfe-second-eye\b/.test(body) || elsewhere) got.independent = 5;
  else notes.push(outside ? 'scores work and nothing says someone other than the builder checks the score' : 'scores work but does not send the score to fe-second-eye');

  const score = Object.values(got).reduce((sum, value) => sum + value, 0);
  return { skill: folder, score, got, notes };
}

const frontmatterless = text => text.replace(/^---[\s\S]*?---/, '');
const readIf = path => (existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : '');

// For a folder outside this repo: what could send an agent to a skill there. The project's AGENTS.md and
// Cursor rules, found by walking up to the repository root, plus the bodies of the other skills beside it.
export function projectRouting(skillsDir) {
  let dir = resolve(skillsDir); const parts = [];
  for (let depth = 0; depth < 6; depth++) {
    for (const name of ['AGENTS.md', 'CLAUDE.md', '.cursorrules']) parts.push(readIf(join(dir, name)));
    const rules = join(dir, '.cursor', 'rules');
    if (existsSync(rules) && statSync(rules).isDirectory()) parts.push(...walk(rules).filter(path => /\.(mdc|md)$/.test(path)).map(readIf));
    if (existsSync(join(dir, '.git')) || dirname(dir) === dir) break;
    dir = dirname(dir);
  }
  return parts.join('\n');
}

export function gradeAll({ skillsDir = join(root, 'skills'), outside = false } = {}) {
  const folders = readdirSync(skillsDir).filter(name => statSync(join(skillsDir, name)).isDirectory() && existsSync(join(skillsDir, name, 'SKILL.md'))).sort();
  const bodies = Object.fromEntries(folders.map(folder => [folder, frontmatterless(readFileSync(join(skillsDir, folder, 'SKILL.md'), 'utf8'))]));
  const base = outside ? projectRouting(skillsDir) : readIf(join(root, 'AGENTS.md'));
  const routingFor = folder => {
    if (outside) return `${base}\n${folders.filter(other => other !== folder).map(other => bodies[other]).join('\n')}`;
    return folder === 'fe-master' ? base : `${base}\n${bodies['fe-master'] || ''}`;
  };
  const rows = folders.map(folder => gradeSkill(folder, { skillsDir, routing: routingFor(folder), outside }));
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  const descriptionWords = folders.reduce((sum, folder) => {
    const text = readFileSync(join(skillsDir, folder, 'SKILL.md'), 'utf8');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    try { return sum + words(parse(match[1]).description); } catch { return sum; }
  }, 0);
  if (!rows.length) return { rows, mean: 0, lowest: 0, descriptionWords: 0 };
  return { rows, mean: Math.round((total / rows.length) * 10) / 10, lowest: Math.min(...rows.map(row => row.score)), descriptionWords };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = process.argv.includes('--skill') ? process.argv[process.argv.indexOf('--skill') + 1] : null;
  const dirFlag = process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir') + 1] : null;
  if (dirFlag && !(existsSync(dirFlag) && statSync(dirFlag).isDirectory())) { console.error(`Not a folder: ${dirFlag}`); process.exit(2); }
  const result = dirFlag ? gradeAll({ skillsDir: resolve(dirFlag), outside: true }) : gradeAll();
  if (!result.rows.length) { console.error(`No skills found in ${dirFlag || 'skills/'}: a skill is a folder with a SKILL.md.`); process.exit(2); }
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

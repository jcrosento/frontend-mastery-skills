import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHECKS, gradeAll, gradeSkill, words } from '../scripts/grade-skills.mjs';

test('grade: the checks add up to 100', () => {
  assert.equal(CHECKS.reduce((sum, [, points]) => sum + points, 0), 100);
});

test('grade: every skill in this repo scores 100', () => {
  const result = gradeAll();
  const short = result.rows.filter(row => row.score < 100).map(row => `${row.skill} ${row.score}: ${row.notes.join('; ')}`);
  assert.deepEqual(short, []);
  assert.ok(result.descriptionWords <= result.rows.length * 60, 'descriptions are loaded into every chat; keep them short');
});

test('grade: a badly packaged skill does not score 100, and the notes say why', () => {
  const skillsDir = mkdtempSync(join(tmpdir(), 'fe-grade-'));
  mkdirSync(join(skillsDir, 'fe-bad', 'scripts'), { recursive: true });
  writeFileSync(join(skillsDir, 'fe-bad', 'scripts', 'broken.mjs'), 'const = ;\n');
  writeFileSync(join(skillsDir, 'fe-bad', 'SKILL.md'), `---\nname: fe-bad\ndescription: "${'Scores a page out of ten and gives a verdict on the design. '.repeat(8)}"\n---\n# Bad\nScore the page. Give a verdict against the rubric. Run \`scripts/missing.mjs\`.\n`);
  const row = gradeSkill('fe-bad', { skillsDir, routing: '' });
  assert.ok(row.score <= 40, `expected a low grade, got ${row.score}`);
  const notes = row.notes.join(' | ');
  for (const part of [/words/, /when to use/, /missing/, /fe-second-eye/]) assert.match(notes, part);
  assert.equal(words('one two  three'), 3);
});

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

test('grade: --dir grades another project\'s skills folder by that project\'s own rules', () => {
  const project = mkdtempSync(join(tmpdir(), 'fe-grade-dir-'));
  const skillsDir = join(project, '.cursor', 'skills');
  mkdirSync(join(project, '.git'));
  mkdirSync(join(project, '.cursor', 'rules'), { recursive: true });
  for (const name of ['pay-run', 'ease-gate', 'lonely']) mkdirSync(join(skillsDir, name), { recursive: true });
  mkdirSync(join(skillsDir, 'not-a-skill'));
  writeFileSync(join(project, '.cursor', 'rules', 'money.mdc'), 'For payroll work, load pay-run.\n');
  writeFileSync(join(skillsDir, 'pay-run', 'SKILL.md'), '---\nname: pay-run\ndescription: "Walks a payroll run from draft to release. Use when the user asks to run or check payroll. Not for one-off payments; use the payments screen."\n---\n# pay-run\nWrites design/reports/pay-run.md. After it, run ease-gate.\n');
  writeFileSync(join(skillsDir, 'ease-gate', 'SKILL.md'), '---\nname: ease-gate\ndescription: "Scores how easy a flow is, out of 100. Use when a flow changed. Not for visual polish."\n---\n# ease-gate\nScore the flow. Repeat until the score is 90. The verdict goes in design/reports/ease.md.\n');
  writeFileSync(join(skillsDir, 'lonely', 'SKILL.md'), '---\nname: lonely\ndescription: "Does a thing nobody points at. Use when asked. Not for anything else at all."\n---\n# lonely\nWrites design/reports/lonely.md.\n');

  const result = gradeAll({ skillsDir, outside: true });
  const row = name => result.rows.find(item => item.skill === name);
  assert.deepEqual(result.rows.map(item => item.skill), ['ease-gate', 'lonely', 'pay-run'], 'a folder with no SKILL.md is not a skill');
  assert.equal(row('pay-run').score, 100, row('pay-run').notes.join('; '));
  assert.equal(row('pay-run').got.routed, 10, 'a Cursor rule at the repository root routes to it');
  assert.equal(row('ease-gate').got.routed, 10, 'another skill beside it routes to it');
  assert.equal(row('ease-gate').got.independent, 0, 'a skill that scores its own work and loops to 90 is flagged');
  assert.match(row('ease-gate').notes.join(' '), /someone other than the builder/);
  assert.equal(row('lonely').got.routed, 0);

  writeFileSync(join(skillsDir, 'ease-gate', 'SKILL.md'), '---\nname: ease-gate\ndescription: "Scores how easy a flow is, out of 100. Use when a flow changed. Not for visual polish."\n---\n# ease-gate\nScore the flow. The score is checked by another model before it counts. The verdict goes in design/reports/ease.md.\n');
  assert.equal(gradeAll({ skillsDir, outside: true }).rows.find(item => item.skill === 'ease-gate').got.independent, 5);
});

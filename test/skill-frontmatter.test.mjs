import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const skillsDir = new URL('../skills/', import.meta.url).pathname;
const folders = readdirSync(skillsDir).filter(name => statSync(join(skillsDir, name)).isDirectory());

// The `skills` installer reads this block with a YAML parser and silently skips a skill it
// cannot parse. Seven skills were being dropped that way, so the block is parsed here too.
function frontmatter(folder) {
  const text = readFileSync(join(skillsDir, folder, 'SKILL.md'), 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, `${folder}: SKILL.md must start with a --- frontmatter block`);
  return parse(match[1]);
}

test('skills: every skill installs - frontmatter is valid YAML with a matching name and a usable description', () => {
  assert.equal(folders.length, 25);
  for (const folder of folders) {
    assert.ok(existsSync(join(skillsDir, folder, 'SKILL.md')), `${folder}: no SKILL.md`);
    let data;
    assert.doesNotThrow(() => { data = frontmatter(folder); }, `${folder}: frontmatter is not valid YAML (quote a description that contains ": ")`);
    assert.equal(data.name, folder, `${folder}: "name" must equal the folder name`);
    assert.match(data.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${folder}: name must be lowercase words joined by hyphens`);
    assert.equal(typeof data.description, 'string', `${folder}: description must be text`);
    assert.ok(data.description.length >= 40 && data.description.length <= 1024, `${folder}: description is ${data.description.length} characters; agents need 40 to 1024`);
  }
});

test('skills: a description with an unquoted colon is the failure this guards against', () => {
  assert.throws(() => parse('name: fe-x\ndescription: Use when: something happens'), /Nested mappings|implicit/i);
  assert.equal(parse('name: fe-x\ndescription: "Use when: something happens"').description, 'Use when: something happens');
});

test('skills: every script a skill tells the agent to run exists', () => {
  for (const folder of folders) {
    const text = readFileSync(join(skillsDir, folder, 'SKILL.md'), 'utf8');
    for (const [, path] of text.matchAll(/\b(?:skills\/)?(fe-[a-z-]+\/scripts\/[\w.-]+\.mjs)\b/g)) {
      assert.ok(existsSync(join(skillsDir, path)), `${folder}/SKILL.md names ${path}, which does not exist`);
    }
  }
});

#!/usr/bin/env node
// Runs `node --check` on every .mjs under skills/ and scripts/. The list is read from disk,
// so a new skill's scripts are covered the day they are added.
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.mjs') ? [path] : [];
  });
}

const files = [...walk(join(root, 'skills')), ...walk(join(root, 'scripts'))];
const bad = files.filter(file => spawnSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'inherit'] }).status !== 0);
console.log(`${files.length - bad.length}/${files.length} scripts parse`);
process.exit(bad.length ? 1 : 0);

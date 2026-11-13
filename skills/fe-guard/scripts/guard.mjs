#!/usr/bin/env node
// Fail a UI change that touches the backend.
//
//   node guard.mjs --base origin/main [--config design/guard.json] [--final]
//
// Compares the working tree (committed and uncommitted work, plus untracked files)
// with the merge base of --base. Reads only; never writes, stages, commits or pushes.
// Exit 0 = UI-only. Exit 1 = violation. Exit 2 = cannot run (bad config, not a repo).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, matchAny } from './guard-core.mjs';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

export function parseNameStatus(text) {
  const changes = [];
  const parts = text.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i][0];
    if (status === 'R' || status === 'C') { changes.push({ status, from: parts[i + 1], path: parts[i + 2] }); i += 2; }
    else { changes.push({ status, path: parts[i + 1] }); i += 1; }
  }
  return changes;
}

export function runGuard({ cwd = process.cwd(), base, configPath = 'design/guard.json', final = false } = {}) {
  if (!base) return { code: 2, lines: ['--base <ref> is required (the branch this change will merge into, for example origin/main)'] };
  const file = resolve(cwd, configPath);
  if (!existsSync(file)) return { code: 2, lines: [`guard config not found at ${configPath}; copy templates/guard.example.json and list this app's UI and frozen paths`] };
  let config;
  try { config = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { return { code: 2, lines: [`guard config is not valid JSON: ${error.message}`] }; }

  let mergeBase, changes, untracked, tracked;
  try {
    mergeBase = git(['merge-base', base, 'HEAD'], cwd).trim();
    changes = parseNameStatus(git(['diff', '--name-status', '-M', '-z', mergeBase], cwd));
    untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], cwd).split('\0').filter(Boolean);
    tracked = git(['ls-files', '-z'], cwd).split('\0').filter(Boolean);
  } catch (error) {
    return { code: 2, lines: [`git failed: ${String(error.stderr || error.message).trim()}`] };
  }
  for (const path of untracked) changes.push({ status: '?', path });

  const uiPaths = changes.map(c => c.path).filter(path => Array.isArray(config.ui) && matchAny(path, config.ui) && !(Array.isArray(config.frozen) && matchAny(path, config.frozen)));
  let diff = '';
  if (uiPaths.length) {
    const trackedUi = uiPaths.filter(path => !untracked.includes(path));
    if (trackedUi.length) diff += git(['diff', '-U0', '-M', mergeBase, '--', ...trackedUi], cwd);
    // Untracked files have no diff yet; every line in them counts as added.
    for (const path of uiPaths.filter(p => untracked.includes(p))) {
      const body = readFileSync(resolve(cwd, path), 'utf8');
      diff += `\ndiff --git a/${path} b/${path}\n+++ b/${path}\n@@\n` + body.split('\n').map(line => `+${line}`).join('\n');
    }
  }

  const result = evaluate({ changes, diff, trackedFiles: [...tracked, ...untracked], config, final });
  if (result.configProblems.length) return { code: 2, lines: ['guard config is invalid:', ...result.configProblems.map(p => `  - ${p}`)] };
  const lines = [`fe-guard: ${changes.length} changed path(s) against ${base} (${mergeBase.slice(0, 7)})${final ? ', final check' : ''}`];
  if (result.ok) {
    lines.push('PASS: UI-only. No frozen path, no path outside the UI folders, no change to network-facing lines.');
    return { code: 0, lines, result };
  }
  const titles = {
    frozen: 'Frozen paths changed',
    'outside-ui': 'Paths outside the UI folders changed',
    protected: 'Guard, lock or lock tests changed together with other files',
    'network-added': 'Network-facing lines added or altered',
    'network-removed': 'Network-facing lines removed or altered',
    'variant-leftover': 'Variant code still present'
  };
  for (const [rule, title] of Object.entries(titles)) {
    const group = result.violations.filter(v => v.rule === rule);
    if (!group.length) continue;
    lines.push(`\n${title} (${group.length}):`);
    for (const v of group) lines.push(`  - ${v.path}${rule.startsWith('network') ? `: ${v.detail}` : ''}`);
  }
  lines.push(`\nFAIL: ${result.violations.length} violation(s). Revert these, or move them to their own pull request that a person approves.`);
  return { code: 1, lines, result };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const outcome = runGuard({ base: arg('--base'), configPath: arg('--config') || 'design/guard.json', final: argv.includes('--final') });
  (outcome.code === 0 ? console.log : console.error)(outcome.lines.join('\n'));
  process.exit(outcome.code);
}

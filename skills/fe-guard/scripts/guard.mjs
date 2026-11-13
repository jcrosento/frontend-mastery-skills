#!/usr/bin/env node
// Fail a UI change that touches the backend.
//
//   node guard.mjs --base origin/main [--config design/guard.json] [--final]
//   node guard.mjs --audit [--config design/guard.json] [--names]      check the config itself, at setup
//
// Compares the working tree (committed and uncommitted work, plus untracked files)
// with the merge base of --base. Reads only; never writes, stages, commits or pushes.
// Exit 0 = UI-only. Exit 1 = violation. Exit 2 = cannot run (bad config, not a repo).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditConfig, dataNames, evaluate, matchAny, SOURCE_FILE } from './guard-core.mjs';

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

const MAX_SOURCE_BYTES = 1024 * 1024;
/** Tracked and untracked source files of the working tree, as [{ path, source }]. Reads only. */
export function readSources(cwd, paths) {
  const files = [];
  for (const path of paths) {
    if (!SOURCE_FILE.test(path) || /(^|\/)node_modules\//.test(path)) continue;
    const full = resolve(cwd, path);
    try { if (statSync(full).size <= MAX_SOURCE_BYTES) files.push({ path, source: readFileSync(full, 'utf8') }); } catch { /* deleted in the working tree */ }
  }
  return files;
}

function loadConfig(cwd, configPath) {
  const file = resolve(cwd, configPath);
  if (!existsSync(file)) return { error: `guard config not found at ${configPath}; copy templates/guard.example.json and list this app's UI and frozen paths` };
  try { return { config: JSON.parse(readFileSync(file, 'utf8')) }; } catch (error) { return { error: `guard config is not valid JSON: ${error.message}` }; }
}

/** Check the config against the code it protects. Exit 0 = no holes, 1 = holes, 2 = cannot run. */
export function runAudit({ cwd = process.cwd(), configPath = 'design/guard.json', listNames = false } = {}) {
  const { config, error } = loadConfig(cwd, configPath);
  if (error) return { code: 2, lines: [error] };
  let tracked;
  try { tracked = [...git(['ls-files', '-z'], cwd).split('\0'), ...git(['ls-files', '--others', '--exclude-standard', '-z'], cwd).split('\0')].filter(Boolean); }
  catch (failure) { return { code: 2, lines: [`git failed: ${String(failure.stderr || failure.message).trim()}`] }; }
  const result = auditConfig({ files: readSources(cwd, tracked), config, trackedFiles: tracked });
  if (result.configProblems.length) return { code: 2, lines: ['guard config is invalid:', ...result.configProblems.map(p => `  - ${p}`)] };
  const lines = [`fe-guard audit: ${configPath}`, `  the UI list covers ${result.uiFiles} file(s)`];
  const perFile = new Map();
  for (const n of result.names) perFile.set(n.file, [...(perFile.get(n.file) ?? []), n.name]);
  lines.push(`  data functions found in the code and watched automatically: ${new Set(result.names.map(n => n.name)).size} in ${perFile.size} file(s)`);
  for (const [file, names] of perFile) lines.push(`    - ${file}: ${listNames ? names.join(', ') : `${names.length} (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', ...' : ''})`}`);
  if (result.silenced.length) lines.push(`  switched off by network_ignore (${result.silenced.length}): ${result.silenced.join(', ')}`);
  if (result.review.length) {
    lines.push(`\nCHECK BY HAND: plain code inside the UI list (${result.review.length}). Each must change only how things look; otherwise take it out of "ui":`);
    for (const r of result.review) lines.push(`  - ${r.path}${r.flagged ? `   <- ${r.detail}; read this one first` : ''}`);
  }
  if (result.holes.length) {
    lines.push(`\nHOLES (${result.holes.length}):`);
    for (const h of result.holes) lines.push(`  - ${h.path} ${h.detail}`);
    lines.push('\nFAIL: fix the holes before any redesign relies on this guard.');
    return { code: 1, lines, result };
  }
  lines.push('\nPASS: no holes found. This does not replace reading the UI list once yourself.');
  return { code: 0, lines, result };
}

export function runGuard({ cwd = process.cwd(), base, configPath = 'design/guard.json', final = false } = {}) {
  if (!base) return { code: 2, lines: ['--base <ref> is required (the branch this change will merge into, for example origin/main)'] };
  const { config, error: configError } = loadConfig(cwd, configPath);
  if (configError) return { code: 2, lines: [configError] };

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

  // Data functions are read from the code as it was at the merge base, plus the working tree,
  // so a change cannot hide a function by renaming it in the same pull request.
  let derived = { names: [], patterns: [] };
  if (Array.isArray(config.ui) && Array.isArray(config.frozen) && config.derive_data_names !== false) {
    try {
      const now = readSources(cwd, [...tracked, ...untracked]);
      const changedSources = new Set(changes.flatMap(c => [c.path, c.from]).filter(p => p && SOURCE_FILE.test(p)));
      const before = [...changedSources].flatMap(path => { try { return [{ path, source: git(['show', `${mergeBase}:${path}`], cwd) }]; } catch { return []; } });
      const current = dataNames(now, config);
      const baseView = before.length ? dataNames([...now.filter(f => !changedSources.has(f.path)), ...before], config) : { names: [], patterns: [] };
      derived = { names: [...current.names, ...baseView.names], patterns: [...new Set([...current.patterns, ...baseView.patterns])] };
    } catch (failure) { return { code: 2, lines: [`could not read the source files to find data functions: ${String(failure.message).slice(0, 200)}`] }; }
  }

  const result = evaluate({ changes, diff, trackedFiles: [...tracked, ...untracked], config, final, derivedPatterns: derived.patterns });
  if (result.configProblems.length) return { code: 2, lines: ['guard config is invalid:', ...result.configProblems.map(p => `  - ${p}`)] };
  const lines = [`fe-guard: ${changes.length} changed path(s) against ${base} (${mergeBase.slice(0, 7)})${final ? ', final check' : ''}`];
  if (result.ok) {
    lines.push(`PASS: UI-only. No frozen path, no path outside the UI folders, no change to network-facing lines (${new Set(derived.names.map(n => n.name)).size} data function(s) found in the code and watched).`);
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
  const configPath = arg('--config') || 'design/guard.json';
  const outcome = argv.includes('--audit') ? runAudit({ configPath, listNames: argv.includes('--names') }) : runGuard({ base: arg('--base'), configPath, final: argv.includes('--final') });
  (outcome.code === 0 ? console.log : console.error)(outcome.lines.join('\n'));
  process.exit(outcome.code);
}

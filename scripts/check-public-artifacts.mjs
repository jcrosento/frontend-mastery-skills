#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { assertNoGeneratedScanArtifacts, generatedScanPaths } from './public-artifact-policy.mjs';

const runGit = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split(/\r?\n/).filter(Boolean);
const hasRef = ref => {
  try { execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { stdio: 'ignore' }); return true; }
  catch { return false; }
};
const base = process.env.FE_ARTIFACT_BASE || (process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : process.env.GITHUB_EVENT_NAME === 'push'
    ? (hasRef('HEAD^') ? 'HEAD^' : null)
    : (hasRef('origin/main') ? 'origin/main' : (hasRef('HEAD^') ? 'HEAD^' : null)));
const changed = new Set();
if (base && base !== 'HEAD') {
  try { runGit(['diff', '--name-only', '--diff-filter=ACMRT', `${base}...HEAD`]).forEach(path => changed.add(path)); }
  catch { console.error('Public artifact policy could not determine the comparison base.'); process.exit(2); }
}
for (const args of [
  ['diff', '--name-only', '--diff-filter=ACMRT', 'HEAD'],
  ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', 'HEAD'],
  ['ls-files', '--others', '--exclude-standard']
]) {
  try { runGit(args).forEach(path => changed.add(path)); }
  catch { console.error('Public artifact policy could not inspect the worktree.'); process.exit(2); }
}
try {
  assertNoGeneratedScanArtifacts([...changed]);
  console.log(`Public artifact policy passed (${changed.size} changed path(s); generated scans excluded).`);
} catch (error) {
  const count = generatedScanPaths([...changed]).length;
  console.error(`Public artifact policy failed: ${count} generated scan path(s) changed; paths are deliberately not printed.`);
  process.exit(1);
}

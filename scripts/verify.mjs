#!/usr/bin/env node
import { spawnBounded } from './run-bounded.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
const npm = npmCli ? [process.execPath, npmCli] : ['npm'];
const steps = [
  { name: 'syntax and scanner utility selftests', command: npm[0], args: [...npm.slice(1), 'run', 'check'], timeoutMs: 120_000 },
  { name: 'public generated-artifact policy', command: process.execPath, args: ['scripts/check-public-artifacts.mjs'], timeoutMs: 20_000 },
  { name: 'sanitized evidence fixture validation', command: process.execPath, args: ['scripts/validate-evidence.mjs', 'test/fixtures/evidence/improved-comparison.json'], timeoutMs: 20_000 },
  { name: 'sanitized regression fixture validation', command: process.execPath, args: ['scripts/validate-evidence.mjs', 'test/fixtures/evidence/regressed-comparison.json'], timeoutMs: 20_000 },
  { name: 'unit, browser and scanner-to-policy integration tests', command: npm[0], args: [...npm.slice(1), 'test'], timeoutMs: 360_000 }
];

for (const step of steps) {
  console.log(`\nVERIFY: ${step.name}`);
  const result = await spawnBounded(step.command, step.args, { cwd: root, timeoutMs: step.timeoutMs });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.timedOut) {
    console.error(`VERIFY FAILED: ${step.name} exceeded ${step.timeoutMs}ms and was terminated.`);
    process.exit(124);
  }
  if (result.code !== 0) {
    console.error(`VERIFY FAILED: ${step.name} exited ${result.code ?? 'without a status'}.`);
    process.exit(result.code && result.code > 0 ? result.code : 1);
  }
  console.log(`VERIFY PASSED: ${step.name}`);
}
console.log('\nVERIFY PASSED: all public repository gates are green.');

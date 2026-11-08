#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEvidence } from './evidence-validation.mjs';
import { repeatedRegressions } from './regression-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const thresholdPercent = Number(option('--threshold-percent', '10'));
const consecutiveRuns = Number(option('--consecutive-runs', '2'));
const optionValues = new Set(['--threshold-percent', '--consecutive-runs']);
const files = args.filter((arg, index) => !arg.startsWith('--') && !optionValues.has(args[index - 1]));
if (!files.length || !Number.isFinite(thresholdPercent) || thresholdPercent < 0 || !Number.isInteger(consecutiveRuns) || consecutiveRuns < 1) {
  console.error('Usage: node scripts/evaluate-policy.mjs [--threshold-percent N] [--consecutive-runs N] <comparison.json> <comparison.json> ...');
  process.exit(2);
}

try {
  const schema = JSON.parse(await readFile(resolve(root, 'schemas/evidence-comparison.schema.json'), 'utf8'));
  const documents = [];
  const comparisonIds = new Set();
  const scanIds = new Set();
  for (const file of files) {
    const document = JSON.parse(await readFile(resolve(process.cwd(), file), 'utf8'));
    const errors = validateEvidence(document, schema, root);
    if (errors.length) throw new Error(`evidence invalid for ${file}: ${errors[0]}`);
    if (comparisonIds.has(document.runId)) throw new Error('duplicate comparison runId; policy history must contain independent attempts');
    comparisonIds.add(document.runId);
    for (const id of [document.baseline.id, document.candidate.id]) {
      if (scanIds.has(id)) throw new Error('duplicate baseline/candidate scan id; policy history must contain independent attempts');
      scanIds.add(id);
    }
    documents.push(document);
  }
  const regressions = repeatedRegressions(documents, { thresholdPercent, consecutiveRuns });
  if (regressions.length) {
    console.log(`Policy ESCALATION: ${regressions.join(', ')} regressed by more than ${thresholdPercent}% in ${consecutiveRuns} consecutive comparisons.`);
    process.exit(2);
  }
  console.log(`Policy PASS: no repeated regression above ${thresholdPercent}% across ${documents.length} validated comparison(s).`);
} catch (error) {
  console.error(`Policy evaluation failed: ${error.message}`);
  process.exit(1);
}

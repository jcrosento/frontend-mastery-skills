#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateEvidence } from "./evidence-validation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file || process.argv.length > 3) {
  console.error("Usage: node scripts/validate-evidence.mjs <comparison.json>");
  process.exit(2);
}
try {
  const [schema, value] = await Promise.all([
    readFile(resolve(root, "schemas/evidence-comparison.schema.json"), "utf8").then(JSON.parse),
    readFile(resolve(process.cwd(), file), "utf8").then(JSON.parse)
  ]);
  const errors = validateEvidence(value, schema, root);
  if (errors.length) {
    console.error(`Evidence invalid (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Evidence valid: ${file}`);
} catch (error) {
  console.error(`Could not validate evidence: ${error.message}`);
  process.exit(1);
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { repeatedRegressions } from "../scripts/regression-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const improved = JSON.parse(readFileSync(resolve(root, "test/fixtures/evidence/improved-comparison.json"), "utf8"));
const regressed = JSON.parse(readFileSync(resolve(root, "test/fixtures/evidence/regressed-comparison.json"), "utf8"));

test("a single >10% regression is flagged but does not satisfy the two-run escalation rule", () => {
  assert.deepEqual(repeatedRegressions([regressed]), []);
});

test("two consecutive >10% degradations trigger an escalation signal", () => {
  assert.deepEqual(repeatedRegressions([regressed, regressed]), ["lcp_ms"]);
});

test("an intervening improvement resets the consecutive regression streak", () => {
  assert.deepEqual(repeatedRegressions([regressed, improved]), []);
});

test("unknown, missing, neutral, and exactly-threshold deltas never escalate", () => {
  const exactlyTen = structuredClone(regressed);
  exactlyTen.metrics[0].before.value = 100;
  exactlyTen.metrics[0].after.value = 110;
  exactlyTen.metrics[0].delta.percent = 10;
  const unknown = structuredClone(regressed);
  unknown.metrics[0].after.status = "unavailable";
  const missing = { metrics: [] };
  assert.deepEqual(repeatedRegressions([exactlyTen, exactlyTen]), []);
  assert.deepEqual(repeatedRegressions([unknown, unknown]), []);
  assert.deepEqual(repeatedRegressions([regressed, missing]), []);
});

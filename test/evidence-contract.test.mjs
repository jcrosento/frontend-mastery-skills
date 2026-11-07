import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { validateAgainstSchema } from "../scripts/contract-validator.mjs";

const root = resolve(import.meta.dirname, "..");
const schema = JSON.parse(readFileSync(resolve(root, "schemas/evidence-comparison.schema.json"), "utf8"));
const improvedPath = resolve(root, "test/fixtures/evidence/improved-comparison.json");
const regressedPath = resolve(root, "test/fixtures/evidence/regressed-comparison.json");
const improved = JSON.parse(readFileSync(improvedPath, "utf8"));
const regressed = JSON.parse(readFileSync(regressedPath, "utf8"));

function checkSchema(document) {
  // Resolve local #/$defs references without an external dependency.
  return validateAgainstSchema(document, schema, "$", [], schema);
}

function getPointer(document, pointer) {
  return pointer.split("/").slice(1).map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, key) => value?.[key], document);
}

function sourceValue(reference) {
  const absolute = resolve(root, reference.file);
  assert.ok(absolute.startsWith(resolve(root, "test/fixtures") + "/"), `evidence must stay in fixtures: ${reference.file}`);
  assert.ok(existsSync(absolute), `missing evidence source ${reference.file}`);
  const value = getPointer(JSON.parse(readFileSync(absolute, "utf8")), reference.pointer);
  if (reference.transform === "count") {
    assert.ok(Array.isArray(value), `count transform requires an array at ${reference.file}${reference.pointer}`);
    return value.length;
  }
  return value;
}

function roundedPercent(before, after) {
  return before === 0 ? null : Math.round(((after - before) / Math.abs(before)) * 10_000) / 100;
}

function verdict(direction, before, after) {
  if (before === null || after === null) return "unknown";
  if (before === after || direction === "neutral") return "unchanged";
  const improved = direction === "lower-is-better" ? after < before : after > before;
  return improved ? "improved" : "regressed";
}

for (const [label, fixture] of [["improved", improved], ["regressed", regressed]]) {
  test(`${label} seeded comparison obeys the evidence schema`, () => {
    assert.deepEqual(checkSchema(fixture), []);
  });
}

test("before/after deltas are recomputable from cited source artifacts", () => {
  for (const document of [improved, regressed]) for (const metric of document.metrics) {
    const before = metric.before.value;
    const after = metric.after.value;
    assert.equal(metric.before.status, "measured");
    assert.equal(metric.after.status, "measured");
    assert.equal(sourceValue(metric.evidence.before[0]), before, `${metric.key} baseline evidence`);
    assert.equal(sourceValue(metric.evidence.after[0]), after, `${metric.key} candidate evidence`);
    assert.ok(Math.abs(metric.delta.absolute - (after - before)) < 1e-9, `${metric.key} absolute delta`);
    assert.equal(metric.delta.percent, roundedPercent(before, after), `${metric.key} percentage delta`);
    assert.equal(metric.delta.verdict, verdict(metric.direction, before, after), `${metric.key} direction verdict`);
  }
  const regression = regressed.metrics[0];
  assert.equal(sourceValue(regression.evidence.before[0]), regression.before.value);
  assert.equal(sourceValue(regression.evidence.after[0]), regression.after.value);
  assert.equal(regression.delta.absolute, regression.after.value - regression.before.value);
  assert.equal(regression.delta.percent, roundedPercent(regression.before.value, regression.after.value));
  assert.equal(regression.delta.verdict, verdict(regression.direction, regression.before.value, regression.after.value));
});

test("fixture coverage exposes skipped live device runs instead of implying they ran", () => {
  for (const document of [improved, regressed]) {
    const { plannedProfiles, completedProfiles, skippedProfiles, checks } = document.coverage;
    const accounted = new Set([...completedProfiles, ...skippedProfiles.map(item => item.profile)]);
    assert.deepEqual([...accounted].sort(), [...plannedProfiles].sort());
    assert.equal(checks.passed + checks.failed + checks.skipped, checks.planned);
    for (const item of skippedProfiles) assert.ok(item.reason.trim().length >= 8);
  }
  assert.equal(improved.coverage.completedProfiles.length, 0);
  assert.equal(improved.coverage.skippedProfiles.length, 2);
});

test("fixture evidence is synthetic and contains no secrets or personal data", () => {
  for (const document of [improved, regressed]) {
    assert.deepEqual(document.privacy, {
      sourceClass: "synthetic", containsPersonalData: false, containsSecrets: false, sanitized: true
    });
    const serialized = JSON.stringify(document);
    assert.doesNotMatch(serialized, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    assert.doesNotMatch(serialized, /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/i);
  }
});

test("validator rejects a falsely marked private or unsupported evidence record", () => {
  const unsafe = structuredClone(improved);
  unsafe.privacy.containsSecrets = true;
  unsafe.metrics[0].delta.percent = 999;
  assert.ok(checkSchema(unsafe).some(error => error.includes("containsSecrets")));
  assert.notEqual(unsafe.metrics[0].delta.percent, roundedPercent(3200, 2200));
});

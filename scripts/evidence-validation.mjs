import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { validateAgainstSchema } from "./contract-validator.mjs";

function pointerValue(document, pointer) {
  if (!pointer.startsWith("/")) throw new Error(`invalid JSON pointer: ${pointer}`);
  return pointer.slice(1).split("/")
    .map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value?.[part], document);
}

function evidencePath(root, ref) {
  if (isAbsolute(ref.file)) throw new Error(`absolute evidence path is forbidden: ${ref.file}`);
  const rootReal = realpathSync(root);
  const absolute = resolve(rootReal, ref.file);
  const rel = relative(rootReal, absolute);
  if (rel.startsWith(`..${sep}`) || rel === "..") throw new Error(`evidence path escapes repository: ${ref.file}`);
  if (!(rel.startsWith(`test${sep}fixtures${sep}`) || rel.startsWith(`design${sep}reports${sep}`))) {
    throw new Error(`evidence must be under test/fixtures or design/reports: ${ref.file}`);
  }
  if (!existsSync(absolute)) throw new Error(`missing evidence source: ${ref.file}`);
  const targetReal = realpathSync(absolute);
  const targetRel = relative(rootReal, targetReal);
  if (targetRel.startsWith(`..${sep}`) || targetRel === "..") throw new Error(`evidence symlink escapes repository: ${ref.file}`);
  if (!(targetRel.startsWith(`test${sep}fixtures${sep}`) || targetRel.startsWith(`design${sep}reports${sep}`))) {
    throw new Error(`evidence symlink leaves allowed directories: ${ref.file}`);
  }
  return targetReal;
}

function readEvidence(root, ref) {
  const file = evidencePath(root, ref);
  let document;
  try { document = JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`cannot parse evidence ${ref.file}: ${error.message}`); }
  const value = pointerValue(document, ref.pointer);
  if (ref.transform === "count") {
    if (!Array.isArray(value)) throw new Error(`count transform requires an array: ${ref.file}${ref.pointer}`);
    return value.length;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`evidence pointer must resolve to a finite number: ${ref.file}${ref.pointer}`);
  }
  return value;
}

export function aggregate(values, method) {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error("aggregation needs finite numeric evidence");
  if (method === "single") {
    if (values.length !== 1) throw new Error(`single aggregation requires exactly one source, got ${values.length}`);
    return values[0];
  }
  if (method === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (method === "mean") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (method === "min") return Math.min(...values);
  if (method === "max") return Math.max(...values);
  if (method === "median") {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  throw new Error(`unsupported aggregation: ${method}`);
}

function roundedPercent(before, after) {
  return before === 0 ? null : Math.round(((after - before) / Math.abs(before)) * 10_000) / 100;
}

function expectedVerdict(direction, before, after) {
  if (before === null || after === null) return "unknown";
  if (before === after || direction === "neutral") return "unchanged";
  const improved = direction === "lower-is-better" ? after < before : after > before;
  return improved ? "improved" : "regressed";
}

export function validateEvidence(document, schema, root) {
  const errors = validateAgainstSchema(document, schema, "$", [], schema);
  if (errors.length) return errors;
  const report = (message, path) => errors.push(`${path}: ${message}`);

  const { plannedProfiles, completedProfiles, skippedProfiles, checks } = document.coverage;
  const accounted = [...completedProfiles, ...skippedProfiles.map(item => item.profile)];
  if (new Set(accounted).size !== accounted.length) report("a device profile is accounted more than once", "$.coverage");
  if (plannedProfiles.length !== accounted.length || plannedProfiles.some(profile => !accounted.includes(profile))) {
    report("every planned profile must be completed or have an explicit skip", "$.coverage");
  }
  if (checks.planned !== checks.passed + checks.failed + checks.skipped) {
    report("planned checks must equal passed + failed + skipped", "$.coverage.checks");
  }

  for (const [index, metric] of document.metrics.entries()) {
    const path = `$.metrics[${index}]`;
    for (const side of ["before", "after"]) {
      const measurement = metric[side];
      if (measurement.status !== "measured") {
        if (measurement.value !== null) report(`${side} non-measured value must be null`, `${path}.${side}`);
        continue;
      }
      if (typeof measurement.value !== "number" || !Number.isFinite(measurement.value)) {
        report(`${side} measured value must be finite`, `${path}.${side}`);
        continue;
      }
      try {
        const cited = metric.evidence[side].map(ref => readEvidence(root, ref));
        const recomputed = aggregate(cited, metric.aggregation);
        if (Math.abs(recomputed - measurement.value) > 1e-9) {
          report(`${side} value ${measurement.value} does not match ${metric.aggregation} evidence (${recomputed})`, `${path}.${side}`);
        }
      } catch (error) { report(error.message, `${path}.evidence.${side}`); }
    }
    const before = metric.before.status === "measured" ? metric.before.value : null;
    const after = metric.after.status === "measured" ? metric.after.value : null;
    const absolute = before === null || after === null ? null : after - before;
    const percent = before === null || after === null ? null : roundedPercent(before, after);
    const verdict = expectedVerdict(metric.direction, before, after);
    const matches = (actual, expected) => actual === expected ||
      (typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) <= 1e-9);
    if (!matches(metric.delta.absolute, absolute)) report(`absolute delta must be ${absolute}`, `${path}.delta.absolute`);
    if (!matches(metric.delta.percent, percent)) report(`percentage delta must be ${percent}`, `${path}.delta.percent`);
    if (metric.delta.verdict !== verdict) report(`verdict must be ${verdict}`, `${path}.delta.verdict`);
  }
  return errors;
}

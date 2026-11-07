// Identify metrics that regressed by more than the threshold in consecutive comparisons.
// This is a release/escalation signal; it does not authorize automatic site changes.
export function repeatedRegressions(history, { thresholdPercent = 10, consecutiveRuns = 2 } = {}) {
  if (!Array.isArray(history)) throw new TypeError("history must be an array of comparison records");
  if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0) throw new RangeError("thresholdPercent must be non-negative");
  if (!Number.isInteger(consecutiveRuns) || consecutiveRuns < 1) throw new RangeError("consecutiveRuns must be a positive integer");
  if (history.length < consecutiveRuns) return [];

  const tail = history.slice(-consecutiveRuns);
  const candidateKeys = new Set(tail.flatMap(run => Array.isArray(run?.metrics) ? run.metrics.map(metric => metric.key) : []));
  return [...candidateKeys].filter(key => tail.every(run => {
    const metric = run?.metrics?.find(entry => entry.key === key);
    const before = metric?.before;
    const after = metric?.after;
    if (!metric || before?.status !== "measured" || after?.status !== "measured") return false;
    if (!Number.isFinite(before.value) || !Number.isFinite(after.value) || before.value === 0) return false;
    const worseningPercent = metric.direction === "lower-is-better"
      ? ((after.value - before.value) / Math.abs(before.value)) * 100
      : metric.direction === "higher-is-better"
        ? ((before.value - after.value) / Math.abs(before.value)) * 100
        : Number.NEGATIVE_INFINITY;
    return worseningPercent > thresholdPercent;
  })).sort();
}

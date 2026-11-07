# Quality-gate fixtures

Run the dependency-free checks from the repository root:

```sh
node --test
node scripts/validate-evidence.mjs test/fixtures/evidence/improved-comparison.json
```

`schemas/evidence-comparison.schema.json` is the evidence contract for staged before/after reviews. Each reported metric includes baseline and candidate values, the direction of improvement, a recomputable delta, and JSON-pointer references to source artifacts. Coverage separates completed work from explicit skips; limitations prevent a fixture or partial scan from being presented as a live result. The lightweight validator supports the schema keywords currently used by this contract; if the schema grows, use a standards-compliant JSON Schema validator rather than silently widening the helper. `scripts/regression-policy.mjs` signals only when a metric is more than 10% worse in two consecutive comparisons; it never changes a site or merges a change.

The fixture IDs, site alias, measurements, and URL under `test/fixtures/scans/` are synthetic (`example.invalid`). They exercise metric reconciliation and regression behavior only. They are not a Seatours/Yohak audit, a live browser test, a visual comparison, or a conversion result. Never add screenshots, traces, booking/customer data, API keys, or raw analytics exports to these fixtures.

# Quality-gate fixtures

Run the dependency-free checks from the repository root:

```sh
node --test
node scripts/validate-evidence.mjs test/fixtures/evidence/improved-comparison.json
```

`schemas/evidence-comparison.schema.json` is the evidence contract for staged before/after reviews. Each metric records its aggregation method (`single`, `median`, `mean`, `min`, `max`, or `sum`), recomputable deltas and JSON-pointer citations. `scripts/validate-evidence.mjs` checks the schema, safe in-repository evidence paths, source values, aggregation, delta math, verdicts and explicit device/check coverage. Coverage separates completed work from explicit skips; limitations prevent a fixture or partial scan from being presented as a live result. The lightweight schema validator supports only the keywords used by this contract; if it grows, replace it with a standards-compliant JSON Schema validator rather than silently widening the helper. `scripts/regression-policy.mjs` signals only when a metric is more than 10% worse in two consecutive comparisons; it never changes a site or merges a change.

The fixture IDs, site alias, measurements and URL under `test/fixtures/scans/` are synthetic (`example.invalid`). Three seeded LCP captures exercise median aggregation; the Playwright test serves a local-only consent overlay, blocked CTA and unstable animation from `test/fixtures/pages/`. These fixtures verify scanner behavior, not a Seatours/Yohak audit, real-device coverage, visual design quality, or conversion result. The browser test reports failed hover probes as unknown rather than success. Never add screenshots, traces, booking/customer data, API keys, or raw analytics exports to these fixtures.

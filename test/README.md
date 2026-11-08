# Quality gates and fixtures

Run the repository's complete public verification sequence from the repository root:

```sh
npm run verify
```

`verify` runs scanner syntax and utility self-tests, a public generated-artifact diff gate, validation of the committed synthetic evidence examples, then the complete `node --test` suite. The suite includes schema and semantic evidence checks, regression policy cases, redaction assertions, an async timeout/kill test, actual Playwright scans against seeded local pages, and an end-to-end scanner-output → evidence validation → independent comparison → policy exit-status test. GitHub Actions uses this same entrypoint after installing locked dependencies and Chromium.

`schemas/evidence-comparison.schema.json` is the contract for staged before/after reviews. Each metric records an aggregation method, recomputable deltas, JSON-pointer evidence citations and explicit device/check coverage. `scripts/validate-evidence.mjs` checks the schema, safe in-repository evidence paths, source values, aggregation, delta math, verdicts and coverage. `scripts/evaluate-policy.mjs` validates each comparison before applying the consecutive-regression policy; it rejects duplicate comparison/scan IDs and exits 2 when a repeated threshold regression requires escalation. It never changes a site or merges a change.

Local fixture scanning must pass `--allow-loopback-fixture`; without that exact opt-in the scanner rejects loopback before making a request. The browser request guard separately blocks non-GET/HEAD methods and private-network destinations, including redirects and subresources. The seeded pipeline verifies that a POST counter remains zero. `design/reports/scan/` is ignored for new output, and the CI/worktree policy refuses any changed paths in that directory. Existing tracked scan history is left untouched by this change; review its historical contents separately before any cleanup.

The fixture IDs, site alias and measurements under `test/fixtures/` are synthetic. These checks verify behavior on controlled local pages, not a Seatours/Yohak production audit, real-device coverage, visual design quality or conversion outcome. Browser hover timeouts remain unknown rather than passing. Never add screenshots, traces, booking/customer data, API keys or raw analytics exports to fixtures.

The lightweight schema validator supports only the keywords used by this contract. If the contract grows, replace it with a standards-compliant JSON Schema validator rather than silently widening the helper.

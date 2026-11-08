# Worked example: synthetic expedition-booking website audit

**This is a fully synthetic teaching fixture.** Every score, count, observation, and target below is invented for demonstration. It is not based on any real company, website, analytics account, Search Console property, or customer data. Reproducible inputs for automated tests live under `test/fixtures/`; private site evidence belongs in local-only `design/reports/baseline/<site>/` folders and must never be copied into this example.

## Example verdict
A sample expedition-booking site has a fast server response but an unsized hero image, inconsistent type and spacing tokens, small navigation targets, and a consent panel that can cover the primary action. These are example observations only; a real audit must cite its own verified evidence and distinguish measured facts from hypotheses.

| Area | Score | Synthetic example observation |
|---|---:|---|
| Visual craft | 6/10 | Several font sizes and radii; inconsistent widget fallback |
| Interaction | 6/10 | Primary action has focus styling; some navigation targets are small |
| Consistency | 5/10 | Spacing mostly follows a small token scale, with exceptions |
| Conversion | 6/10 | Booking path is present; the initial offer is visually delayed |
| Simplicity | 7/10 | Short process description; one sample copy inconsistency |
| Trust and legal | 6/10 | Trust content is present; policy links need a visibility check |
| Backend readiness | Unknown | Form hand-off is not tested in this synthetic example |
| SEO hygiene | 7/10 | Example flags include metadata and structured-data checks |

## Example bottleneck
In this fictional scenario, a large hero region and a consent panel make the first booking action harder to notice on a small screen. This is a design hypothesis to validate with controlled browser measurements and human review—not a measured conversion result.

## Example fixes
1. Reserve media dimensions and test layout stability before and after loading.
2. Ensure consent controls do not obscure primary actions; test overlay states.
3. Consolidate repeated styles into a small, documented design-token set.
4. Check navigation and close controls against the project's touch-target standard.
5. Validate structured data against visible page content and the applicable schema rules.

## Example regression targets
- Use seeded local pages and repeatable browser settings; report actual runs and skipped checks.
- Record CLS and LCP as measured values only when the relevant browser run completes.
- Require zero clipped primary actions and zero consent-overlay obstruction in the test fixture.
- Compare stable section identities rather than fragile DOM IDs or headings alone.
- Set business and search targets only from an approved, private baseline; do not invent uplift claims.

## Coverage and limits
- This teaching example contains no live scan, website URL, customer data, account data, or business metric.
- Form submission, booking confirmation, and backend hand-off are intentionally not tested here.
- Predicted attention maps are hypotheses, not observed user behavior.
- A lab result is not a field-user result; report its device, conditions, run count, and uncertainty.
- Any real-site report must use explicit network containment, evidence validation, privacy redaction, and the approved project-specific source of truth.

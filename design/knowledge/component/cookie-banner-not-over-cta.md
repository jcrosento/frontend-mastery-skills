---
title: Cookie banner must not cover the primary CTA
category: component
stack: [css, ux]
source: first scan run (elements.md); pattern, no site metrics stored here
source_type: scan
learned: 2026-11-08
proven: true
uses: 1
---
## When to use
Any consent banner on a conversion page.
## How it works
The banner sat over the primary booking and chat CTAs at the fold on mobile and desktop; hover probes failed with pointer interception. First-time visitors cannot tap the money button until they deal with cookies.
## Recipe
- Bottom sheet, max 25% of viewport height, never fixed over the hero CTA.
- Buttons >= 44 px tall, equal visual weight for Accept and Essential only (PH Data Privacy Act friendly).
- Delay 1.5 s or show on scroll, not on paint; remember choice for 12 months.
- Load analytics only after consent (GTM consent mode).
## Measure
`elements.mjs` reports `coveredBy` and `BLOCKED` per CTA and the banner's % of viewport; target 0 covered CTAs.

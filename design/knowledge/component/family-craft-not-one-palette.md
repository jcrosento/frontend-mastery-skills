---
title: Shared craft, separate palettes
category: component
stack: [tokens, css]
source: family contract added 2026-11-17; not yet run on live products
source_type: skill
learned: 2026-11-17
proven: false
uses: 0
---
## Symptom
Several products in one company: each button, form and empty screen invented separately, or an agent "fixed" consistency by painting them all one color.
## Recipe
Write `design/family/family.json` with one craft block (spacing steps, control heights, radii, icon sizes, motion durations, focus, tap floor, body floor, type ratio) and one product file per brand whose `palette` lists brand colors only.

```bash
node skills/fe-drift/scripts/drift.mjs --family design/family/family.json --products design/family/products
```

Same brand on two domains stays in fe-consistency. Different brands do not share a hex.

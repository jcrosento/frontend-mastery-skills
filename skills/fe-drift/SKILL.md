---
name: fe-drift
description: "Check that every product in a family still uses the same craft numbers and that distinct brands do not share a brand color. Fails when spacing, control height, radius, focus ring, type ratio, icon size, motion duration, tap size or a required state drifts. Use after fe-family and whenever tokens change. Not for consistency inside one brand; use fe-consistency."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-drift

Shared craft is a number. If two products disagree, one of them drifted. This skill runs that check. It does not decide whether a screen looks good.

## What it proves
- Every product's craft block matches `family.json` exactly: spacing steps, control heights, radii, icon sizes, motion durations, focus ring, minimum tap, minimum body size, type ratio.
- Every product claims the required states.
- When `brand_must_differ` includes `palette`, no two products share a brand hex. Black, white and gray are not brand colors. Do not put them in `palette`.
- The family file itself stays above the floors already learned: tap at least 44, body at least 16, focus ring at least 2.

## What it does not prove
- That a state was designed. A name in `states` is a claim. Open the screen.
- That the buttons, forms or shell follow fe-forms and fe-shell. Those are looked at, not counted here.
- That two products of the same brand match. Same brand on several domains is fe-consistency. Set `brand_must_differ` to `[]` only in that case, and say so in the family file's note to the founder.

## Run
From a clone of this repository, or from wherever the skill is installed:

```bash
node skills/fe-drift/scripts/drift.mjs --family design/family/family.json --products design/family/products
node skills/fe-drift/scripts/drift.mjs --selftest
```

Exit 0 means the numbers match. Exit 1 means something drifted. Exit 2 means the files could not be checked (missing, unreadable, or fewer than two products). The script prints one line per product and one line per failure. It writes nothing.

Copy `skills/fe-drift/templates/family.example.json` and `skills/fe-drift/templates/products/` into the product group's `design/family/` folder, then replace the example colors with the real brand colors. Do not invent a color. If a brand color is unknown, stop and say so.

## How to read a failure
- `drift` — that product's token is not the family token. Change the product to the family number, or change the family number and every product in the same pull request. Never "fix" one product by editing the checker.
- `brand` — two products share a brand color, or a neutral was listed as a brand color. Split the palettes, or move the work to fe-consistency if they are the same brand.
- `state` — the product file does not claim a required state. Add the claim only after the screen exists.
- `floor` — the family file lowers tap, body or focus below the floor. Raise the family number. Do not lower the floor in code.
- `shape` — the file is not in the form above. Fix the file.

## Hand-offs
Write the contract with fe-family. Design the missing states with fe-states, the forms with fe-forms, the signed-in frame with fe-shell. Inside one brand, fe-consistency still applies.

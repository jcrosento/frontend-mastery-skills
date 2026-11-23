---
name: fe-family
description: "Write the family contract for products that should feel related without becoming the same brand. Separates shared craft (spacing, controls, focus, type ratio, icons, motion, states) from each product's palette, logo and voice. Use when several apps and websites should feel consistent, or look unrelated or like copies. Not for checking the numbers afterwards; use fe-drift."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-family

A company with several products needs one craft and many brands. One palette across all of them makes every product look like a copy. No shared craft makes every product look like a different company. This skill writes that split down so later work cannot blur it.

## The split
| Shared craft (must match) | Per product (must not be copied) |
|---|---|
| Spacing steps on a 4px base | Palette and logo |
| Control heights 44 and 52, tap at least 44 | Photography and illustration |
| At most three radii | Product name and voice |
| Two icon sizes, one icon library per product | Which typeface, within two families plus one mono |
| Three motion durations, inside fe-motion's bands | Marketing layout and signature move (fe-concept) |
| Focus ring, 16px body floor, type ratio | |
| The six states in fe-states | |
| Form grammar in fe-forms | |
| App chrome in fe-shell, for kind `app` | |

Typefaces may be shared. Brand colors may not, unless the founder has said these domains are one brand. That case is fe-consistency, not this skill.

## Write these files
In the folder that tracks the whole product group (not inside one app's UI pull request):

```
design/family/family.json
design/family/products/<product>.json
```

Start from `skills/fe-drift/templates/family.example.json` and `skills/fe-drift/templates/products/`. The example colors are fake. Replace them with measured colors from each live product (fe-inspect or the product's own tokens). Unknown color means the file stays unfinished. Do not guess a hex.

`kind` is `site` for a marketing or booking website and `app` for anything with sign-in. A website that also has a signed-in area is still `site` here; the signed-in area also follows fe-shell.

`palette` lists brand colors only. Leave out black, white and gray.

## Procedure
1. Name the products the founder actually ships. Do not add a product that is only an idea.
2. Measure one screen of each (fe-inspect) or read its token file. Record the current craft numbers next to the family numbers. Where they differ, the family number wins unless the founder has already set a different number in `family.json`.
3. Write `family.json` once. Changing it later changes every product in the same effort, not one quietly.
4. Write one product file each. `states` lists only states that exist. A missing state is work for fe-states, not a box to tick.
5. Run `node skills/fe-drift/scripts/drift.mjs --family design/family/family.json --products design/family/products` and keep the output.
6. For each product that failed, route the fix: numbers to the token file, missing states to fe-states, forms to fe-forms, signed-in frame to fe-shell, one brand's internal mess to fe-consistency.

## Microcopy shape (shared, words are not)
The shape is shared. The words belong to the product.
- A button is a verb. "Book", "Save", "Send". Not "Submit" and not "Click here".
- An error says what happened and the one next step. It does not open with "Unfortunately" or "Please be advised".
- An empty screen says what will appear here and the action that fills it.
- The same action uses the same verb in the button, the title and the success line.

## Guardrails
- Do not change a logo, palette or voice while writing the family file. Record them. A brand change waits for the founder.
- Do not run fe-consistency's one-palette mode on products whose `brand_must_differ` includes `palette`.
- Do not edit `skills/fe-drift/scripts/drift-core.mjs` to make a product pass.
- Done when fe-drift exits 0 and each failure from the first run has a fix or an open note saying which skill owns it.

## Hand-offs
fe-drift runs the numbers. fe-states, fe-forms and fe-shell do the screens. fe-consistency stays inside one brand. fe-guard still blocks backend edits on an existing app.

---
name: fe-reference
description: Decide which widely-used app a venture flow should borrow its interaction grammar from, then produce a measured, provenance-tagged brief that build skills consume. Familiar-first, refined-second: structure and sequence are borrowed, chrome is subtracted, finish is elevated. Use when the user asks which app to copy, wants inspiration for a flow, or asks whether a design is familiar, fast and minimal enough.
license: MIT
compatibility: Node 18+. Reads skills/fe-reference/references/*. Uses fe-inspect for screenshot measurement, fe-guard for the landmark lock and element count, and scripts/gates.mjs to enforce the gates. Screenshots stay in the venture's private design folder; only measurements enter this repo.
metadata:
  author: jcrosento
  version: "0.2.0"
---

# fe-reference

One flow in, one reference brief out. The agent must fill the matrix from evidence, measure with a calibrated tool, and refuse to output if any gate fails. Never pick a reference from taste alone.

## Philosophy
Users judge every new screen against mental templates built in the apps they use most (Jakob's Law). Borrow that grammar so the learning curve is flat, then compete on what those apps do not do: fewer elements, tighter rhythm, better type and motion. Deviate from a convention only when the alternative is measurably faster for the user.

## Decision matrix (per flow, not per venture)
| Criterion | Weight | How it is measured |
|-----------|--------|--------------------|
| Familiarity to the venture's actual users | 30 | Install base / usage share for the user's region and device mix; cite the source |
| Task-shape match | 25 | Does the app's core loop match the flow (e.g. capture -> review -> file)? Score against the flow's step list |
| Speed of the pattern | 20 | Taps-to-complete and screens-to-complete measured from the reference's screenshots |
| Minimalism headroom | 15 | Share of visible chrome removable without breaking the mental model (fe-scan element census) |
| Aesthetic ceiling | 10 | Type, spacing, motion quality; lowest weight because this layer is replaced, not borrowed |

Scores are 1-5. Every score carries a `source`. Weights are fixed by `templates/matrix.schema.json`; change them by PR, never per run. `gates.mjs --matrix` recomputes the totals and fails if the recorded winner is not the one the numbers select, or if the top two tie.

## Library
| Folder | Status | Shape of the app |
|--------|--------|------------------|
| `ios-camera` | measured | one dominant action, everything else recedes |
| `camscanner` | measured (Files, capture) | capture -> review -> file |
| `facebook` | candidate, unmeasured | feed, composer, reactions, bottom tabs |
| `gcash` | candidate, unmeasured | balance, send money, confirm, receipt |

A candidate may be scored in the matrix. Its patterns cannot be cited in a brief until someone supplies screenshots and fe-inspect measures them. To add an app, follow `references/_schema.md`.

## Inspiration tiers (search in this order)
1. Platform guidelines (Apple HIG, Material) - conventions users have the most hours in.
2. Top-5 most-used apps in the flow's category for the venture's region - the structural reference.
3. Best-in-class in adjacent categories - the tweak layer.
4. Award and showcase sites (Awwwards, Webflow, Bricks) - the aesthetic ceiling only, never structure.

## Procedure
1. **Study**: 10-20 screenshots of the candidate's core flow into the venture's private design folder, each labelled with the app and screen in `shots.json`. Run `fe-inspect/scripts/measure-shot.mjs` -> `tokens.json` with `measured_from` on every value. Screenshots of the product being redesigned are refused here; they are the baseline, not the reference.
2. **Decide**: fill `matrix.json` for all candidates; the computed winner is the reference. Write `borrow-tweak-elevate.md`.
3. **Lock**: write or reuse the product's `landmarks.lock.json` (fe-guard) and record the interactive element count of the current screen.
4. **Implement**: for an existing app, hand the brief to fe-variants (two or three working options behind a switch). For a new site, hand it to fe-build.
5. **Measure**: analytics custom events (Vercel Analytics or GA4) over two consecutive weekly runs feed the regression escalation rule.

```bash
node scripts/gates.mjs --matrix matrix.json --tokens tokens.json --brief borrow-tweak-elevate.md --counts counts.json
```
`counts.json` is `{ "before": 19, "after": 14, "reference": 9 }`: interactive elements on the same screen state, from `fe-guard/scripts/lock-check.mjs --census`.

## Gates (all must pass; a failed gate produces no brief)
| Gate | Threshold | Why |
|------|-----------|-----|
| G1 Provenance | 100% of tokens have `measured_from` (screenshot id, file hash, pixel box). Every cited pattern is measured | No invented numbers |
| G2 Calibration | The measurer reproduces a built-in image of known geometry within +/-2 px, under the same downscale and JPEG compression as a phone upload | Running an estimate twice only proves it is consistent, not that it is right |
| G3 Subtraction and lock | The redesigned screen has at least 20% fewer interactive elements than before, or no more than the reference screen; never more than before. Every locked landmark is present, labelled and in order | Minimalism is enforced; nothing the user relies on disappears |
| G4 Outcome | Taps-to-complete <= reference and task completion not lower, over two consecutive weekly runs | The design must actually be faster for real users |

## Outputs
`design/reference/<venture>/<flow>/`:
- `matrix.json` - validated against `templates/matrix.schema.json`.
- `tokens.json` - measured values with provenance.
- `borrow-tweak-elevate.md` - three lists: copy verbatim / refine / raise above reference. Every item cites a pattern id from `references/*/patterns.md`.
- `counts.json` - interactive element counts for G3.

The lock itself lives with the product (`design/landmarks.lock.json`, format in fe-guard): 5-12 controls per screen state that must stay present, labelled and in order. Position and size are never locked; screens reflow across devices and a pixel lock fails for the wrong reasons.

## Hand-offs
- Screenshot measurement -> fe-inspect.
- Landmark lock, element census, UI-only check -> fe-guard.
- Working options for an existing app -> fe-variants.
- Brief consumption for a new site -> fe-build / fe-editable.
- Final judgement vs reference -> fe-judge.

## Rules
- Borrow structure, spacing and sequence. Never copy icons, illustrations, brand colour or copy.
- A measured size is a starting point for a touch target or rhythm, not a number to paste. Convert to the product's own spacing scale.
- The reference tells you what to build toward; the product's own screen tells you what to remove. Never measure the product and call it the reference.
- Chrome subtracted, finish elevated: if the result is not visibly simpler and visibly better-finished than the reference, it is a knockoff and fails G3.
- Report every number with units, device and provenance.
- Judge outcomes over two runs, never one; incumbents enjoy familiarity inflation in week one.

---
name: fe-reference
description: Decide which widely-used app a venture flow should borrow its interaction grammar from, then produce a measured, provenance-tagged brief that build skills consume. Familiar-first, refined-second: structure is borrowed to the pixel, chrome is subtracted, finish is elevated. Use when the user asks which app to copy, wants inspiration for a flow, or asks whether a design is familiar, fast and minimal enough.
license: MIT
compatibility: Node 18+. Reads skills/fe-reference/references/*. Uses fe-inspect for screenshot measurement and fe-scan for live-page verification. Screenshots stay in the venture's private design folder; only measurements enter this repo.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-reference

One flow in, one reference brief out. The agent must fill the matrix from evidence, run the measurement twice, and refuse to output if any gate fails. Never pick a reference from taste alone.

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

Scores are 1-5. Every score carries a `source`. Weights are fixed by `templates/matrix.schema.json`; change them by PR, never per run.

## Inspiration tiers (search in this order)
1. Platform guidelines (Apple HIG, Material) - conventions users have the most hours in.
2. Top-5 most-used apps in the flow's category for the venture's region - the structural reference.
3. Best-in-class in adjacent categories - the tweak layer.
4. Award and showcase sites (Awwwards, Webflow, Bricks) - the aesthetic ceiling only, never structure.

## Procedure
1. **Study**: 10-20 screenshots of the candidate's core flow into the venture's private design folder. Run fe-inspect twice -> `tokens.json` with `measured_from` on every value.
2. **Decide**: fill `matrix.json` for all candidates; the computed winner is the reference. Write `borrow-tweak-elevate.md` and `landmarks.lock`.
3. **Implement**: hand the brief to fe-build. fe-scan verifies the built page against `landmarks.lock` and the subtraction threshold.
4. **Measure**: analytics custom events (Vercel Analytics or GA4) over two consecutive weekly runs feed the regression escalation rule.

## Gates (all must pass; a failed gate produces no brief)
| Gate | Threshold | Why |
|------|-----------|-----|
| G1 Provenance | 100% of tokens have `measured_from` (screenshot id + pixel box) | No invented numbers |
| G2 Reproducibility | Two independent measurement runs agree within +/-2 px on every token and select the same winner | Accuracy and consistency are testable, not asserted |
| G3 Subtraction | Built page has >= 20% fewer visible elements than the reference screen; every landmark present and within +/-8 px of its locked position | Minimalism is enforced |
| G4 Outcome | Taps-to-complete <= reference and task completion not lower, over two consecutive weekly runs | The design must actually be faster for real users |

## Outputs
`design/reference/<venture>/<flow>/`:
- `matrix.json` - validated against `templates/matrix.schema.json`.
- `tokens.json` - measured values with provenance.
- `borrow-tweak-elevate.md` - three lists: copy verbatim / refine / raise above reference. Every item cites a pattern id from `references/*/patterns.md`.
- `landmarks.lock` - 5-8 elements that must not move across redesigns (primary action, nav, core gesture, key workflow entry points).

## Hand-offs
- Screenshot measurement -> fe-inspect.
- Element census and landmark verification -> fe-scan.
- Brief consumption -> fe-build / fe-editable.
- Final judgement vs reference -> fe-judge.

## Rules
- Borrow structure, spacing and sequence. Never copy icons, illustrations, brand colour or copy.
- Chrome subtracted, finish elevated: if the result is not visibly simpler and visibly better-finished than the reference, it is a knockoff and fails G3.
- Report every number with units, device and provenance.
- Judge outcomes over two runs, never one; incumbents enjoy familiarity inflation in week one.

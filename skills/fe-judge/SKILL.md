---
name: fe-judge
description: "Score a page like an Awwwards jury: Design 40%, Usability 30%, Creativity 20%, Content 10%, plus accessibility and development gates, with blocking issues and fixes. Use when the user asks for a critique, a rating, or whether a page would win. Not for the merge decision (fe-last-eye), and not for judging a screen you built yourself (fe-second-eye)."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.1"
---

# fe-judge

Act as three jurors (art director, UX lead, front-end lead). Score 1–10 per criterion, then weight.

## Rubric
| Criterion | Weight | What 9+ looks like |
|-----------|--------|--------------------|
| Design | 40% | Clear hierarchy, intentional typography pairing, confident palette, consistent rhythm, finished micro-details (states, spacing, alignment) |
| Usability | 30% | Obvious navigation, fast, readable, mobile-perfect, accessible (WCAG 2.2 AA), forms forgiving, zero dead ends |
| Creativity | 20% | A memorable concept or interaction you have not seen this month; motion that tells the story |
| Content | 10% | Copy is specific, human, scannable; imagery is art-directed, not stock-default |

Add two gates that must pass regardless of score:
- Accessibility: keyboard path through the whole page, focus visible, alt text, contrast, reduced-motion.
- Development: fe-responsive PASS, fe-perf PASS, no console errors, valid HTML landmarks.

## Procedure
1. Load the page at 390 and 1440. Screenshot fold and full.
2. Fill the rubric with one evidence line per score (what you saw, where).
3. List blocking issues (anything that would make a juror score < 6) with the exact fix.
4. List three upgrades that would lift the weighted score by ≥ 1 point.
5. Compute weighted score. Target ≥ 8.0.

## Output
`design/reports/judge.md` with the rubric table, blocking issues, upgrades and final score. End with a one-line verdict: SHIP / FIX THEN SHIP / REDESIGN.

If you built or changed this page, this score is self-graded. Write "self-graded" beside it and hand the before and after to `fe-second-eye`; only that verdict may be cited as proof the page got better.

This verdict is the jury. It is not the merge call. `fe-last-eye` is the last eye, and only its MERGE may be merged.

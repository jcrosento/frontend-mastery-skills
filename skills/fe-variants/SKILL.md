---
name: fe-variants
description: Build two or three real, working versions of one screen behind a switch in a single branch, compare them on the same data, pick one and delete the rest. Use when the user wants to see design options for an existing app screen, asks for concepts or alternatives, or when a redesign direction is uncertain. Replaces one-branch-per-concept and generated mockup images.
license: MIT
compatibility: Any component framework. The picker template is TypeScript for Vite; adapt the environment check for other bundlers. Depends on fe-guard for the UI-only and landmark checks.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-variants

A picture of a design is a guess. A variant is the real screen, with real data, at real sizes. Build few, build them cheap, and throw the losers away.

## Why one branch
Three concept branches mean three full copies of the screen, three previews that drift from the base, and two that are discarded whole. One branch with a switch shares everything except the layout, so each variant is small and the comparison is fair.

## Rules
1. **Default is production.** With no switch set, the user sees today's screen, untouched. Variants only render when asked for.
2. **Same data, same handlers.** The existing container fetches and mutates. Variants are presentational: they receive data and callbacks as props. A variant file contains no query, no mutation, no fetch. fe-guard fails it otherwise.
3. **Two or three, each with a thesis.** One sentence per variant: which reference pattern it borrows (pattern id from fe-reference) and what it removes. No thesis, no variant.
4. **Every variant passes the lock.** Each one renders every locked landmark, with its label, in order, for every state. A variant that needs the lock changed is a product decision, not a design option; stop and ask.
5. **Structure before finish.** First pass uses the app's existing tokens only. No new colour, font or shadow until a structure is chosen.
6. **Losers are deleted.** After the choice, the picker, the switch and the unchosen variants are removed. `guard.mjs --final` fails while any file remains under a `__variants__` folder.

## Procedure
1. Baseline: screenshot the current screen at 390 and 1280 px for each locked state; record the interactive element count (`fe-guard/scripts/lock-check.mjs --census`).
2. Split the screen once: container (data, handlers; stays where it is) and view (layout). This refactor is its own commit and must pass guard and lock with no visual change.
3. Add `__variants__/` beside the view. Copy `templates/pick-variant.ts`. Create `A.tsx`, `B.tsx` (and `C.tsx` only if it has a different thesis).
4. Render `pickVariant('home', ['a', 'b'] as const)`; `null` means the current view.
5. For each variant and each state: lock check, count, screenshots at 390 and 1280 px. Then stress it with worst-case data: longest name, largest amount, empty list, 200 rows, slow network, error state.
6. Write `design/variants/<screen>/decision.md`:

| | Current | A | B |
|---|---|---|---|
| Thesis | | | |
| Interactive elements | | | |
| Taps to primary action | | | |
| Lock | | PASS/FAIL | PASS/FAIL |
| Survives worst-case data | | | |

7. The owner opens the preview, switches with `?v-home=a`, and chooses. Record the choice and the reason in one line.
8. Promote the winner into the view, delete `__variants__/`, run `guard.mjs --final`, the lock and the app's tests.

## What a reviewer should refuse
- A variant that adds a control without removing one.
- A variant that only changes colour or radius (that is a token change, not a structure).
- A pull request that still contains the picker.

## Hand-offs
- Reference and pattern ids -> fe-reference. UI-only and lock -> fe-guard. Viewport sweep -> fe-responsive. Motion and gesture polish on the winner -> fe-motion. Final judgement -> fe-judge.

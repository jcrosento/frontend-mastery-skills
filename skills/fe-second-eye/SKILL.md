---
name: fe-second-eye
description: "Independent judging, so the builder never grades its own work. Packs a blind before-and-after ballot, has a model from another family judge it in both orders, takes measured lines from tools, and books a person for screens staff use daily. Use before fe-last-eye, or when the user asks for a second opinion. Not for the merge call; use fe-last-eye."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-second-eye

A model prefers its own output, and prefers its own family's output. A score the builder gives its own screen is not evidence. You make the judging independent, or you say plainly that it was not.

## Three kinds of line, three kinds of judge

| Line | Who decides | Never |
|------|-------------|-------|
| Measured: performance, responsive, accessibility, backend untouched, drift | A script's exit code and report file (`fe-perf`, `fe-responsive`, `fe-ux-audit`, `fe-guard`, `fe-drift`) | A model's opinion of whether it "looks fast" or "seems accessible" |
| Opinion: clear, clean, matches the reference, better than before | A model from a different family than the builder, blind, in both orders | The builder, the builder's family, or the same chat that built it |
| Lived: can staff finish the task | A person on a real phone, five minutes, one task | A model |

## Procedure

1. Name the builder. Write down the exact model that built the screen. If you are that model, you are not the judge for the opinion lines. Say so and continue.
2. Run the measured lines first. A failed script is fixed before anyone is asked for an opinion.
3. Pack the ballot. `before.png` is the screen on the base branch, `after.png` is the screen on this branch, same device, same data.

```bash
node skills/fe-second-eye/scripts/second-eye.mjs pack --before before.png --after after.png --brief design/brief.md --reference design/reference/<screen>/shot.png --out design/reports/second-eye/<project>/<date>
```

4. Hand over only the `packet` folder. The judge must not see the pull request, the commits, the code, your scorecard, or `key.json`. In Cursor, either:
   - start a new chat, pick a model from another family in the model picker, and say `/fe-second-eye judge design/reports/second-eye/<project>/<date>/packet ballot-AB`; then a second new chat for `ballot-BA`; or
   - copy `skills/fe-second-eye/templates/second-eye.agent.md` to `.cursor/agents/second-eye.md` once, set its `model` to an id from another family, and call `/second-eye` twice.
   Save each reply into its ballot file unchanged.
5. Tally.

```bash
node skills/fe-second-eye/scripts/second-eye.mjs tally --dir design/reports/second-eye/<project>/<date> --builder-model <exact builder model>
```

6. Obey the script.
   - `VERDICT AFTER BETTER`: the opinion lines may cite `verdict.json` on the last-eye card.
   - `VERDICT NOT PROVEN` or `BEFORE BETTER`: not an improvement yet. Fix what the `defects` list names, capture again, pack again.
   - `REFUSED`: the judge shares the builder's family, or a ballot has no reasons. Get another judge. Do not edit a ballot.
7. Book the person when the screen is one staff open every day, or when this is the third pack for the same screen. One task, one phone, five minutes, no help. Write what they did in `design/reports/second-eye/<project>/<date>/person.md`.

## When you are the judge

Read `packet/INSTRUCTIONS.md` and follow only that. Answer each question on its own before you form an overall view. Point at the thing you saw. If you cannot tell the screens apart on a question, answer `same`.

## Choosing the judge model

Read `references/models.md` when the user asks which model to use, or when no other-family model is set up. Never pick by habit: pick the highest-ranked model of another family on a current public leaderboard, and write the model and the date in the report.

## What you write

`verdict.json` from the script, and one sentence a person can read: who built it, who judged it, what was proven. If nothing independent was available, write "self-graded, not independent" in that sentence. Do not hide it.

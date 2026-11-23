---
name: fe-last-eye
description: "The last call before a merge. Scores ten lines and allows MERGE only when every line is 8 or higher and the judge is not the builder. A miss logs to project memory and writes a reprompt; the third miss asks. Use when someone asks to merge, ship or take a last look. Not for a critique; use fe-judge."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-last-eye

You are the last eye. A jury score is not a merge. You either allow the merge or you send the work back.

Run this after `fe-responsive`, `fe-perf`, `fe-judge` and `fe-second-eye`. Read the project memory first (`fe-memory`). Do not merge on your own verdict. The script's `VERDICT` line is the call.

The card names who built the screen and who judged it. The script refuses a card whose judge is the builder, or a model from the builder's family. If you built this screen, you may fill the measured lines from their report files, but the opinion lines (first-place, clean, reference, new-game) come from the `fe-second-eye` verdict or from a person, and `judge` names them.

## The ten lines

Score each line 0–10 from something you opened. 8 is the floor. One line under 8 means the whole card is a new game.

| Line | What 8 or better means |
|------|------------------------|
| consistent | This screen uses one spacing scale, one type scale and one control height. When a family file exists, `fe-drift` passes. |
| first-place | Name the rival. Say why a visitor would pick this screen for the job it claims. No rival in the brief means the line stays under 8. |
| animation | Motion follows `fe-motion`: it explains the change, it can be reduced, it does not hitch. If the reference has no motion, say that and score from it. |
| performance | The `fe-perf` report is PASS. Cite that file. |
| responsive | The `fe-responsive` report is PASS at 390 and 1440. Cite that file. |
| backend | An app change: `fe-guard` passed and no server file changed. A page with no server in the diff: set `na` and `touches_server` false. Do not edit booking, payment or server files to raise this line. If those files need a change, the line stays under 8 until a separate review says they are safe. |
| consistency | The rest of this product matches this screen. The same brand on another domain still matches. Other brands were not recoloured to get here. |
| clean | No placeholder copy, no dead control, no console error, focus visible. |
| reference | The build matches the approved reference (the frame, the shot, or the `fe-reference` pattern) on the points the brief named. Numbers come from measurement. |
| new-game | This attempt is not the previous attempt and not a stock template. If the memory already describes the screen in front of you, the line stays under 8. |

`consistent` is this screen agreeing with itself. `consistency` is the rest of the product, and the other brands, agreeing with the decision.

## Procedure

1. Run `fe-memory` for this project and this screen. An open miss starts under 8 until the screen has actually changed.
2. Copy `skills/fe-last-eye/templates/scorecard.example.json` to `design/reports/last-eye/<project>/<date>/scorecard.json` and fill it. One evidence sentence per line, plus the file you looked at. Set `builder` to `{ "model": "<exact model that built it>" }` and `judge` to the other-family model, or `{ "human": "<name>" }`.
3. Run:

```bash
node skills/fe-last-eye/scripts/last-eye.mjs --card design/reports/last-eye/<project>/<date>/scorecard.json --memory design/memory/<project>.jsonl --write
```

4. Obey the script.
   - `VERDICT MERGE` — a merge is allowed. You still merge only when a person asked you to merge.
   - `ACTION RECREATE` — do not merge. The script writes `reprompt.md` beside the card and appends the miss to that project's memory. Hand `reprompt.md` to `fe-build` as the task. If this project builds with `/build-agents`, paste that same file as the task. Recreate only the failing lines.
   - `ALREADY LOGGED` — that finding is already in memory. Do not start a second build until the screen has changed.
   - `JUDGE card  Not independent` — the judge shares the builder's family. Get the opinion lines from `fe-second-eye`. Do not change the model names to pass.
   - `ACTION ASK` — this line has missed three different ways. Stop. Ask the founder. Do not launch another build.
5. Do not edit the script, the score, or the memory to force a MERGE.

## What you write

The script's report, then one line a person can read: merge is allowed, or name the lines that go back to the builder.

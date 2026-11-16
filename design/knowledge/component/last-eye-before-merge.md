---
title: Last eye before a merge
category: tooling
stack: [process]
source: fe-last-eye and fe-memory, added 2026-11-17; not yet run on a live merge
source_type: skill
learned: 2026-11-17
proven: false
uses: 0
---
## Symptom
A page is called done because the jury liked it, then the same weak animation, the same broken reference, or the same backend worry comes back in the next chat.
## Recipe
Read `design/memory/<project>.jsonl` first. Score the ten lines. Merge only when `fe-last-eye` prints `VERDICT MERGE`. Otherwise hand the builder `reprompt.md` and let the memory keep the miss.

```bash
node skills/fe-memory/scripts/memory.mjs --project <project> --dir design/memory --subject <screen>
node skills/fe-last-eye/scripts/last-eye.mjs --card <scorecard.json> --memory design/memory/<project>.jsonl --write
```

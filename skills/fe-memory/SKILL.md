---
name: fe-memory
description: "Reads and writes the memory of one specific project so the next build does not repeat a miss. Use before building or rebuilding a named site or app, and whenever a lesson belongs to that project rather than to the shared lesson file."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-memory

Each project has its own memory. The next build on that project reads it before inventing the same screen again. `fe-last-eye` writes the merge misses. Use this skill for anything else that must not be repeated, and to read the file before a build.

The file lives in the project, at `design/memory/<project>.jsonl`. It does not live in the skills repo. One JSON object per line.

## Before you build

```bash
node skills/fe-memory/scripts/memory.mjs --project <project> --dir design/memory --subject <screen>
```

Exit 1 means something is still open. Put those lines at the top of the build task. Do not repeat them. Exit 0 means that screen is clear. Also run it once without `--subject` so a miss on another screen of the same project is visible before you touch a shared header, form or token.

## Log a lesson that is not a score

```bash
node skills/fe-memory/scripts/memory.mjs --note --project <project> --dir design/memory --subject <screen> --line <line> --evidence "What you saw, in one sentence." --do-not-repeat "What the next build must not do." --date YYYY-MM-DD
```

`<line>` is one of the ten last-eye lines: `consistent`, `first-place`, `animation`, `performance`, `responsive`, `backend`, `consistency`, `clean`, `reference`, `new-game`.

A later `fe-last-eye` MERGE on that screen closes a line that now scores 8 or higher. Do not delete a line to clear the list.

## Do not

- Do not put customer names, prices, keys or booking references in the memory.
- Do not copy one project's file into another project.
- Do not log a guess. Log what you saw and the file you saw it in.

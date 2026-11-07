---
name: fe-master
description: Orchestrator for the front-end mastery pipeline. Triages any UI request, decides which fe-* skills to run and in what order, maintains the project knowledge base (design/knowledge, LESSONS.md), and compounds learning across projects. Use at the start of any website, landing page, redesign, UI or front-end task, or when the user says "improve my sites", "learn from this", or "make this world-class".
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-master

You are the conductor. You do not build until you understand, and you do not finish until you have learned.

## Triage (first 60 seconds)
Classify the request and pick the path:

| Request type | Path |
|--------------|------|
| "Study / learn / watch this" | fe-learn (video, article) or fe-inspect (site, image) -> write knowledge cards |
| "Analyze competitors / market" | fe-competitor -> gaps list -> optional fe-concept |
| New site or page with references | full loop: LEARN -> THINK -> SYSTEM -> BUILD -> GATE -> REFLECT |
| Improve an existing site | fe-inspect (own site) -> fe-judge baseline -> fe-perf + fe-responsive fixes -> fe-concept if score < 7 -> rebuild sections -> GATE |
| Quick tweak | fe-build with DESIGN.md loaded -> fe-responsive on the touched section |

## Learning-how-to-learn protocol
1. Before any work, read `design/knowledge/INDEX.md` and `design/LESSONS.md` (create if missing).
2. For every new input (tutorial, inspiration, competitor), extract **technique cards** via fe-learn / fe-inspect: name, when to use, how to do it, code snippet, pitfalls, source.
3. When a technique is used and passes gates, mark it `proven: true` in its card and bump `uses`.
4. When a gate fails, write the root cause and fix to `LESSONS.md` under `## Anti-patterns`.
5. Monthly (or when asked), run `consolidate`: merge duplicate cards, delete unproven ones older than 90 days, promote top 10 to `design/knowledge/PLAYBOOK.md`.

## Tenfold rule
One input should produce ten reusable outputs. For every inspiration or tutorial, extract at least: 1 layout pattern, 1 typography pairing, 1 color strategy, 1 motion move, 1 component pattern, 1 responsive strategy, 1 performance trick, 1 content/copy pattern, 1 anti-pattern to avoid, 1 idea to remix differently.

## Done criteria
- `design/reports/responsive.md`, `perf.md`, `judge.md` all PASS and are committed.
- `LESSONS.md` has a new dated entry: what was built, score, what to reuse, what to never do again.
- At least 3 knowledge cards were created or updated.

## Output of a run
A short run log in chat: path chosen, skills run, gates status, judge score, 3 lessons.

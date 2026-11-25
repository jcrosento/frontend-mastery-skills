---
name: fe-master
description: "Orchestrator for the front-end skills. Triages a UI request, decides which fe-* skills run and in what order, and keeps the project knowledge base and lessons. Use at the start of any website, landing page, redesign or app UI task, or when the user says improve my site. Not for a single named job that one skill already covers."
license: MIT
metadata:
  author: jcrosento
  version: "0.4.0"
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
| Change the UI of an existing app (SaaS, dashboard, internal tool) | fe-scan `app-map.mjs` (read the screens, guards and links from the code first) -> fe-guard (UI-only contract and landmark lock, set up before any UI change; `guard.mjs --audit` must report no holes) -> fe-reference (which familiar app to learn from) -> fe-inspect (measure its screenshots) -> fe-variants (2-3 working options behind a switch) -> fe-responsive -> fe-regress. Backend, schema, auth and network calls do not change on this path |
| Make every site and app feel like one company | fe-family (write the shared-craft contract; palettes stay per brand) -> fe-drift (the numbers must match) -> fe-states, fe-forms and fe-shell on what failed. Do not collapse those brands onto one palette |
| UX or accessibility audit of a screen, flow or app | fe-ux-audit (script first, then the ten heuristics by hand) -> fe-second-eye for a second evaluator |
| SEO audit, not indexed, not ranking | fe-seo (reach, then signals, then speed) -> fe-schema and fe-keywords for the fixes. Site profile only |
| A Pinterest board, saved pins or a moodboard to turn into a style guide | fe-pinterest (the user saves the pins; the script measures the palette and checks contrast; type, shape and imagery by eye) -> the user approves -> fe-system. On an app it changes the skin only; fe-guard still runs |
| Migrate a website, or rebuild a site to match a reference site | fe-layers (read the reference or the old site into layers -> the user approves `spec.json` -> colour may come from fe-pinterest instead -> build one layer per change -> gate every page per layer; REGRESSED undoes, STUCK asks) -> fe-second-eye -> fe-last-eye. fe-seo for redirects before launch |
| Generate or replace an image | fe-imagery. Never as a screen mockup; options for a screen are fe-variants |
| Copy a poster or map legend | fe-legend |
| "Can we trust this score" / second opinion | fe-second-eye (blind before and after, a judge from another model family, both orders) |
| "Should we merge" / last look / ship it | fe-memory (read this project's open misses) -> fe-second-eye (the builder does not grade its own screen) -> fe-last-eye. MERGE is the only yes. NEW GAME writes a reprompt and the builder recreates the failing lines. The third miss asks the founder |

Two profiles. **Site** (marketing, content, booking pages): the full loop, SEO and performance gates apply. **App** (a working product with a backend): the app row above; fe-keywords, fe-schema and fe-wp-audit do not apply, and fe-concept's five directions are replaced by fe-variants, because an app's users have already learned the current screens.

## Before proposing anything
A proposal is only made after these have been run and read, and the proposal quotes their output:
- Site: `fe-scan` on the live URL (it starts from sitemap.xml) and the `fe-audit` score card.
- App: `fe-scan/scripts/app-map.mjs` for the screens and links, the current element count of the screen from `fe-guard/scripts/lock-check.mjs --census`, and the app's own tests passing on the untouched branch.

If a script cannot run (no browser, no Node), say which one and what is therefore unverified. Do not fill the gap with an estimate.

## Running the scripts
Each skill's scripts sit in its own folder. From a project, call them by where the skills were installed: `.agents/skills/<skill>/scripts/<file>` for a project install, `~/.agents/skills/<skill>/scripts/<file>` for a global one. The `npm run ...` shortcuts exist only inside a clone of the skills repository. Scripts that open a browser need Playwright where the skills are installed (`npm i --prefix ~/.agents playwright gremlins.js`, then `~/.agents/node_modules/.bin/playwright install chromium`, for a global install); `guard.mjs`, `gates.mjs` and `app-map.mjs` need only Node.

## Learning-how-to-learn protocol
This is a written notebook, not training. The agent is no smarter next time unless it reads these files, and nothing in code checks that it did. Its value depends on the entries being specific and true.
1. Before any work, read `design/knowledge/INDEX.md`, `design/LESSONS.md`, and `design/memory/<project>.jsonl` via fe-memory (create the folder if missing).
2. For every new input (tutorial, inspiration, competitor), extract **technique cards** via fe-learn / fe-inspect: name, when to use, how to do it, code snippet, pitfalls, source.
3. When a technique is used and passes gates, mark it `proven: true` in its card and bump `uses`.
4. When a gate fails, write the root cause and fix to `LESSONS.md` under `## Anti-patterns`.
5. Monthly (or when asked), run `consolidate`: merge duplicate cards, delete unproven ones older than 90 days, promote top 10 to `design/knowledge/PLAYBOOK.md`.

## Tenfold rule
One input should produce ten reusable outputs. For every inspiration or tutorial, extract at least: 1 layout pattern, 1 typography pairing, 1 color strategy, 1 motion move, 1 component pattern, 1 responsive strategy, 1 performance trick, 1 content/copy pattern, 1 anti-pattern to avoid, 1 idea to remix differently.

## Done criteria
- `design/reports/responsive.md`, `perf.md`, `judge.md` all PASS and are committed.
- The opinion lines were judged by `fe-second-eye` (another model family, or a person), not by the model that built the screen. If that was not possible, the run log says "self-graded".
- `fe-last-eye` has printed `VERDICT MERGE` for this screen. A `NEW GAME` is not done; the builder gets `reprompt.md` and runs once. `ASK` stops and waits for the founder.
- App profile instead of the line above: guard, landmark lock, `app-map.mjs --strict` and the app's own tests pass; variant code is removed (`guard.mjs --final`); a person has looked at each touched screen.
- `LESSONS.md` has a new dated entry: what was built, score, what to reuse, what to never do again.
- At least 3 knowledge cards were created or updated.

## Output of a run
A short run log in chat: path chosen, skills run, gates status, who built and who judged, judge score, 3 lessons.

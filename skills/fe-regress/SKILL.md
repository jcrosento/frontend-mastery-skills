---
name: fe-regress
description: Baseline, regression testing, revision discipline and the feedback loop for websites. Establish a measured baseline, re-scan after every change, apply the two-try rule (confirm any regression with a second run before acting), log revisions with before/after evidence, and keep a closed loop from user signals to the next revision. Use when the user asks about baselines, regression, before/after, revisions, QA gates, release checks, or how the site keeps improving.
license: MIT
compatibility: Uses fe-scan scripts (run-all, compare), Search Console / GA4 / Clarity connectors when available, and git tags for revision history.
metadata:
  author: jcrosento
  version: "0.2.0"
---

# fe-regress

Nothing is "better" until the numbers say so twice.

This skill has two halves. Sections 1 to 4 are for a public site with a URL. Section 5 is for an app behind a login, where there is no URL to scan.

`npm run scan` works inside a clone of this repository. From an installed copy, call the script directly: `node <skills folder>/fe-scan/scripts/run-all.mjs <url> ...`, where the skills folder is `.agents/skills` in the project or `~/.agents/skills` for a global install.

## 1. Baseline foundation (once per site)
1. `npm run scan -- <url> --pages 12 --monkey 45 --runs 3 --baseline` -> three deep-scan and trace runs, medians, `BASELINE` marker file in the site folder.
2. Pull Search Console 90-day queries/pages and index status into `design/reports/baseline/<site>/gsc.json` (private; keep out of public examples).
3. Record business numbers for the same 90 days: sessions, inquiries, bookings, revenue (mark ESTIMATED if not from a system).
4. Write `design/reports/baseline/<site>/BASELINE.md`: score card (fe-audit 8 areas /10), the 10 worst measured defects, the conversion bottleneck, and the top 3 targets with numeric goals.
5. `git tag baseline/<site>/<date>`.

## 2. Revision discipline (every change)
- One revision = one hypothesis = one branch/tag: `rev/<site>/<n>-<slug>`.
- `design/reports/revisions/<site>/<n>-<slug>.md` written BEFORE the change: hypothesis, metric(s) expected to move, by how much, risk, rollback.
- After deploy: `npm run scan -- <url>` -> `compare.md` against BASELINE (or the previous revision if the baseline was reset).
- Append results to the revision file: measured deltas, verdict, before/after fold.png per device, decision KEEP / ROLLBACK / ITERATE.

## 3. Regression testing: the two-try rule
- A metric is a regression only if it is WORSE by > 10% (or any gate flips to FAIL) in **two consecutive runs** on the same conditions. One bad run is noise; re-run before acting.
- Gates that must stay green on every revision: no horizontal overflow on 5 devices; flow failures = 0; dead ends after click = 0; CLS < 0.1, LCP < 2.5 s, TBT < 200 ms on throttled mobile; 0 new section flags of type smallTap/upscaledImage; SEO issues not increased; crawler access issues not increased.
- Visual regression: compare fold.png per device against baseline; > 2% pixel difference outside the changed section = investigate.
- Functional regression: flow walk must reach the same destinations; forms keep the same field count/types unless the revision says otherwise.
- `compare.mjs` exits 3 on REGRESSED so CI can block; `compare.mjs --selftest` and `crawlers.mjs --selftest` verify the tooling itself (`npm run check`).

## 4. Feedback loop (users -> data -> revision)
| Signal | Source | Cadence | Feeds |
|---|---|---|---|
| Search demand and position | Search Console | weekly | fe-keywords, revision targets |
| Field Core Web Vitals | CrUX via psi.mjs | weekly | fe-perf gate reality check |
| Behaviour | Microsoft Clarity recordings/heatmaps, GA4 funnels | weekly 30-min review of the money path | fe-audit conversion bottleneck; MEASURED heatmaps |
| Voice of customer | post-inquiry 1-question survey, post-trip NPS, chat transcripts tagged by theme | monthly | copy, FAQ, trust sections |
| Robustness | monkey errors, console errors, 404s, form failures | every scan | fe-build fixes |
| Business | inquiries, bookings, revenue per channel | monthly | prioritisation of revisions |

Monthly ritual (60 min): re-scan all sites -> compare vs baseline -> read Clarity top-10 rage/dead clicks -> pick max 3 revisions -> write hypotheses -> `LESSONS.md` entry.

## 5. Regression for an app behind a login
The site scanner cannot sign in, so none of sections 1 to 3 run on an app's private screens. Regression there is these four checks, all of which must pass before and after every UI change:

| Check | Command | Catches |
|---|---|---|
| UI-only | `fe-guard/scripts/guard.mjs --base <main>` | a change outside the UI folders, or to a line that talks to the network |
| Landmarks | `fe-guard/scripts/lock-check.mjs --lock design/landmarks.lock.json --state <screen> --html <rendered.html>` | a locked control that vanished, was relabelled or moved out of order |
| Screens and links | `fe-scan/scripts/app-map.mjs --declared <sitemap.md> --strict` | a written link or redirect to a screen that no longer exists (fails). A screen added or removed without the sitemap document changing is listed under `declared`, to be read; it does not fail the run |
| Behaviour | the app's own tests and type check | anything the three above cannot see |

Save the map before the change with `--out` to a file outside the repository (a committed report would itself be a non-UI change) and compare it after: the list of screens, guards and redirects should differ only where the change says it should.

What is not covered: there is no automated before/after picture comparison for signed-in screens, and no check that a screen still behaves the same. Until the app has a signed-in test fixture, a person opens each touched screen on a phone and a desktop and says so in the pull request.

## 6. Learning capture
- Every KEEP revision -> technique card marked `proven: true`, `uses += 1`.
- Every ROLLBACK -> `LESSONS.md` anti-pattern with the numbers.
- Every scan crash or false positive -> fix the script, add a selftest check, record in `LESSONS.md` under Tooling.

## Output
`design/reports/baseline/<site>/BASELINE.md`, `design/reports/revisions/<site>/*.md`, `compare.md` + `compare.json` in each scan folder, `manifest.json` per run (coverage + skips), `design/LESSONS.md` entries, git tags.

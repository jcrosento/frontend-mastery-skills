---
name: fe-ux-audit
description: "A UX auditor's checklist for a screen or flow of a site or signed-in app. A script measures accessibility rules, tap sizes, small text, sideways scroll, dead controls, leaked placeholder text and console errors; the rest is done by hand against ten heuristics. Use when the user asks for a UX or accessibility audit. Not for conversion teardowns; use fe-audit."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-ux-audit

A UX audit is an expert review of one task on one device. Every problem is tied to a screen and a heuristic, gets a severity from 0 to 4, and comes with a fix. You run the half a machine can run, then do the half it cannot, and you never present the first as the whole.

## What an auditor does, and who does it here

| Step | Done by |
|------|---------|
| 1. Write the scope: one task, one user, one device | You. One sentence, for example "Team member files a receipt on a phone". |
| 2. Collect the goal and the data: what success is, analytics, support complaints | You ask the user. No data means say "no usage data". |
| 3. First pass: finish the task once without judging | You, in the browser. For an app, read `fe-scan/scripts/app-map.mjs` output first. |
| 4. Accessibility rules, tap sizes, text sizes, overflow, dead controls, leaked text, console and request errors | `ux-audit.mjs`, per screen |
| 5. Speed and layout shift | `fe-perf` |
| 6. Other screen sizes | `fe-responsive` |
| 7. Second pass against the ten heuristics, and read every word | You, with `references/heuristics.md` |
| 8. Count the steps and the decisions in the task | You. Name the step a person would drop. |
| 9. Merge findings with one root cause; rate each 0 to 4 | You |
| 10. A second evaluator who has not seen your list | `fe-second-eye`. Auditors work alone first so they do not copy each other. |
| 11. A person tries the task | The user's staff, five minutes, one phone |
| 12. Rank by severity, then by cost to fix; hand over | You |

## Procedure

1. Write the scope sentence and the list of screens in the task, in order.
2. Run the machine half on each screen, on the device in the scope:

```bash
node skills/fe-ux-audit/scripts/ux-audit.mjs <url> --device mobile
node skills/fe-ux-audit/scripts/ux-audit.mjs http://127.0.0.1:5000/requests --device mobile --allow-loopback-fixture   # a dev server on this machine
```

   It is read-only: it loads the screen and never clicks, types or submits. Exit 0 is PASS, 1 is FAIL (a severity 3 or 4 finding), 2 is UNVERIFIED (it could not run, or `axe-core` is not installed beside the skills; install with `npm i --prefix ~/.agents axe-core playwright`).
3. Do the first pass, then the second pass with `references/heuristics.md`. Add only findings you can point at: screen, element, what a person would get wrong.
4. Merge, rate and rank. Use the script's severity for its findings. Do not lower one to get a PASS.
5. Send the list to `fe-second-eye` when it will decide a merge.

A signed-in screen needs the app running with its own fake sign-in and seed data. Do not point the script at production behind a real login, and do not paste a session cookie.

To run it on every pull request, copy `skills/fe-ux-audit/templates/ui-checks.yml` to `.github/workflows/` in its own pull request and edit the three marked lines. It adds no dependency to the app.

## What you write

`design/reports/ux-audit/<host>/<date>/findings-<device>.json` and `report-<device>.txt` come from the script. You write `design/reports/ux-audit/<host>/<date>/audit.md`:

```text
Scope: <task, user, device>
Machine half: PASS | FAIL | UNVERIFIED, <n> findings
| # | Screen | Finding | Heuristic | Severity | Fix | Found by |
Steps in the task: <n>. Step most likely to be dropped: <which, why>.
Not checked: <screen readers, real devices, real users - whatever was not done>
```

Automated rules find about 57% of accessibility problems by volume (https://www.deque.com/automated-accessibility-coverage-report/). Say what was not checked every time.

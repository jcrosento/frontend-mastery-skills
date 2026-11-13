---
name: fe-guard
description: UI-only contract for changing the interface of an existing app without touching its backend. Fails a change that edits server, shared, schema, migration, auth, environment or dependency files, alters a network call, or breaks a locked landmark. Use before and after any redesign, reskin or UX change to a working SaaS or web app, when the user says "don't break the backend", "UI only", "keep the logic", or asks whether a redesign is safe to merge.
license: MIT
compatibility: Node 18+ and git. guard.mjs and lock-core.mjs have no dependencies. lock-check.mjs needs Playwright (offline, scripts disabled).
metadata:
  author: jcrosento
  version: "0.2.0"
---

# fe-guard

A redesign may change how a screen looks and how many steps a task takes. It may not change what the app does. This skill turns that sentence into three checks that run on every UI change and fail loudly.

## The contract
1. **Paths.** Every changed file sits inside the app's UI folders. Nothing under the frozen paths changes: server, shared types and schema, migrations, auth, API handlers, environment, deploy config, dependencies.
2. **Network.** No line that talks to the backend is added, removed or altered. A line that moves unchanged from one UI file to another is fine.
3. **Landmarks.** Every locked control is still present, still carries its label, and still appears in the same order. Geometry is never locked, because screens reflow.

The guard config, the lock and the lock tests are protected: they change only in a pull request that changes nothing else. A redesign cannot loosen the rules it is judged by.

## Setup (once per app, in its own pull request)
1. Copy `templates/guard.example.json` to `design/guard.json`.
   - `ui` is a short list of the folders and files that only decide how a screen looks: components, pages, styles, images. It is never the whole client folder (`client/**`, `src/**`, `app/**` when `app/` also holds API handlers).
   - These are not UI even though they sit in the client folder, and stay out of `ui`: the file that declares the routes and who may open them, role and permission tables, navigation rules, API clients and data hooks, and any file that calculates money, tax or totals.
   - `frozen` lists the backend and everything `AGENTS.md` marks frozen. When unsure whether a file is UI, leave it out of `ui`.
   - Do not type the app's data hooks by hand. `guard.mjs` reads the code and finds every exported function that reaches the backend, directly or through another function, and watches all of them. `network_extra` is only for a name it could not find; `network_ignore` switches one off.
2. Run the audit and fix every hole it reports. Read the "check by hand" list once: each file on it must change only how things look.
   ```bash
   node scripts/guard.mjs --audit            # exit 0 = no holes, 1 = holes, 2 = cannot run
   node scripts/guard.mjs --audit --names    # same, with every watched function named
   ```
3. Tag the controls that must survive with a stable attribute (`data-testid`). Tagging is itself a UI-only change.
4. Write `landmarks.lock.json` from `templates/landmarks.lock.example.json`: one entry per screen state, 5 to 12 landmarks each. Record `max_interactive` from the current screen so controls can be removed but not added. Lock the state where the person does the work (the form), not only the screen before it.
5. Put the lock inside the app's own test command, because skills are not installed where the app's tests and CI run. Copy `scripts/lock-core.mjs` into the app's test folder unchanged (it has no dependencies), render each state in the app's test DOM, and compare:
   ```js
   import { censusFromDocument, checkLock, INTERACTIVE_SELECTOR } from './landmarks-lock-core.mjs';
   const census = censusFromDocument(document, { attribute: lock.attribute, selector: INTERACTIVE_SELECTOR });
   assert.deepEqual(checkLock(lock, 'send-money-form', census).failures, []);
   ```
   The test file must name the lock by its path; the audit reports a lock that no test reads. Then break one label on purpose and confirm the test fails before trusting it.
6. Paste the audit output into the setup pull request. It changes no screen.

## Every UI change
```bash
node scripts/guard.mjs --base origin/<default-branch>             # while working
node scripts/guard.mjs --base origin/<default-branch> --final     # before asking for review
node scripts/lock-check.mjs --lock design/landmarks.lock.json --state <id> --html <rendered.html>
```
`guard.mjs` reads git and the working tree. It never writes, stages, commits or pushes. Exit 0 = UI-only, 1 = violation, 2 = cannot run. `--final` also fails if variant code from fe-variants is still in the tree. The PASS line says how many data functions it found and watched; zero in an app that has a backend means the config or the folder layout needs a look (`--audit`).

`lock-check.mjs` loads a rendered HTML file in an offline browser page with scripts disabled and every request aborted. `--census` prints the tagged elements and the interactive element count, which is the number fe-reference uses for its subtraction gate.

On a violation: revert it, or move it to its own pull request that a person approves. Never edit the guard config or the lock to make a redesign pass.

When a redesign introduces a new control worth locking, land the UI change first (the existing lock still passes, because it only requires what is already listed), then add the new landmark in a lock-only pull request. Design tooling such as measuring scripts is not UI either; it goes in its own pull request.

## Lock format
```json
{ "id": "action-send", "label": "Send" }
{ "id": "status-pill-", "match": "prefix", "labels": ["Waiting", "Sent"], "optional": true, "order": false }
{ "id": "limit-alert", "contains": ["over the limit"] }
```
`label` exact text, `labels` any of, `contains` substrings, `match: "prefix"` for generated ids, `optional` for controls that depend on data, `order: false` to leave a landmark out of the order check, `absent` for controls that must not appear in a state. Keys such as `x`, `y`, `width`, `height` are rejected.

## Pull request
Use `templates/pr-body.md`. Paste the guard and lock output. State interactive element counts before and after for each state.

## What this does not prove
- It checks paths, literal network-facing lines and tagged controls. It cannot prove two versions behave the same. The app's own type check and tests still run, and a person still merges.
- The network check is textual. It sees a call that is added, removed or altered on a changed line, whether the call is `fetch` or one of the app's own data functions. It does not see a change inside a data function (keep those files out of `ui`, which the audit checks), a function reached only through an object (`api.cash.get`), or a call assembled at run time.
- Data functions are found by reading top-level declarations, not by parsing. Code that is not formatted in the usual way, or an import alias that points somewhere unexpected, can hide one; `--audit --names` shows exactly what is watched, so compare it with the app once.
- The audit finds route files, data modules and an untested lock. It cannot tell whether a plain helper file calculates money or only formats a date; that is why it lists those files for a person, with the ones that mention roles, permissions or amounts first.
- The guard runs when someone runs it. Only the lock test, once it is inside the app's test command, runs on every pull request.
- It does not judge whether the new design is better. That is fe-reference, fe-variants and fe-judge.

## Hand-offs
- Which app to learn from -> fe-reference. Side-by-side options -> fe-variants. Viewport sweep -> fe-responsive. Before/after evidence -> fe-regress.

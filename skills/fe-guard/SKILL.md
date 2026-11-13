---
name: fe-guard
description: UI-only contract for changing the interface of an existing app without touching its backend. Fails a change that edits server, shared, schema, migration, auth, environment or dependency files, alters a network call, or breaks a locked landmark. Use before and after any redesign, reskin or UX change to a working SaaS or web app, when the user says "don't break the backend", "UI only", "keep the logic", or asks whether a redesign is safe to merge.
license: MIT
compatibility: Node 18+ and git. guard.mjs and lock-core.mjs have no dependencies. lock-check.mjs needs Playwright (offline, scripts disabled).
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-guard

A redesign may change how a screen looks and how many steps a task takes. It may not change what the app does. This skill turns that sentence into three checks that run on every UI change and fail loudly.

## The contract
1. **Paths.** Every changed file sits inside the app's UI folders. Nothing under the frozen paths changes: server, shared types and schema, migrations, auth, API handlers, environment, deploy config, dependencies.
2. **Network.** No line that talks to the backend is added, removed or altered. A line that moves unchanged from one UI file to another is fine.
3. **Landmarks.** Every locked control is still present, still carries its label, and still appears in the same order. Geometry is never locked, because screens reflow.

The guard config, the lock and the lock tests are protected: they change only in a pull request that changes nothing else. A redesign cannot loosen the rules it is judged by.

## Setup (once per app, in its own pull request)
1. Copy `templates/guard.example.json` to `design/guard.json`. List the real UI folders under `ui` and the real backend paths under `frozen`. Read the app's `AGENTS.md` first and add every path it marks frozen. When unsure whether a file is UI, put it in `frozen`. Add the app's own data hooks (for example `useBalance(`, `useApproveRequest(`) to `network_extra` as regular expressions, so wiring an existing hook to a new place is also caught.
2. Tag the controls that must survive with a stable attribute (`data-testid`). Tagging is itself a UI-only change.
3. Write `landmarks.lock.json` from `templates/landmarks.lock.example.json`: one entry per screen state, 5 to 12 landmarks each. Record `max_interactive` from the current screen so controls can be removed but not added.
4. Make the app's own test render each state and call `checkLock` from `scripts/lock-core.mjs`, so the lock runs inside the normal test command.

## Every UI change
```bash
node scripts/guard.mjs --base origin/<default-branch>             # while working
node scripts/guard.mjs --base origin/<default-branch> --final     # before asking for review
node scripts/lock-check.mjs --lock design/landmarks.lock.json --state <id> --html <rendered.html>
```
`guard.mjs` reads git and the working tree. It never writes, stages, commits or pushes. Exit 0 = UI-only, 1 = violation, 2 = cannot run. `--final` also fails if variant code from fe-variants is still in the tree.

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
- The network check is textual. A call made through the app's own hook or helper is caught only if that name is listed in `network_extra`, and a change inside the helper only if its file is frozen. Keep data hooks and API clients under `frozen`, and list their names.
- It does not judge whether the new design is better. That is fe-reference, fe-variants and fe-judge.

## Hand-offs
- Which app to learn from -> fe-reference. Side-by-side options -> fe-variants. Viewport sweep -> fe-responsive. Before/after evidence -> fe-regress.

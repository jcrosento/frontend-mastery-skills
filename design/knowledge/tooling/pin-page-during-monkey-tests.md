---
title: Pin the page during monkey tests
category: tooling
stack: [playwright, gremlins.js]
source: design/LESSONS.md 2026-11-08 (deep-scan crash incident)
source_type: incident
learned: 2026-11-08
proven: true
uses: 1
---
## Problem
Random clicks follow links; the page navigates; every later `page.evaluate` throws `Execution context was destroyed`.
## Recipe
1. `addInitScript`: capture-phase click listener that `preventDefault()`s any `a[href]`, blocks submit buttons when `--no-forms`, neuters `window.open`.
2. `page.route('**/*')`: abort main-frame navigation requests after the initial load; abort POSTs when `--no-forms`.
3. Wrap post-horde reads in a `safe()` helper with fallbacks; write the report in `finally`.
4. Count `navigationsBlocked` and report it; a high number means the site relies on full-page navigation for primary actions.

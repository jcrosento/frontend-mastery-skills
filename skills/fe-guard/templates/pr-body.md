## What changed for the user
<one or two plain sentences>

## UI-only proof
- [ ] `node <skills>/fe-guard/scripts/guard.mjs --base origin/<default-branch> --final` output pasted below (PASS)
- [ ] Landmarks lock test output pasted below (PASS for every state)
- [ ] Setup pull request only: `guard.mjs --audit` output pasted below (PASS, no holes) and the "check by hand" files read
- [ ] The app's own type check and test suite (PASS, with counts)

```
<paste guard output>
<paste lock output>
```

## Counts (same fixture, same state)
| State | Interactive before | Interactive after | Taps to primary action before | after |
|---|---|---|---|---|
| | | | | |

## Screens
390 px and 1280 px, before and after, for every state in the lock.

## Not in this change
No server, shared, schema, migration, auth, environment or dependency file. No network call added, removed or altered. If one is needed it goes in a separate backend pull request.

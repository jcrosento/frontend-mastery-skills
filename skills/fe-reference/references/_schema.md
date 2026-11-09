# Reference library schema

Each folder under `references/` is one studied app. It holds measurements and pattern descriptions only. Screenshots, icons, brand assets and copied text never enter this repository; they live in the venture's private design folder and are referenced by id.

## Required files
- `patterns.md` - one block per pattern (format below).
- `tokens.json` - measured values; every value has `measured_from: { shot: <id>, box: [x, y, w, h], device: <name> }`.
- `applies-to.md` - which ventures and flows benefit, and why. Written by a human, drafted by an agent.

## Pattern block format
```
### <id>  <name>
- where: <screen / state in the reference app>
- measured: <values with units, or TODO(fe-inspect) until measured>
- job: <what it does for the user, one sentence>
- maps_to: <venture>/<flow>; <venture>/<flow>
```

## Rules
- Pattern ids are stable and prefixed per app (`cs-`, `cam-`, `rev-`...). Briefs cite them; renaming breaks briefs.
- `measured` must be filled by two fe-inspect runs that agree within +/-2 px before a pattern may be cited in a brief (gate G2).
- Describe behaviour and geometry, never visual identity.

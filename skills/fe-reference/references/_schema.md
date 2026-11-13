# Reference library schema

Each folder under `references/` is one studied app. It holds measurements and pattern descriptions only. Screenshots, icons, brand assets and copied text never enter this repository; they live in the venture's private design folder and are referenced by id and file hash.

## Files
- `patterns.md` - required. One block per pattern (format below).
- `tokens.json` - required once measured. Written by `fe-inspect/scripts/measure-shot.mjs`; never edited by hand.
- `shots.json` - required once measured. The labelled manifest the tokens were measured from: app, platform, capture date, viewport, and per screenshot an id, file name, SHA-256 and the regions searched. It is the recipe to reproduce `tokens.json` for anyone holding the same screenshots.
- `applies-to.md` - which ventures and flows benefit, and why. Drafted by an agent, confirmed by a human.

A folder with only `patterns.md` is a candidate. Its patterns are descriptions, not evidence, and cannot be cited in a brief.

## Pattern block format
```
### <id>  <name>
- where: <screen / state in the reference app>
- measured: <values with units and the token names they come from, or TODO(fe-inspect) with the reason>
- job: <what it does for the user, one sentence>
- maps_to: <venture>/<flow>; <venture>/<flow>
```

## Token format (`tokens.json`)
Top level: `app`, `kind: "reference"`, `source`, `platform`, `captured`, `viewport_pt` (`[w, h]` or `null`), `viewport_basis`, `tolerance_px`, `calibration` (box and corner-radius error per image profile), `stability` (the perturbations every token was re-measured under), `tokens`.

Each token:
```json
{
  "name": "shutter.disc",
  "measured_from": { "shot": "cam-photo", "sha256": "<64 hex>", "screen": "Photo mode viewfinder", "box": [389, 1597, 145, 145], "image": [923, 2000] },
  "method": { "mode": "brighter", "threshold": 200, "search": [340, 1545, 245, 245] },
  "stability": { "variants": 20, "agreed": 20, "agreed_moved_or_grown": 18, "refused": 0, "max_delta_px": 0 },
  "fill": 0.785,
  "corner": "circle",
  "px": { "x": 389, "y": 1597, "w": 145, "h": 145, "right": 389, "bottom": 258, "radius": 72 },
  "ratio": { "w": 0.1571, "h": 0.0725 },
  "pt": { "w": 67.6, "h": 67.6, "radius": 33.5 }
}
```
`px` are screenshot pixels. `ratio` is the fraction of the screenshot's width or height and is the value to trust when the device is uncertain. `pt` is logical points and is `null` when `viewport_pt` is `null`.

`stability` records the 20 re-runs with the search box moved and grown and the threshold nudged: `agreed` returned the same box, `refused` were cut off or found nothing, and none may disagree. `agreed_moved_or_grown` must be at least 1. A token without a passing record fails gate G2 and has to be measured again with the current tool.

`radius` and `corner` (`square`, `rounded`, `capsule`, `circle`) are present only for filled shapes measured by contrast or brightness. They are absent for outlines, text and `match`-mode shapes. For a row of items the radius is that of the row's outer corners. On a resized upload a radius is good to about 1 pt.

## Rules
- Pattern ids are stable and prefixed per app (`cs-`, `cam-`, `fb-`, `gc-`...). Briefs cite them; renaming breaks briefs.
- `measured` is filled only from `tokens.json`. A pattern whose `measured` line starts with `TODO` cannot be cited (`scripts/gates.mjs --brief`).
- If part of a pattern cannot be measured (translucent surface over busy content, no screenshot of that screen), say so on the `measured` line rather than estimating.
- When the viewport is inferred, say so in `viewport_basis` and quote ratios alongside points.
- File names in `shots.json` must not reveal personal information. Screenshots that show personal documents are measured for layout only and are never described by their content.
- Describe behaviour and geometry, never visual identity.

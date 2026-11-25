---
name: fe-layers
description: "Rebuilds or migrates a site one layer at a time, like layers in a photo editor: pages, structure, colour, type, space, shape, depth, motion, interaction. Reads a reference site into a spec, then gates every page of the build per layer until it passes. Use when migrating a website or matching a reference site. Not for one screen; use fe-reference."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-layers

A photo editor keeps the background, the colour grade and the text on separate layers, so changing one cannot smudge another. A site has layers too. This skill reads them from a reference, has a person approve them, then checks the build one layer at a time, on every page, on a phone and a wide screen.

## The layers, in build order

| # | Layer | What it holds | Gate |
|---|-------|---------------|------|
| 1 | pages | Every address the old site had | Each still answers or redirects (only with `--keep-urls`) |
| 2 | structure | One h1, main, nav, footer, heading order, no sideways scroll, lang, title | Share of checks that hold, per page |
| 3 | colour | The palette | Share of text, fills and lines that use a palette colour (matched by eye distance, not by string) |
| 4 | type | Families, sizes, weights | Share of text that uses them |
| 5 | space | The spacing unit and scale | Share of gaps on it |
| 6 | shape | Corner radii, border widths | Share that match |
| 7 | depth | Shadows | Share that match exactly |
| 8 | motion | Durations, easings | Share that match; capped at 80 if anything moves and no reduced-motion rule exists |
| 9 | interaction | Focus you can see, hover that answers | Eight Tab presses and eight hovers per page |

A layer passes at 95. Its score is its worst device. Details and the reasons: `references/layers.md`.

## Rules

- The reference lends craft, not content. Take its numbers. Never take its photos, logo, words or its font files; check a font's licence before using the same family.
- A person approves the spec. `read` writes `spec.draft.json`; the gate refuses a draft. The reference's own mess (its leftovers are listed in `leftOut`) is not copied.
- One layer per change. Fix the layer the gate names, that layer only, then run the gate again. A layer that passed is locked: if a later run fails it, the verdict is REGRESSED and the last change is undone first.
- Three runs on one layer without gaining a point is STUCK (exit 3). Stop and ask the user. The spec or the approach is wrong, not the next tweak.
- Never lower a pass mark, widen a tolerance or add a value to the spec to make a run pass without the user saying so. Say which value and why.
- Read-only. The script loads pages, scrolls, presses Tab and hovers. It never clicks, types or submits, and it refuses private addresses unless told the target is a local dev server.
- On a working app, `fe-guard` still runs before any edit. This skill changes the skin, not the data.
- A pass is measured lines only. Whether the build feels right is `fe-second-eye`; the merge call is `fe-last-eye`. The model that built it does not grade it.

## Procedure

1. Read the reference (or the old site being migrated). Run it from the project, not from the skills folder:

```bash
node skills/fe-layers/scripts/layers.mjs read https://reference.example --name <name> --pages 12
```

   It needs `fe-scan` installed beside it (the read-only network guard lives there) and `playwright`; without them it exits 2 and prints the install line. It writes `design/layers/<name>/read.json` and `spec.draft.json`, and prints THIN pages, UNREAD pages and widgets it did not count (chat bubbles, cookie banners). Raise `--pages` to cover the whole sitemap before a migration.
2. Show the user the draft in plain words: the palette, the two fonts, the sizes, the unit, the radii, the shadows, the timings, and what was left out. Edit it with them, save it as `spec.json`, delete its `status` line. That deletion is the approval.
3. Colour from a board instead of the reference: after `fe-pinterest` has written `tokens.proposed.json` and the user has approved that guide,

```bash
node skills/fe-layers/scripts/layers.mjs colour design/layers/<name>/spec.json design/style-guide/<board>/tokens.proposed.json
```

   Only the colour layer changes. Type, space, shape, depth and motion stay as approved.
4. Write the spec as CSS variables, one cascade layer each, and import it once at the app root:

```bash
node skills/fe-layers/scripts/layers.mjs css design/layers/<name>/spec.json --out src/styles/layers.css
```

   Components read variables only: no raw hex, pixel size, radius, shadow or duration in a component. `templates/react.md` shows the pattern.
5. Build bottom-up. Pages and structure first with real content, then one visual layer per commit. After each, spot-check that layer (not logged):

```bash
node skills/fe-layers/scripts/layers.mjs gate http://127.0.0.1:5173 --spec design/layers/<name>/spec.json --layer type --allow-loopback-fixture
```

6. Run the full gate (logged in `runs.jsonl`) and follow its verdict line exactly. For a migration add `--keep-urls <the old site's read.json>` so dropped addresses fail until they redirect.

```bash
node skills/fe-layers/scripts/layers.mjs gate http://127.0.0.1:5173 --spec design/layers/<name>/spec.json --pages 40 --allow-loopback-fixture
```

   Exit 0 PASS, 1 FAIL or REGRESSED, 2 could not run, 3 STUCK.
7. On PASS, hand the scorecard to `fe-second-eye`, then `fe-last-eye`. Before launch run `fe-seo`, `fe-ux-audit` and `fe-perf`: this gate does not measure search, accessibility beyond the basics, or speed.

## Hand-offs

| Need | Skill |
|------|-------|
| Colour, type and mood from a Pinterest board | `fe-pinterest`, then step 3 |
| One screen's layout or an app's interaction grammar | `fe-inspect`, `fe-reference` |
| Real tokens and components from the spec | `fe-system` |
| How things should move, beyond durations | `fe-motion` |
| Pixel comparison of a screen before and after | `fe-regress` |
| Redirects, titles, schema for the migration | `fe-seo` |

## What you write

`design/layers/<name>/read.json`, `spec.draft.json`, `scorecard.json` and `runs.jsonl` come from the script. You and the user write `spec.json`. The `css` command writes one stylesheet where you point it. Nothing else changes.

## Limits

It counts computed styles, so it knows a button is 15px, not that it looks wrong. It does not judge imagery, copy, layout composition or taste. Pages behind a login, a menu or a click are not reached. Hover is checked on eight controls a page, not all. Tested on a local fixture site and one live WordPress site; treat a first run on a new stack as a reason to look, not a ruling.

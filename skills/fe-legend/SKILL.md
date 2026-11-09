---
name: fe-legend
description: Pixel-level analysis of a reference poster or map legend (race route posters, infographics, wayfinding). Crops the legend/badge/stats regions, extracts palette, tile sizes, row pitch, icon shapes and label typography into a legend-spec JSON, then proposes improvements and rebuilds the legend as editable SVG/CSS tokens. Use when the user says "copy this legend", "match this poster", or supplies a reference image plus route data (GPX/TCX).
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-legend

Copy the system, not the pixels. Measure first, then improve.

## Inputs
Reference image(s) (PNG/JPG), optional GPX/TCX for the route, brand kit if any, `design/knowledge/`.

## Procedure
1. **Locate regions.** Run `scripts/analyze_legend.py <image>` or hand-box them: legend, title block, km/turning badges, stats bar, elevation profile, footer. Record each bbox in px and as % of canvas.
2. **Palette.** K-means (k=8) on the full canvas, then k=3 per region. Name roles: bg_deep, bg_land, sea, panel, accent, route, badge, text, muted. Check WCAG contrast of text on its panel (target >= 4.5:1).
3. **Legend geometry.** From the saturated-pixel mask inside the legend bbox measure: row count, row pitch, icon tile size, tile radius, icon-to-label gap, label x-height. Express everything as multiples of a base unit (usually tile/4).
4. **Icon grammar.** For each row describe shape + tile color + glyph (e.g. "white drop on cyan tile", "white cross on red tile", "U-turn arrow on green tile", "HS" sub-tag). Note which icons repeat on the map so the legend matches the markers 1:1.
5. **Badge grammar.** Turning-point / km badges: two-block pill (km label block + name block), chip icon, font weight, letter-spacing, pointer leader to the map.
6. **Stats + profile.** Field order, label/value weight, profile fill vs stroke, tick strategy (min/max only vs regular).
7. **Write `design/legend/<ref>.json`** with all tokens (see `templates/legend-spec.json`).
8. **Critique and improve** (score 1-5 each): legibility at print size, icon/map consistency, hierarchy, color count, editability. Propose max 5 concrete changes; keep what already works.
9. **Rebuild** as SVG `<symbol>`s + CSS custom properties from the JSON so fe-build / fe-editable can drop it into any poster. Route and markers must come from GPX coordinates (Web Mercator), never from an image model.

## Output
- `design/legend/<ref>.json` tokens
- `design/legend/<ref>-critique.md` with score table and improvement list
- `design/legend/legend.svg` + `legend.css` editable rebuild
- Optional: `route.svg` plotted from GPX with km ticks, start/finish, aid-station markers using the same symbols

## Guardrails
- Never claim an exact font family from pixels; give class + metrics and offer 2 candidates.
- Do not copy logos, sponsor marks or mascots from the reference.
- Keep icon count <= 6; merge rare categories.

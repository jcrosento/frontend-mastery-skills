---
name: fe-extract
description: Turn an inspection report, screenshot or existing codebase into a design token set and DESIGN.md (colors, type scale, spacing, radius, shadow, motion, grid, voice). Use after fe-inspect, when the user asks for a design system, style guide, tokens, or wants a consistent look across pages or sites.
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-extract

Goal: `design/tokens.json` (W3C Design Tokens format) + `design/DESIGN.md` that every build step reads.

## Procedure
1. Read `design/inspection/*.md` or scan existing CSS/Tailwind/ACSS for repeated values.
2. Define primitives: color ramps (50–950) for brand, neutral, accent, success/warn/error; type families (display, text, mono); a modular type scale (name the ratio, e.g. 1.25); spacing scale on a 4px base; radius; shadow; z-index; durations (fast 150ms, base 250ms, slow 500ms) and easings (standard, emphasized, exit).
3. Define semantic aliases: `bg.canvas`, `bg.surface`, `text.primary`, `text.muted`, `border.subtle`, `accent.default`, `accent.hover`, `focus.ring`.
4. Verify contrast: body text ≥ 4.5:1, large text ≥ 3:1, UI borders ≥ 3:1. Adjust ramps, not usage.
5. Define layout: container widths per breakpoint, grid columns, gutter, section padding scale.
6. Define motion principles in 5 lines (what moves, what never moves, reduced-motion fallback).
7. Write DESIGN.md: point of view, audience, anti-references, do/don't list, component inventory.

## Output format
`tokens.json` uses `{ "color": { "brand": { "500": { "$value": "#...", "$type": "color" } } } }`. Keep semantic tokens as references: `{ "$value": "{color.brand.500}" }`.

## Rules
- Never introduce a value that is not in the scale. If you need one, extend the scale and say why.
- One accent. If the reference has two, pick the dominant one and demote the other to a state color.

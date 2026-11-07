---
name: fe-build
description: Build production front-end sections and components in Astro, React (or Astro + React islands) or Bricks Builder that are distinctive, accessible and slop-free, using the project's tokens and DESIGN.md. Use when the user asks to build, code, implement, redesign or vibe-code a page, landing page, hero, section or component.
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-build

## Before writing code
1. Read `design/DESIGN.md` and `design/tokens.json`. If missing, run fe-extract first.
2. State the point of view in one line (e.g. "editorial, oversized serif, generous whitespace, one electric accent").
3. Sketch the section in text: grid, content order, hierarchy, the one moment of delight.

## Astro defaults
- `.astro` components, zero JS unless needed; `client:visible` islands for interactive parts.
- `<Image />` from `astro:assets` with explicit dimensions; `loading="eager" fetchpriority="high"` only for the LCP image.
- Fonts: self-host 2 families max, `font-display: swap`, preload the display woff2, subset.
- Semantic landmarks: header, nav, main, section with heading, footer. One h1.

## React defaults
- Server components / static where possible; client components only for state.
- Co-locate styles via Tailwind tokens or CSS modules; no inline magic numbers.
- Motion via Motion (`motion/react`) with `useReducedMotion`.

## Bricks Builder defaults
- Structure: Section → Container → Block; never nest containers for spacing, use ACSS section/space classes.
- Global classes over ID styles; BEM-ish names (`c-card__title`).
- Interactions via Bricks Interactions or a single enqueued GSAP file; no inline scripts per element.

## Slop checklist (must all be false before done)
- Centered hero + 3 icon cards + testimonial carousel with nothing distinctive.
- Gradient text on a dark background with purple-blue glow.
- Gray text on colored surface; identical 8px spacing everywhere.
- Placeholder copy ("Lorem", "Unlock the power of", "Seamlessly").
- Missing focus-visible, missing alt, missing empty/loading states.

## Done means
`fe-responsive`, `fe-perf` and `fe-judge` have been run and their reports are saved under `design/reports/`.

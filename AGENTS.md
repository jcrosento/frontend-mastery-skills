# AGENTS.md — Front-end mastery orchestration

You are a senior front-end engineer and art director. Follow these rules whenever you touch UI in this project.

## Order of operations
1. If a reference (URL, image, Figma) is given, run `fe-inspect` first. Never build from a vague description of the reference.
2. Run `fe-extract` to produce `design/tokens.json` and `design/DESIGN.md`. If they already exist, read them, do not re-invent.
3. Run `fe-system` to compile tokens into the target (CSS vars, Tailwind theme, Automatic.css settings, Figma variables).
4. Build with `fe-build`. Add motion with `fe-motion` only after layout is stable.
5. Before claiming done: `fe-responsive` → `fe-perf` → `fe-judge`. All three must pass.

## Hard rules
- No default fonts (Inter, Roboto, Arial, system-ui) unless the brief demands it. Choose a display + text pairing with intent.
- No gray text on colored backgrounds, no 8px-only spacing, no 3-column feature grid with icon-title-text unless justified.
- Every interactive element has hover, focus-visible, active and disabled states.
- `prefers-reduced-motion` is always respected.
- Images: explicit width/height or aspect-ratio, modern formats, lazy below the fold, LCP image preloaded.
- Measure with tools (Playwright, Lighthouse, computed styles). Never state a pixel value you did not measure.

## Stack defaults
- Astro for marketing / content sites (islands for interactivity).
- React (or Astro + React island) when state-heavy UI is needed.
- Bricks Builder + Automatic.css when the client must edit in WordPress.
- Motion: CSS first, then Motion (framer-motion) or GSAP + ScrollTrigger for scroll choreography.

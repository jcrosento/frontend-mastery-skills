---
name: fe-responsive
description: Multi-device responsiveness audit and fix — viewport sweep at 320/390/768/1024/1280/1920, 200% zoom, landscape, touch targets, horizontal overflow, fluid type, container queries. Use when the user asks to check mobile, make responsive, test devices, or before shipping any page.
license: MIT
compatibility: Uses Playwright (MCP or node) for screenshots and DOM checks.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-responsive

## Sweep
For each width in `../fe-inspect/references/breakpoints.md` plus 200% zoom at 1280:
1. Screenshot fold + full page.
2. Check `document.documentElement.scrollWidth <= innerWidth` (no horizontal overflow).
3. Check all tap targets ≥ 44×44 px with ≥ 8px spacing.
4. Check text ≥ 16px body on mobile, line length 45–75ch, no clipped headings.
5. Check images keep aspect ratio, no stretched or cropped faces.
6. Check nav works: menu opens, closes, traps focus, closes on Esc.
7. Check forms: inputs ≥ 16px font (prevents iOS zoom), labels visible, errors inline.
8. Check `100vh` issues → use `100dvh`/`svh`.

## Fix patterns
- Fluid type: `font-size: clamp(min, calc(vw-based), max)` generated from the scale.
- Prefer `grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr))` over fixed breakpoints.
- Use container queries for components; media queries only for page layout.
- Reorder with `order` or DOM order, never with absolute positioning.

## Output
`design/reports/responsive.md`: table of breakpoint → pass/fail per check → screenshot link → fix applied. Status is PASS only when every row passes.

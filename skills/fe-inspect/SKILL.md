---
name: fe-inspect
description: Pixel-by-pixel, element-by-element, device-by-device inspection of a reference website, screenshot, photo or Figma frame. Use when the user shares an inspiration link or image, says "make it look like this", asks to study, measure, tear down or clone a site's UI, or before any front-end build that has a reference.
license: MIT
compatibility: Best with Playwright MCP or a browser tool for live URLs; image analysis for photos/screenshots; Figma MCP for Figma links.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-inspect

Goal: produce an **Inspection Report** so precise that a developer could rebuild the reference without seeing it.

## Inputs
- URL → use Playwright (navigate, snapshot, take_screenshot fullPage and per element, evaluate getComputedStyle).
- Screenshot / photo → analyze the image; estimate with stated confidence; state the assumed canvas width.
- Figma link → use Figma MCP `get_design_context` / variables; treat values as exact.

## Procedure
1. Capture at every breakpoint in `references/breakpoints.md` (320, 390, 768, 1024, 1280, 1920). Full page + above-the-fold. Use device scale 2.
2. Section map: list sections top-to-bottom with height, background, container max-width, padding, column count per breakpoint.
3. Typography: for h1, h2, h3, body, caption, nav, button → font-family, weight, size, line-height, letter-spacing, color, max line length (ch). Note the type scale ratio.
4. Spacing rhythm: measure vertical gaps between sections and within cards. Derive the base unit (4/8) and scale.
5. Color: extract background, surface, text, accent, border, state colors. Give hex and contrast ratios against their backgrounds.
6. Components: nav, hero, cards, buttons (all states), forms, footer. Record radius, shadow, border, icon size, hover/focus behaviour.
7. Motion: record scroll-triggered reveals, parallax, hover transitions, page transitions, durations and easings (read from computed styles or transition events). Note libraries detected (GSAP, Lenis, Motion, Swiper, Three.js).
8. Imagery: aspect ratios, treatment (duotone, grain, overlay), art direction per breakpoint.
9. Responsive behaviour: what collapses, reorders, hides or changes type size at each breakpoint.
10. Performance snapshot: request count, total weight, LCP element, fonts loaded.
11. Point of view: in 2 sentences, name what makes this reference distinctive and what to steal vs avoid.

## Output
Write `design/inspection/<slug>.md` using this structure: Summary → Breakpoint screenshots table → Section map → Typography table → Spacing → Color table → Components → Motion → Imagery → Responsive notes → Perf snapshot → POV. Save screenshots to `design/inspection/<slug>/`.

Run `scripts/capture.mjs <url> <slug>` to automate steps 1 and 10 when Node + Playwright are available.

## Rules
- Every number must be measured or explicitly flagged as estimated.
- Never copy copyrighted copy or imagery; describe treatment, not content.
- Report findings in a table, not prose, wherever there are 3+ values.

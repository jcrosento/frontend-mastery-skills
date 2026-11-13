---
name: fe-inspect
description: Pixel-by-pixel, element-by-element, device-by-device inspection of a reference website, screenshot, photo or Figma frame. Use when the user shares an inspiration link or image, says "make it look like this", asks to study, measure, tear down or clone a site's UI, or before any front-end build that has a reference.
license: MIT
compatibility: Best with Playwright MCP or a browser tool for live URLs; image analysis for photos/screenshots; Figma MCP for Figma links.
metadata:
  author: jcrosento
  version: "0.2.0"
---

# fe-inspect

Goal: produce an **Inspection Report** so precise that a developer could rebuild the reference without seeing it.

## Inputs
- URL → use Playwright (navigate, snapshot, take_screenshot fullPage and per element, evaluate getComputedStyle).
- Screenshot / photo → measure with `scripts/measure-shot.mjs` (see "Screenshots of apps" below). Eyeballed numbers are not measurements and may not enter `tokens.json`.
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

## Screenshots of apps
Native apps have no DOM to read, so geometry comes from pixels. `scripts/measure-shot.mjs` takes a labelled manifest and writes `tokens.json`. You propose a rough search box per element; the pixels decide the final box.

```bash
node scripts/measure-shot.mjs --hash <file>                    # hash to record in the manifest
node scripts/measure-shot.mjs --calibrate                      # prove the measurer on known geometry
node scripts/measure-shot.mjs --manifest design/reference/<app>/shots.json --project <product> --overlay
```

Manifest (`shots.json`, next to the screenshots in the venture's private design folder):
```json
{
  "app": "ios-camera", "kind": "reference", "source": "user-capture",
  "platform": "iOS 26 Camera", "captured": "2026-11-13",
  "viewport_pt": [430, 932], "viewport_basis": "iPhone 15 Pro Max, stated by the owner",
  "shots": [
    { "id": "cam-photo", "file": "IMG_7031.jpeg", "sha256": "<64 hex>", "screen": "Photo mode viewfinder",
      "regions": [ { "name": "shutter.disc", "search": [340, 1545, 245, 245], "mode": "brighter", "threshold": 200 } ] }
  ]
}
```

The run is refused, and no tokens are written, when:
- `app`, `platform`, `screen` or `file` is missing or a placeholder (`TODO`, `<folder>`, `[TBD]`, `example`).
- `kind` is not `reference`, or `app` names the product passed as `--project`. A product's own screenshots are a baseline for fe-scan, never a reference.
- A file's content does not match its recorded `sha256` (the screenshot was swapped after it was labelled).
- The built-in calibration image (known shapes, drawn large, downscaled and JPEG-compressed like a phone upload) is not reproduced within +/-2 px.
- A box is not found, or touches the edge of its search area (widen the search; do not accept a clipped box).

Region modes: `contrast` (differs from the ring around the search box), `brighter` / `darker` (luma threshold), `match` (same colour as a sampled point; use it for a filled shape that touches other colours). `split: "x"` lists the separate items in a row, for chip and icon spacing.

Output per token: pixel box, `ratio` (fraction of screen width and height), and `pt` when the viewport is known. Set `viewport_pt` to `null` when the device is unknown; `pt` is then `null`, never guessed. If the viewport is inferred, say from what in `viewport_basis`.

Always open the `--overlay` images and confirm each pink box sits on the element you named. The overlay is written even when the run is refused, so you can see why. A box on the wrong element is a wrong measurement no matter how precise.

Limits, stated honestly: this measures position and size. It does not read type size, colour, radius or motion, and it cannot isolate translucent surfaces over busy content; record those as unmeasured.

## Rules
- Every number must be measured or explicitly flagged as estimated.
- Screenshots of third-party apps stay in the venture's private design folder. Only measurements enter a repository.
- Never copy copyrighted copy or imagery; describe treatment, not content.
- Report findings in a table, not prose, wherever there are 3+ values.

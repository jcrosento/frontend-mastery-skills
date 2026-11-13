---
name: fe-inspect
description: Pixel-by-pixel, element-by-element, device-by-device inspection of a reference website, screenshot, photo or Figma frame. Use when the user shares an inspiration link or image, says "make it look like this", asks to study, measure, tear down or clone a site's UI, or before any front-end build that has a reference.
license: MIT
compatibility: Best with Playwright MCP or a browser tool for live URLs; image analysis for photos/screenshots; Figma MCP for Figma links.
metadata:
  author: jcrosento
  version: "0.3.0"
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
Native apps have no DOM to read, so geometry comes from pixels. `scripts/measure-shot.mjs` takes a labelled manifest and writes `tokens.json`. You propose a rough search box per element; the pixels decide the final box, and the box only counts if it comes back unchanged when the search box is moved.

Work in this order. Do not skip step 2: a search box guessed from the bare screenshot is the main source of wrong measurements.
```bash
node scripts/measure-shot.mjs --device <file>                  # 1. which phone screens fit this screenshot
node scripts/measure-shot.mjs --grid <file> --out grid.png     # 2. numbered pixel grid; read search boxes off it
node scripts/measure-shot.mjs --hash <file>                    # 3. hash to record in the manifest
node scripts/measure-shot.mjs --manifest design/reference/<app>/shots.json --project <product> --overlay   # 4. measure
node scripts/measure-shot.mjs --calibrate                      # the calibration on its own (step 4 always runs it)
```
`--device` settles the screen size only for an untouched screenshot, whose pixel size is the phone's own. A screenshot resized by a chat or upload usually fits several phones (a 923 x 2000 upload fits the 375, 393 and 430 pt wide iPhones). Then ask the owner which phone took it; if nobody knows, set `"viewport_pt": null`.

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
- The built-in calibration fails. It draws known shapes (capsule, circle, chip, square card, two touching cells) on five kinds of image: lossless, JPEG, a 1290 px iPhone screen downscaled to 923 px, a 1080 px Android screen, and a light theme downscaled. Every box and every corner radius must come back within +/-2 px.
- A box is not found, or touches the edge of its search area (widen the search; do not accept a clipped box).
- A box is **not stable**. Every region is measured again 20 times: the search box moved 6 and 12 px in eight directions, grown by 8 and 16 px, and the threshold nudged up and down by 15%. A re-run that is cut off or finds nothing is ignored; one that returns a different box (more than 2 px) with no warning refuses the region. So does a region that no moved or grown box could confirm: leave about 20 px of margin around the element.

When a region is refused as not stable, the message says which re-run disagreed and what it found. Two causes, two fixes:
- Something else inside the search area also matches (a label, a speck, a neighbouring control). Tighten `search`, or add `"pick": "largest"` to keep only the biggest connected shape. Leave `pick` out for a row of separate items such as chips.
- The threshold sits on an edge, where a slightly lower or higher value picks a ring or halo around the shape. Try a few values, find the range that gives one answer, and use the middle of it.

Region options: `mode` is `contrast` (differs from the ring around the search box), `brighter` / `darker` (luma threshold) or `match` (same colour as a sampled point; use it for a filled shape that touches other colours). `split: "x"` lists the separate items in a row, for chip and icon spacing. `pick` is `all` (default) or `largest`.

Output per token: pixel box, `ratio` (fraction of screen width and height), `pt` when the viewport is known, and the `stability` record. For a filled shape it also gives the corner `radius` and names the `corner` (`square`, `rounded`, `capsule`, `circle`). For a row of items the radius is that of the outer corners of the first and last item. Outlines, text and `match`-mode shapes get no radius: JPEG colour bleed rounds a square corner by 2 to 4 px in that mode, so the number would be wrong. Set `viewport_pt` to `null` when the device is unknown; `pt` is then `null`, never guessed.

Always open the `--overlay` images and confirm each pink outline sits on the element you named and follows its corners; the outline is drawn with the measured radius. The overlay is written even when the run is refused, so you can see why. A box on the wrong element is a wrong measurement no matter how precise, and no check in this tool can catch a mislabelled element: that part is a human look.

Limits, stated honestly: this measures position, size and the corner radius of filled shapes. It does not read type size, colour, stroke width or motion, and it cannot isolate translucent surfaces over busy content; record those as unmeasured. Radii are good to about 1 pt on a resized upload, so treat a 4 pt radius as "small", not as exactly 4.

## Rules
- Every number must be measured or explicitly flagged as estimated.
- Screenshots of third-party apps stay in the venture's private design folder. Only measurements enter a repository.
- Never copy copyrighted copy or imagery; describe treatment, not content.
- Report findings in a table, not prose, wherever there are 3+ values.

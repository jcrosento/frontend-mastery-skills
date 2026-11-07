---
name: fe-scan
description: Deep automated scan of a live URL. Visits every page on real device profiles, screenshots section by section, measures every section's box model (padding, margin, gap, height, type sizes), walks the user flows (nav, CTA, forms, booking/checkout), runs monkey/fuzz testing with gremlins.js, records console/network errors, generates predicted attention + click heatmaps, captures a performance trace to find the real bottleneck (long tasks, render-blocking, LCP chain, third parties), and pulls PageSpeed Insights lab + CrUX field data. Outputs a graded scan report. Use when the user pastes a URL and asks to test, scan, grade, find bottlenecks, check speed, try the flow, or see how it behaves on devices.
license: MIT
compatibility: Node 18+, Playwright with Chromium (npx playwright install chromium), gremlins.js (npm i gremlins.js), optional PSI_API_KEY for PageSpeed Insights (25k req/day free) and CRUX_API_KEY for field data. Scripts in scripts/.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-scan

One URL in, one graded report out. The agent must run the scripts, read the artifacts, and then interpret; never grade from a single desktop screenshot.

## What a scan does (in order)
1. **Discover pages**: sitemap.xml -> fallback crawl of internal links (max 25 pages, prioritize home, services, booking, contact, top blog).
2. **Device matrix**: Pixel 7 (412x915 @2.6), iPhone 14 (390x844 @3), iPad gen 7 (810x1080 @2), Laptop 1366x768 @1, Desktop 1920x1080 @1. Throttle mobile to Slow 4G + 4x CPU for timing runs.
3. **Section census**: for every `section, header, footer, main > *` compute: bounding box, padding/margin/gap (computed), background, heading level + font-size/line-height, image count and intrinsic vs rendered size, CTA count, text contrast sample. Screenshot each section at each device and full page. Flag: padding not on 4px scale, section height > 2 viewports on mobile, text < 16px, tap targets < 44px, overflow-x, images scaled > 2x.
4. **Flow walk**: open and close every nav menu; click each primary CTA and record destination + time to interactive; fill every form with valid then invalid data and record validation feedback; walk booking/checkout to the last step before payment; test back button, deep links, 404. Record each step with screenshot + ms.
5. **Monkey test**: gremlins.js horde (clicker, toucher, formFiller, scroller, typer) for 60 s per key page per device; collect `pageerror`, console errors, failed requests, layout shift during chaos, FPS drops. Links are intercepted to stay on-site.
6. **Heatmaps**: (a) **click heatmap** from monkey + flow clicks and from the real `[href]`/`button` density; (b) **predicted attention heatmap** using a saliency heuristic (F-pattern + element size + contrast + image faces + above-fold weight) rendered as a translucent overlay on the fold screenshot; (c) **scroll-depth map** by section (what % of the page is each fold). If Hotjar/Clarity/GA4 connectors exist, pull real data and overlay instead of predicted.
7. **Performance trace**: Chrome DevTools Protocol trace on mobile profile: long tasks (> 50 ms) with attribution, render-blocking resources, LCP element + request chain, CLS sources, third-party cost, main-thread by category, unused JS/CSS bytes, image bytes above fold, fonts and FOIT/FOUT. Identify the **single biggest bottleneck** and the top 5 fixes with estimated savings.
8. **PageSpeed Insights + CrUX**: `runPagespeed` mobile + desktop for each key page (lab) and CrUX p75 LCP/INP/CLS/TTFB for URL and origin (field). Record FAST/AVERAGE/SLOW categories.
9. **Grade**: see rubric. Write report.

## Grading rubric (0-100)
| Area | Weight | PASS condition |
|------|--------|----------------|
| Speed (lab + field) | 25 | PSI mobile >= 90, CrUX p75 LCP < 2.5 s, INP < 200 ms, CLS < 0.1 |
| Responsiveness | 20 | no overflow, tap targets ok, type >= 16px, images not upscaled, no clipped headings on all 5 devices |
| Flow integrity | 20 | every CTA reaches its target, forms validate inline, checkout reaches final step, zero dead ends, back button safe |
| Robustness | 10 | monkey test: 0 uncaught errors, 0 failed requests, no layout collapse |
| Attention design | 15 | primary CTA inside top-3 predicted attention zones on mobile and desktop; one dominant focal point per fold |
| Spacing system | 10 | >= 90% of paddings/gaps on the 4px scale; <= 3 section padding presets |

## Output
`design/reports/scan/<site>/<date>/`:
- `report.md`: score card, biggest bottleneck, top 10 fixes ranked by impact, device-by-device findings, flow log, monkey log, PSI/CrUX table.
- `sections.json` and `sections.md`: per section per device measurements.
- `screens/<device>/<page>/<n>-<section>.png`, `full.png`, `fold.png`.
- `heatmaps/<page>-<device>-{click,attention,scroll}.png`.
- `trace/<page>-mobile.json` + `bottleneck.md`.
- `psi/<page>-{mobile,desktop}.json`.

## Commands
```bash
node scripts/deep-scan.mjs https://example.com --pages 10 --devices all --monkey 60
node scripts/psi.mjs https://example.com/page --strategy mobile   # needs PSI_API_KEY
```

## Hand-offs
- Spacing/type findings -> fe-consistency and fe-extract.
- Bottleneck list -> fe-perf fix procedure.
- Flow failures -> fe-build / fe-editable.
- Attention map vs CTA placement -> fe-concept and fe-judge.

## Rules
- Always scan at least 3 devices; always include one throttled mobile run.
- Report numbers with units and the device they came from.
- Predicted heatmaps are labelled PREDICTED; only analytics-backed maps are labelled MEASURED.

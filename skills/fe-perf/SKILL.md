---
name: fe-perf
description: Core Web Vitals and front-end performance gate — Lighthouse mobile ≥ 90, LCP < 2.5s, INP < 200ms, CLS < 0.1, bundle and image budgets, font loading, third-party control. Use when the user asks for speed, performance, PageSpeed, Lighthouse, Core Web Vitals, SEO readiness, or before shipping.
license: MIT
compatibility: Uses Lighthouse CLI (npx lighthouse) or PageSpeed Insights API; node 18+.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-perf

## Budgets (mobile, slow 4G)
| Metric | Budget |
|--------|--------|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| TTFB | < 800ms |
| JS shipped | < 150 KB gz (Astro marketing page: < 50 KB) |
| Images above fold | < 200 KB total, AVIF/WebP |
| Fonts | ≤ 2 families, ≤ 4 files, woff2, subset |
| Requests | < 50 |

## Procedure
1. Run `scripts/lighthouse-gate.mjs <url>` (or PSI). Save JSON to `design/reports/perf/`.
2. Identify the LCP element; ensure it is preloaded, not lazy, correct `sizes`.
3. Kill CLS: explicit dimensions, `font-display: swap` + size-adjust fallback, reserve space for embeds/ads.
4. Reduce INP: break long tasks, defer non-critical JS, avoid heavy scroll listeners (use IntersectionObserver / ScrollTrigger), debounce resize.
5. Third parties: load analytics via Partytown or after interaction; no chat widgets on first paint.
6. Cache and CDN: immutable hashed assets, HTML short TTL, Brotli.
7. Re-run until green; record before/after table in `design/reports/perf.md`.

## Astro / React / Bricks specifics
- Astro: `client:visible` not `client:load`; use `astro:assets`; enable `prefetch`.
- React: dynamic import below-the-fold islands; avoid animation libraries in the critical bundle.
- Bricks: disable unused Bricks elements, use Perfmatters or Bricks' built-in asset loading, serve images via a CDN, limit ACSS to used utilities.

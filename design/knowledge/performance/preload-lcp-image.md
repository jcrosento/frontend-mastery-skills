---
title: Preload the LCP image
category: performance
stack: [html]
source: first scan run (trace/bottleneck.md); pattern, no site metrics stored here
source_type: scan
learned: 2026-11-08
proven: true
uses: 1
---
## When to use
LCP element is an `<img>` or poster discovered late (CSS background, JS-inserted, inside a video element).
## Code / recipe
```html
<link rel="preload" as="image" href="/hero-720.webp" imagesrcset="/hero-720.webp 720w, /hero-1440.webp 1440w" imagesizes="100vw" fetchpriority="high">
<img src="/hero-720.webp" srcset="…" sizes="100vw" width="1440" height="810" fetchpriority="high" decoding="async" alt="…">
```
Never `loading="lazy"` on the LCP image. Serve AVIF/WebP sized to the rendered width.
## Pitfalls
Preloading the desktop image on mobile wastes bandwidth; use `imagesrcset`/`media`.

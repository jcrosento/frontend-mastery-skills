---
title: Reserve hero height to kill CLS
category: performance
stack: [css, astro, wordpress]
source: first scan run (trace/bottleneck.md); pattern, no site metrics stored here
source_type: scan
learned: 2026-11-08
proven: true
uses: 1
---
## When to use
Any hero with a video, poster image or late-loading font where CLS > 0.1 and the shift source is the main container.
## How it works
The browser lays out `main` at 0 height, then the poster/video/font arrives and pushes everything down. Give the container its final size before media loads.
## Code / recipe
```css
.hero { min-height: 100svh; }                 /* or */
.hero-media { aspect-ratio: 16 / 9; width: 100%; }
.hero-media img, .hero-media video { width: 100%; height: 100%; object-fit: cover; }
h1 { font-size: clamp(2rem, 6vw, 4rem); }      /* avoid font-swap reflow */
@font-face { font-display: swap; size-adjust: 102%; } /* fallback metric matching */
```
## Pitfalls
- Two heroes in the DOM (mobile/desktop variants) double the shift; render one.
- `100vh` on mobile jumps with the address bar; use `svh`/`dvh`.
## Remix ideas
Use the reserved space for a 1-color LQIP background pulled from the image's dominant color so the fold never looks empty.

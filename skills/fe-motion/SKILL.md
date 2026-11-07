---
name: fe-motion
description: Design and implement top-tier web animation — scroll choreography, hero reveals, hover micro-interactions, page transitions, smooth scroll, WebGL/3D accents — at 60fps with reduced-motion fallbacks, using CSS, Motion (framer-motion) or GSAP + ScrollTrigger. Use when the user asks for animations, motion, interactions, parallax, "out of this world", Awwwards-style or immersive effects.
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-motion

## Principles
- Motion explains: entrance shows hierarchy, hover confirms affordance, transition preserves context. If it explains nothing, delete it.
- Animate only `transform` and `opacity` (plus `clip-path`/`filter` sparingly). Never animate layout properties.
- Durations from tokens: micro 120–180ms, standard 240–320ms, expressive 500–800ms. Easing: `cubic-bezier(.2,.8,.2,1)` for enter, `cubic-bezier(.4,0,1,1)` for exit.
- Stagger 40–80ms; never more than 6 staggered items.
- `@media (prefers-reduced-motion: reduce)` → crossfade only, no parallax, no auto-play.

## Toolkit by need
| Need | Tool |
|------|------|
| Hover, focus, simple reveals | CSS transitions + `@starting-style` / View Transitions |
| Scroll-driven reveals | CSS `animation-timeline: view()` with JS fallback |
| Scroll choreography, pinning, scrub | GSAP + ScrollTrigger |
| React component motion, layout animations | Motion (`motion/react`) |
| Smooth scroll | Lenis (disable on reduced-motion / touch if it hurts INP) |
| 3D / shader accent | Three.js / React Three Fiber, lazy-loaded, capped DPR 1.5 |
| Text splitting | SplitType or GSAP SplitText; preserve accessibility with aria-label on the parent |

## Procedure
1. Write `design/motion-spec.md`: table of element → trigger → property → duration → easing → reduced-motion fallback.
2. Implement, then record a Performance trace while scrolling the full page; long tasks must be < 50ms, no layout thrash.
3. Verify with fe-perf that INP stays < 200ms and CLS unchanged.

## Signature moves worth stealing
- Hero: masked text rise + image scale from 1.08→1 over 900ms.
- Cards: magnetic hover (translate ≤ 6px) + shadow lift.
- Section transitions: color-mode shift of `--bg` tied to scroll progress.
- Images: clip-path wipe reveal on enter.

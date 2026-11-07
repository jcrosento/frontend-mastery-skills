---
title: 16px floor and rem scale on mobile
category: typography
stack: [css]
source: first scan run (deep-scan section census); pattern, no site metrics stored here
source_type: scan
learned: 2026-11-08
proven: true
uses: 1
---
## Symptom
Sizes like 16.8, 16.32, 14.72, 12.48, 11.2, 10.5 px: `em` nesting compounds; most mobile sections flagged `smallText`.
## Recipe
```css
html { font-size: 100%; }
:root { --step--1: clamp(.875rem,.85rem+.2vw,1rem); --step-0: clamp(1rem,.95rem+.4vw,1.125rem); --step-1: clamp(1.25rem,1.1rem+.8vw,1.5rem); --step-2: clamp(1.5rem,1.3rem+1.2vw,2rem); --step-3: clamp(2rem,1.6rem+2vw,3rem); --step-4: clamp(2.5rem,2rem+3vw,4rem); }
body { font-size: var(--step-0); line-height: 1.6; }
small, .caption { font-size: var(--step--1); }   /* never below .875rem */
```
Use `rem`, never nested `em`, for font sizes. Inputs >= 16 px to stop iOS zoom.

---
name: fe-competitor
description: "Deep competitor and market analysis for websites: UX flows, conversion patterns, information architecture, visual positioning, SEO structure, performance, trust signals, and exploitable gaps. Use when the user names competitors, asks to benchmark, differentiate, beat, outrank or out-design other sites, or before fe-concept on a commercial project."
license: MIT
compatibility: Uses Playwright for capture and Lighthouse/PSI for speed; optionally Search Console / Analytics connectors for own-site data.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-competitor

Goal: a report that tells us exactly where competitors are strong, where they are weak, and the 3 moves that make us clearly better.

## Procedure
1. Select 3 to 6 competitors (direct, aspirational, adjacent). Record why each was chosen.
2. For each, run `fe-inspect` light mode (390 + 1440 screenshots, type, color, section map) and a Lighthouse mobile run.
3. Map the funnel: landing -> key pages -> primary CTA -> booking/checkout/contact. Count clicks, fields, and friction points.
4. Score each competitor 1-5 on: visual distinctiveness, clarity of offer, trust signals (reviews, credentials, photos), mobile UX, speed, SEO structure (titles, H1s, schema, internal links), content depth, conversion design.
5. Extract patterns: what everyone does (table stakes), what only the best do (differentiators), what nobody does (white space).
6. Identify 3 gaps we can own, each with evidence and a concrete design move.
7. Record their best techniques as knowledge cards via fe-learn format.

## Output
`design/competitors/<date>-report.md`:
- Competitor matrix (table) with scores and screenshots
- Funnel comparison table
- Table stakes / Differentiators / White space lists
- 3 moves to own, each with a one-line concept
- Appendix: Lighthouse numbers, fonts, colors, libraries detected

## Rules
- Never copy copy or imagery. Learn patterns, build our own.
- Separate observation (what they did) from inference (why) and recommendation (what we do).

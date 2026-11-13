---
name: fe-consistency
description: "Enforce design and content consistency across every page and every site: one color palette, one typography system, one icon set, one spacing scale, one header/footer, consistent buttons, cards, forms, image treatment, naming and SEO patterns. Produces a consistency score and an auto-fix plan for Elementor, Bricks, Astro or React. Use when the user says things look inconsistent, wants to unify multiple sites, or after fe-wp-audit / fe-extract."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-consistency

Consistency is a system property, not a style choice. The rule: every visible value must trace back to a token, class or template.

## Consistency dimensions and targets
| Dimension | Target | How to measure |
|-----------|--------|----------------|
| Color | <= 1 brand palette (12 ramps max), 100% of controls bound to globals/tokens | fe-wp-audit `globalBindingRatio`; live crawl distinct computed colors <= 24 |
| Typography | <= 2 families (+1 mono), 1 modular scale, fluid sizes | distinct font-family <= 3; distinct font-size <= 10 per breakpoint |
| Spacing | 1 scale (4px base), section padding from 3 presets | distinct padding/margin values <= 16 |
| Radius / shadow | <= 3 radii, <= 3 shadows | computed style census |
| Icons | 1 icon library, 1 stroke weight, 2 sizes | fe-wp-audit `iconLibraries.length === 1`; SVG stroke widths equal |
| Buttons | <= 3 variants x 3 sizes, identical states | class census + screenshot grid |
| Cards / sections | reusable components or templates, no page-only variants | library usage count vs inline duplicates |
| Header / footer | 1 template each (+ 1 landing variant), identical nav order | template conditions audit |
| Imagery | 1 crop ratio set, 1 treatment (grade/overlay), WebP/AVIF | media census |
| Content | title/meta pattern, H1 pattern, CTA wording, alt text pattern | regex over crawl |
| Naming | classes `c-block__element--modifier`, templates `site-header`, media `brand-subject-descriptor.webp` | lint |

## Procedure
1. Collect census: run fe-wp-audit (WordPress) or a Playwright computed-style census (any site) across all templates.
2. Compute the score: each dimension PASS/WARN/FAIL against targets; overall = % PASS.
3. Build the **canonical set** from `design/tokens.json` (create via fe-extract if missing). Where the site has 7 near-identical blues, pick 1 and map the other 6 to it.
4. Write the mapping table: old value -> token/global/class, with the pages affected.
5. Generate the fix plan per platform:
   - **Elementor**: define globals in Site Settings; replace literal values by binding controls to `globals/colors?id=...` (edit kit JSON + page JSON then re-import, or use Finder + manual bind for small sites); convert repeated sections to Global Widgets / saved templates; set Theme Style defaults; one header/footer in Theme Builder.
   - **Bricks**: create variables + color palette from tokens (or import ACSS settings); move ID styles to global classes; convert repeated sections to components; one Theme Style; use Icon Manager with a single set.
   - **Astro/React**: regenerate tokens.css; lint for literal hex/px (stylelint `declaration-property-value-disallowed-list`); replace inline styles.
6. Re-run the census and record before/after in `design/reports/consistency.md`.

## Multi-site mode
When the user has several sites, produce one `design/brand-system.md` and a per-site delta table (what each site must change to match). Keep site-specific accents as a single `accent` token override, never a new palette.

## Guardrails
- Never change a value on a page without recording the mapping.
- Keep a backup export before any bulk re-import.
- Done when score >= 90% and `globalBindingRatio >= 0.95`.

# Worked example: audit of a vibe-coded expedition booking site

**All figures in this file are synthetic placeholders** that illustrate the report shape. They are not the real Search Console, analytics or business numbers of any site. Real baselines live in private `design/reports/baseline/<site>/` folders and are never committed to examples.

Evidence sources the real audit used: Search Console (90 days), `trace/bottleneck.md` (throttled Pixel 7), `elements.md` (iPhone 14 + 1440), `seo/seo.md` (sitemap pages + Google Suggest), `report.md` (12 pages × 5 devices, flow walk, monkey test), `crawlers.md`.

## Verdict (shape)
Strong trust signals and a fast server, but a failing CLS from an unsized hero, no typography/token system, header tap targets failing on every device, a consent banner over the primary CTA, and a brand-heavy search profile with the money keyword cluster split across several competing URLs.

| Area | /10 | Key evidence (synthetic) |
|---|---|---|
| Visual craft | 6 | Good display/text pairing; ~10 weight combos, ~20 font sizes, ~10 radii, ~14 text colors; system font leaking into widgets |
| Interaction | 6 | Primary CTAs ~56 px with hover/focus; banner covers 2 fold CTAs; ~30 taps < 44 px; nav trigger ~17 px tall |
| Consistency | 5 | ~80% of padding on the 4 px scale; fractional em padding on tablet/laptop; duplicate hero H1/H2 |
| Conversion | 6 | 0 flow failures, 0 dead ends; hero top padding ~6× bottom pushes the offer below the fold; CTA recurs only at ~75% depth |
| Simplicity | 7 | 4-step process, explicit prices; one copy inconsistency in product count |
| Trust/Legal | 6 | Reviews, accreditation badges, operator disclosure present; Privacy/Terms/Cancellation links not visible in footer text |
| Backend readiness | 5 | Forms exist; CRM/booking hand-off not verified (no-forms mode) |
| SEO hygiene | 7 | Rich schema everywhere; robots blocks a render script; FAQPage without visible FAQ on 2 pages; ~9 long descriptions; cluster cannibalization |

## Conversion bottleneck (shape)
Search: the primary non-brand cluster earns thousands of impressions per quarter at positions 10–15 with ~1–2% CTR, split across ~7 URLs. On-page: hero padding and the consent banner delay the first tap on mobile.

## Top 10 fixes
1. Reserve hero/main height, preload the LCP poster, render one hero — target CLS < 0.1.
2. Consent banner to a bottom sheet with 44 px buttons; never over the hero CTA.
3. Consolidate the keyword cluster to two canonical pages; 301/canonical the rest; a true hub page.
4. Rewrite the high-impression, near-zero-CTR destination page for informational intent.
5. Header and close buttons to 44 px; 8 px spacing; sticky mobile CTA mid-page.
6. Type tokens: rem scale, 16 px floor, 2 families, <= 6 weights; fix system-font fallback leaks.
7. Radii to 3 values; colors to 5 tokens + alpha.
8. robots.txt: allow render-critical scripts; remove FAQPage schema where no FAQ is visible; dedupe Organization schema.
9. Titles > 60 / descriptions > 160 trimmed; rewrite CTR-failing blog titles.
10. Add visible FAQ blocks answering the Suggest questions on both money pages.

## Baseline targets (fe-regress, synthetic)
- CLS < 0.1 and LCP < 2.5 s on throttled Pixel 7, two consecutive runs.
- Cluster average position < 5; non-brand clicks +X per quarter (set from the private baseline).
- `elements.mjs`: header taps < 44 px -> 0; banner `coveredBy` -> 0.
- Flagged sections -> < 1/3 of baseline; padding on scale -> > 0.95.

## Coverage and limits
- Forms blocked (`--no-forms`); booking hand-off, confirmation and CRM steps not tested.
- Heatmaps PREDICTED only; no Clarity/GA4 overlay.
- Lab metrics single-run; CrUX/PSI not pulled (no API key).
- Crawler matrix added after the first run; challenge responses observed but not yet attributed to a specific WAF rule.

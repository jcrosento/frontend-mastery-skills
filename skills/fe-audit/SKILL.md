---
name: fe-audit
description: Audit a website the way a senior designer, UX researcher and conversion strategist would, by hand, screen by screen. Inspects typography (families, weights, sizes, line-height, tracking, hierarchy), color and contrast, corners, shadows, spacing, hover/focus/active states, buttons, tap padding, vh/vw and viewport bugs, consistency; walks every CTA and documents what happens after the click; finds the conversion bottleneck; rates simplicity and efficiency; checks headings, copy, trust, policies and legal pages; assesses readiness to connect to backend, CRM and booking systems; reviews schema, sitemap, robots, character encoding, title and meta lengths, and long-tail keyword opportunities from Google Suggest; and designs the user feedback loop. Use when the user asks for an audit, review, critique, UX teardown, why a site is not converting, or to improve an existing site.
license: MIT
compatibility: Uses fe-scan scripts (deep-scan, elements, trace, psi, seo-hygiene) for evidence; Search Console / Analytics / Clarity connectors when available; Playwright for manual-style walkthroughs.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-audit

You are three people walking through the site together: an art director with a loupe, a UX researcher with a stopwatch, and a conversion strategist with a spreadsheet. Evidence first (run fe-scan scripts), then judgment. Every finding: **what** (with measurement + screenshot), **why it matters**, **fix**, **effort**, **impact**.

## 0. Evidence pass (automated, before any opinion)
```bash
node skills/fe-scan/scripts/deep-scan.mjs <url> --pages 12 --monkey 45 --no-forms
node skills/fe-scan/scripts/elements.mjs <url>          # fonts, weights, colors, radii, shadows, states, tap padding, vh usage
node skills/fe-scan/scripts/trace.mjs <url>             # throttled mobile trace -> bottleneck.md
node skills/fe-scan/scripts/seo-hygiene.mjs <url>       # sitemap, robots, schema, titles/meta, encoding, long-tail suggestions
PSI_API_KEY=... node skills/fe-scan/scripts/psi.mjs <url> --strategy both
```

## 1. Typography (art director)
- Families in use (target <= 2 + mono). Weights in use per family (target <= 4; flag fake bold/synthetic weights, 100/200 weights on body).
- Scale: list every distinct font-size per breakpoint; it should read as a scale (ratio ~1.2-1.333), not a cloud. Body 16-18px mobile, 17-20px desktop; line-height 1.5-1.7 body, 1.05-1.25 display; measure 45-75ch.
- Hierarchy: can you tell H1 > H2 > H3 > body with eyes half-closed? One H1. Headings carry meaning, not "Welcome".
- Tracking: display slightly negative, all-caps labels +4-8%. Orphans/widows in hero. Font loading: FOIT/FOUT, swap, preload.

## 2. Color, surface, shape
- Palette census: distinct colors in use vs tokens; near-duplicates (deltaE < 5) are a consistency defect.
- Contrast: body >= 4.5:1, large/UI >= 3:1, focus ring >= 3:1 against both adjacent colors. Gray-on-color and low-alpha text are defects.
- Corners: distinct radii (target <= 3) and nesting rule (inner radius = outer - padding). Shadows: <= 3 levels, consistent light direction.
- Imagery: one treatment, correct crop per breakpoint, no stretched/upscaled, LCP image sized and preloaded.

## 3. Interaction states (UX researcher)
For every button/link/input/card: default, hover, focus-visible, active, disabled, loading, error, success. Record computed style deltas (elements.mjs). Defects: no hover change, no visible focus, hover-only affordances on touch, cursor not pointer, transitions > 300ms or none, outline: none without replacement.
- Buttons: hierarchy (one primary per view), size >= 44x44 tap, inner padding (target 12-16 / 20-28), label is a verb, consistent radius and weight.
- Tap padding: spacing between adjacent tap targets >= 8px; thumb-zone placement of the primary mobile CTA (bottom 40% of screen or sticky).
- Viewport units: `100vh` heroes on mobile (address-bar jump) -> `100svh/dvh`; `vw` type without clamp; fixed elements covering content; iOS input zoom (font < 16px).
- Motion: respects reduced-motion; nothing animates layout properties; no autoplay carousels with text.

## 4. Consistency
Run fe-consistency targets against elements.mjs census: families, weights, sizes, colors, radii, shadows, button variants, icon set, header/footer sameness across pages, spacing presets. Score and list the 10 worst offenders with page + selector.

## 5. The click and after the click (conversion strategist)
For each primary CTA on each key page:
1. Label, position (fold %, thumb zone), visual weight vs competitors on the page.
2. Click -> destination, load time, what the user sees first, does the promise match (message match), is the next step obvious?
3. Form or booking: fields count (target <= 5 for lead, progressive for booking), required marks, input types (tel/email/date), autofill, inline validation, error wording, success state, confirmation email/SMS, calendar/CRM hand-off, what happens on failure, back button safety, abandonment recovery.
4. Dead ends: pages with no CTA, 404s, external links in the money path, phone numbers not tappable, WhatsApp/Messenger links broken on desktop.
5. Funnel math: sessions -> CTA clicks -> form starts -> submits -> confirmed, from GA4/Clarity when available; otherwise estimate and mark ESTIMATED. The **conversion bottleneck** is the step with the largest drop multiplied by the ease of fixing it.

## 6. Simplicity and efficiency
- Time to primary task on mobile (stopwatch, cold visitor script: "book a trip for 4 on a date"). Target < 90 s to a submitted inquiry.
- Clicks to CTA from home (target <= 2). Nav items (target 5-7). Reading level of hero copy (grade 6-8). Jargon list.
- Cognitive load per screen: one job per fold; count competing CTAs.

## 7. Content, headings, trust, legal
- Headings as a story: read only the H1-H3s top-to-bottom; does it sell? Keyword present naturally in H1 and first paragraph.
- Trust: real photos, named people, reviews with sources, certifications, safety/insurance statements for tours, price transparency, cancellation policy visible before the form.
- Legal pages present, linked in footer, dated, readable: Privacy Policy (Philippine Data Privacy Act compliance wording, cookie notice if tracking), Terms, Refund/Cancellation, Liability waiver for expeditions, Contact with address + registration number. Payment pages: SSL, provider badges, clear currency.

## 8. Backend, CRM and booking readiness
- Every form posts to a durable destination (CRM, sheet, email + webhook) with a unique lead ID; spam protection; UTM capture; consent checkbox stored.
- Booking: availability source of truth, hold/expiry, payment provider, confirmation, calendar sync, staff notification. Map current vs target in a table (channel -> system -> owner -> SLA).
- Events: GA4/Tag Manager events for cta_click, form_start, form_submit, booking_confirmed, phone_click, chat_open. Missing events = blind funnel.

## 9. SEO hygiene (from seo-hygiene.mjs)
- Sitemap: exists, valid XML, only 200 canonical URLs, lastmod real, referenced from robots.txt, submitted in Search Console. Robots: not blocking CSS/JS or key pages.
- Schema: types per template, errors/warnings, NAP match, duplicate Organization blocks, FAQ only when visible (hand to fe-schema).
- Characters: UTF-8 declared, no mojibake (â€™, ï¿½), smart quotes consistent, no double spaces, title 50-60 chars and description 120-160 with the primary keyword early, no truncation, no duplicate titles.
- Long-tail keywords: Google Suggest expansions (alphabet soup + question words + modifiers like price, package, near, best, itinerary, how to get to) for each primary keyword; map to FAQ entries, H2s and new pages (hand to fe-keywords).

## 10. Feedback loop (keep improving)
- Instrument: Microsoft Clarity (free heatmaps + recordings) or Hotjar; GA4 funnels; Search Console weekly.
- Ask: 1-question post-inquiry survey ("What almost stopped you?"), post-trip NPS with a review link, exit-intent on pricing page.
- Cadence: weekly 30-minute review of recordings for the money path; monthly re-run of fe-scan + fe-audit; log changes and outcomes in `design/LESSONS.md`.

## Output
`design/reports/audit/<site>/<date>/audit.md`:
1. Executive verdict (3 sentences) + score card (Visual craft, Interaction, Consistency, Conversion, Simplicity, Trust/Legal, Backend readiness, SEO hygiene, each /10).
2. The conversion bottleneck (one paragraph, with numbers).
3. Top 10 fixes ranked by impact/effort, each with screenshot reference and exact change.
4. Section-by-section findings with measurements.
5. Backend/CRM readiness table and event plan.
6. Long-tail keyword and content opportunities.
7. Feedback-loop setup checklist.

## Rules
- Never say "looks fine"; say what you measured and against which target.
- Report by device; mobile first.
- Mark ESTIMATED anything not backed by analytics.

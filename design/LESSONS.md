# LESSONS.md — what the master agent learned

Format: date · context · what happened · root cause · fix · rule going forward. Business and analytics figures stay in private baseline folders, not here.

## 2026-11-08 · first real run of the scan pipeline (vibe-coded travel site)

### Tooling
- **Monkey test crashed deep-scan** (`Execution context was destroyed`). Root cause: the click guard only blocked external/_blank links, so gremlins followed an internal link and the page navigated mid-horde. Fix: preventDefault on every anchor click, abort main-frame navigations at the network layer, wrap post-horde reads in `safe()`, write the report in `finally`. Rule: anything that injects random input must pin the page.
- **Folder dates were UTC** while the operator was on PHT. Fix: `run-all.mjs` computes a local-date stamp once and passes it via `FE_SCAN_STAMP`. Rule: one stamp per run, shared by all scripts.
- **Cookie banner invalidated hover probes** (several CTAs returned `err`). Fix: `elements.mjs` probes twice — as-is (records overlay interference as a UX defect via `coveredBy`/`BLOCKED`) and after dismissing the banner. Rule: overlays are findings, not noise; measure both states.
- **Plain fetches were challenged by Cloudflare** on robots.txt/sitemap.xml and on two other sites while Googlebot was fine. Fix: `crawlers.mjs` bot-access matrix with 9 user agents and challenge detection. Rule: always test crawler access; AI search engines are now traffic.
- **`require` inside an ES module** slipped into the first draft of `run-all.mjs`; caught by `node --check` before push. Rule: `npm run check` (syntax + selftests + dry-run) before every commit to scripts.
- **Markdown pasted into zsh** (`[https://…](https://…)`) and a **root-owned npm cache** cost time. Rule: README shows copyable plain commands; `npm run setup` first.
- **Hundreds of MB pushed** because every section screenshot was committed. Fix: `.gitignore` keeps only fold.png per device plus summaries. Rule: commit evidence, not bulk.

### Design / performance (proven findings, pattern level)
- Large CLS attributed to the main container: unsized hero/video poster. Rule: every hero reserves its height (`aspect-ratio`/`min-height`) before media loads; render one hero, not mobile+desktop twins.
- LCP element was a hero poster image that was not preloaded. Rule: preload the LCP image with `fetchpriority=high`; never lazy-load it.
- Double-digit font weight combos and 20+ font sizes, several radii and text colors; system font leaking into widgets. Rule: tokens first; lint for literal values.
- Header tap targets under 44 px on every page/device; dozens of tap pairs closer than 8 px. Rule: nav and close buttons are 44 px minimum with 8 px gaps.
- Sub-16 px text on most mobile sections from nested `em`. Rule: 16 px floor, rem-based fluid scale.
- Hero top padding several times the bottom padding, pushing the offer below the fold. Rule: top/bottom padding ratio <= 2:1.
- robots.txt disallowed a script needed to render booking; FAQPage schema on pages without visible FAQ; duplicate Organization schema. Rule: seo-hygiene before every release.

### SEO / conversion (pattern level)
- Traffic was overwhelmingly brand; the money keyword cluster sat on page 2 split across many competing URLs. Rule: one intent, one URL; consolidate before writing more pages.
- A destination page with high impressions and near-zero CTR served a product page to informational intent. Rule: match the page type to the query intent.

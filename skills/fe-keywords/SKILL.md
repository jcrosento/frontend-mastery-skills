---
name: fe-keywords
description: Keyword planning and mapping from competitors and Google data: mine competitor URLs and seed terms through Google Ads Keyword Planner (generateKeywordIdeas) or the Google Ads connector, pull real queries from Google Search Console, cluster by intent, map keywords to pages and templates, and write title/H1/meta/alt patterns. Use when the user asks for keywords, keyword planner, SEO strategy, what competitors rank for, or content gaps.
license: MIT
compatibility: Works with a Google Ads connector or the Google Ads API KeywordPlanIdeaService (needs a customer ID; developer token basic access is enough), Google Search Console connector, and optionally an Apify Keyword Planner actor as a no-account fallback. Competitor pages are fetched with Playwright.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-keywords

Goal: `design/keywords/map.csv` that tells every page which keyword it owns, and the copy patterns to win it.

## Sources (use all available)
1. **Competitor seeds**: for each competitor from fe-competitor, feed their homepage and 3 key pages as `url_seed` to Keyword Planner; also extract their titles, H1s, H2s and nav labels as seed keywords.
2. **Google Ads Keyword Planner**: `KeywordPlanIdeaService.generateKeywordIdeas` with `keyword_and_url_seed`, geo target (e.g. Philippines 2608, Iloilo City if available), language English 1000 and Filipino 1042; collect `avg_monthly_searches`, `competition`, `competition_index`, `low/high_top_of_page_bid_micros`, 12-month `monthly_search_volumes` for seasonality.
3. **Google Search Console**: last 16 months of queries per page with impressions, clicks, CTR, position; find striking-distance queries (position 8-20, impressions high).
4. **SERP check**: for the top 30 candidates, fetch the SERP and note result types (local pack, images, videos, People Also Ask) and the intent of the top 3 pages.

## Procedure
1. Collect -> `design/keywords/raw.csv` (keyword, volume, competition, cpc_low, cpc_high, seasonality, source, competitor).
2. Clean: remove brand names of competitors, adult, irrelevant geos.
3. Cluster by intent and topic (informational / commercial / transactional / local; group near-duplicates and modifiers like "package", "price", "near me", "island hopping", city names).
4. Score = volume x intent weight x (1 - competition_index/100) x relevance; mark quick wins (GSC position 8-20).
5. Map: one primary keyword + 3-6 secondaries per page or template; create new page proposals for clusters with no home. Output `map.csv`: url, template, primary, secondaries, intent, volume, score, status.
6. Write patterns per template: `<title>` (<= 60 chars: Primary | Modifier | Brand), H1, meta description (120-160 chars with CTA), image alt pattern, FAQ questions from People Also Ask.
7. Hand patterns to fe-consistency (content dimension), fe-schema (FAQ, Service, TouristTrip) and fe-wp-audit fix plan.

## Output
- `design/keywords/raw.csv`, `clusters.md`, `map.csv`, `copy-patterns.md`
- A 10-line summary: biggest opportunity, quickest win, seasonality note, 3 new pages to build.

## Rules
- Volumes are estimates; prefer GSC data over Planner when both exist.
- Never stuff: one primary per page, natural language, local names spelled as locals write them.

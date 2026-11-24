---
name: fe-seo
description: "An SEO auditor's checklist mapped to scripts: who can crawl the site, sitemap and robots, canonicals, titles and meta, headings, structured data, speed, and whether AI answer engines can read it. Use when the user asks for an SEO audit, why a page is not indexed or ranking, or a pre-launch check. Not for keyword research; use fe-keywords."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-seo

An SEO audit answers four questions in order. Can a search engine reach the page? Can it understand the page? Is the page fast and usable? Does anything outside the site point at it? Stop at the first question that fails; nothing after it matters until it is fixed.

Site profile only. An app behind a login is not audited for SEO.

## The checklist, and what runs it

| # | Question | Run | A failure looks like |
|---|----------|-----|----------------------|
| 1 | Can each bot fetch the page, robots.txt and the sitemap? | `fe-scan/scripts/crawlers.mjs <url>` | A firewall challenge for Googlebot, or a disallow that hides the site from an answer engine |
| 2 | Sitemap, robots, canonical, noindex, redirects | `fe-scan/scripts/seo-hygiene.mjs <url> --pages 50` | NOINDEX on a sitemap URL, no canonical, sitemap on another origin |
| 3 | Titles, descriptions, one H1, language, encoding, duplicates, thin pages | same script | Duplicate titles, broken characters, a page under 200 words |
| 4 | Structured data present, valid and matching the visible page | same script, then `fe-schema` | Invalid JSON-LD, FAQ markup with no FAQ on the page |
| 5 | Core Web Vitals from real users, not only the lab | `fe-scan/scripts/psi.mjs <url>` (needs `PSI_API_KEY`), gate with `fe-perf` | Field LCP over 2.5s, INP over 200ms, CLS over 0.1 |
| 6 | Phone layout, tap sizes, sideways scroll | `fe-responsive`, `fe-ux-audit` | A page wider than the phone |
| 7 | What people search, and which page answers it | `fe-keywords` | Two pages competing for one query; a query with no page |
| 8 | Real impressions, clicks, indexing errors | Google Search Console. Ask the user for access or an export. | You have no data. Say so; do not estimate rankings. |
| 9 | Links pointing at the site | A backlink tool the user has. Not available here without one. | Mark as not checked. |

`seo-hygiene.mjs` reads at most `--pages` URLs from the sitemap. Say how many of how many it read.

## A second opinion that is not you

Your checklist and your reading of it share one blind spot. When the audit will decide real work, also run an outside checker and report where it disagrees:

```bash
npx --yes @seomator/seo-audit audit <url> --crawl --max-pages 50
```

It is a separate MIT-licensed tool with its own rules (https://github.com/seo-skills/seo-audit-skill). Treat it as another auditor's list, not as the truth. It makes its own requests to the site; run it only on a site the user owns.

## Procedure

1. Run rows 1 to 5 in order. If row 1 fails for Googlebot, stop and report that alone.
2. Run rows 6 and 7 through their skills when the user asked for a full audit.
3. Ask for Search Console for row 8. Without it, the audit is technical only. Write that in the first line.
4. Rank fixes: blocked or not indexed first, then wrong or duplicate signals, then speed, then content gaps.
5. Hand JSON-LD work to `fe-schema` and page-to-keyword mapping to `fe-keywords`. Do not rewrite them here.

## What you write

`design/reports/seo/<host>/<date>/seo-audit.md`:

```text
Scope: technical only | technical + Search Console
Pages read: <n> of <sitemap total>
Reach: PASS | FAIL per bot
| # | Page | Problem | Evidence (file, line or value) | Fix | Priority |
Not checked: <backlinks, Search Console, ...>
```

Never write a ranking, a traffic number or a search volume that did not come from Search Console, Keyword Planner or a tool's output.

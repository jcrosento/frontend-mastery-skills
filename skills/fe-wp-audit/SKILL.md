---
name: fe-wp-audit
description: Deeply audit a WordPress site built with Elementor or Bricks Builder. Connects via the WordPress MCP Adapter, WordPress.com MCP, REST API, or an exported Elementor Website Kit / Bricks Global Export ZIP, then inventories global colors and fonts, theme styles, templates, headers/footers, library components, icons, media (size, format, alt text, naming), titles and meta descriptions, heading structure and plugins. Use when the user asks to analyze, audit, inspect or clean up a WordPress, Elementor or Bricks site, or asks what is in the builder or library.
license: MIT
compatibility: WordPress 6.9+ with MCP Adapter plugin (HTTP at /wp-json/mcp/mcp-adapter-default-server, auth via Application Password) or WordPress.com/Jetpack MCP at https://public-api.wordpress.com/wpcom/v2/mcp/v1. Offline mode parses Elementor kit ZIP or Bricks export ZIP with scripts/wp-export-audit.mjs. Live DOM checks use Playwright.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-wp-audit

Goal: a complete inventory of what the builder actually contains, what the pages actually use, and a ranked fix plan.

## Connect (pick the first that works)
1. **MCP Adapter** (self-hosted): install `mcp-adapter` plugin, create an Application Password, add to Cursor via `@automattic/mcp-wordpress-remote` with `WP_API_URL=https://site/wp-json/mcp/mcp-adapter-default-server`. Exposes abilities registered by core and plugins.
2. **WordPress.com / Jetpack MCP**: enable at my.wordpress.com/me/preferences/mcp, connect `https://public-api.wordpress.com/wpcom/v2/mcp/v1` (OAuth 2.1). 60+ tools for posts, pages, media, settings.
3. **REST API** with Application Password: `/wp-json/wp/v2/{pages,posts,media,menus}`, `/wp-json/wp/v2/elementor_library`, Bricks `bricks_template` post type, `_elementor_data` and `_bricks_page_content_2` meta when exposed.
4. **Export ZIP** (offline, most complete for globals):
   - Elementor: Elementor -> Tools -> Import/Export (or Editor Home -> Tools -> Website Templates -> Export) with Content + Templates + Settings. The kit JSON holds global colors/fonts; pages reference them as `globals/colors?id=primary` inside `__globals__`.
   - Bricks: Builder Settings -> Import/Export -> Export bundle (classes, variables, color palettes, theme styles, components, templates, icon sets, settings) -> ZIP with `manifest.json` + JSON files. Or `wp bricks export` via katsar0v/bricks-import-export.
   Run `node scripts/wp-export-audit.mjs <zip-or-folder>` to produce the inventory JSON.
5. **Live crawl** (always, in addition): Playwright over the sitemap for rendered HTML, computed styles, images, meta, headings, schema.

## Inventory to produce
| Area | What to record |
|------|----------------|
| Globals | Elementor kit colors/fonts (built-in primary/secondary/text/accent + custom); Bricks color palettes, variables, theme styles, breakpoints |
| Global usage | % of color/typography controls bound to globals vs hard-coded hex/px (Elementor `__globals__` vs literal; Bricks global classes vs ID styles) |
| Templates | Headers, footers, single/archive templates, popups, conditions; duplicates and unused |
| Library | Saved sections/containers/components (Elementor Global Widgets, Bricks components/templates), usage count per page |
| Icons | Icon libraries used (Font Awesome, Elementor icons, Bricks icon manager, custom SVG sets); mixed sets per page |
| Media | Count, formats (WebP/AVIF vs JPG/PNG), > 300 KB files, missing dimensions, filename quality, alt text missing/generic/duplicate, unused attachments |
| Meta | Title length 50-60, description 120-160, missing/duplicate titles and descriptions, OG image, canonical |
| Headings | One H1 per page, no skipped levels, H1 contains target keyword |
| Structure | Menus, internal links depth, orphan pages, 404s, redirects |
| Schema | Existing JSON-LD types per page (hand to fe-schema) |
| Plugins | Active list, overlapping functions (two SEO plugins, two caches), builder version |
| Performance | Lighthouse mobile per template type (hand to fe-perf) |

## Output
- `design/wp-audit/<site>/inventory.json` (machine) and `inventory.md` (human) with the tables above.
- `design/wp-audit/<site>/fix-plan.md`: ranked by impact x effort: (1) bind hard-coded values to globals, (2) collapse duplicate templates, (3) unify icons, (4) media optimization + alt text, (5) meta and headings, (6) schema, (7) plugin cleanup. Each item names the exact Elementor/Bricks screen or WP-CLI/REST call to execute it.
- Hand globals to `fe-extract` so `tokens.json` becomes the source of truth for the WordPress site too.

## Tools to recommend for bulk fixes
- Alt text: Alt Audit or Filikod (audit + bulk fix inside WP), pulls focus keywords from Yoast/Rank Math.
- Images: convert to WebP/AVIF via Performance Lab or ShortPixel; set max upload 2560px; enable lazy load except LCP.
- Elementor: Site Settings -> Global Colors/Fonts; use Finder to locate elements; Theme Style for defaults; Custom Code for shared CSS.
- Bricks: Automatic.css for tokens, global classes over IDs, Frames for components, Theme Styles for defaults.

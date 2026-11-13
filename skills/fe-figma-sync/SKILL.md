---
name: fe-figma-sync
description: "Bring an existing website into Figma and keep design and code aligned: import pages with html.to.design, mirror design/tokens.json as Figma variables and components via the Figma MCP use_figma tool, and pull Figma frames into code with get_design_context. Use when the user asks to translate a site to Figma, sync Figma and code, two-way sync, or set up Figma MCP in Cursor."
license: MIT
compatibility: Requires Figma desktop with Dev Mode MCP server (or remote mcp.figma.com) and the html.to.design plugin. In Cursor run /add-plugin figma.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-figma-sync

There is no magic two-way sync. We get it by making `design/tokens.json` the source of truth and generating both sides from it.

## A. Existing site -> Figma (one-time import)
1. In Figma open the html.to.design plugin -> Web tab -> paste URL -> select viewports 390, 768, 1440 -> Import. Use the Chrome extension for localhost or logged-in pages.
2. Repeat for every key page. Name frames `page/viewport` (e.g. `home/390`).
3. Run `fe-extract` on the live site to produce `tokens.json`; do not derive tokens from the imported Figma layers (they are literal values, not a system).

## B. tokens.json -> Figma variables and components (repeatable)
Using Figma MCP `use_figma` (Plugin API JS):
1. Create or update collection `Primitives` (color ramps, spacing, radius, type sizes) and `Semantic` with modes `light` and `dark`, aliasing primitives.
2. Bind imported frames' fills/text to semantic variables where names match; log unmatched values to `design/reports/figma-unbound.md`.
3. Generate base components (Button, Card, Section, Nav) with Auto Layout and variants matching `design/components/*.md`.
4. Save the script as `scripts/figma/push-tokens.js` so it is re-runnable.

## C. Figma -> code (repeatable)
1. From a Figma frame link call `get_design_context`, `get_variable_defs`, `get_screenshot`.
2. Map every variable to an existing token; never invent a value. If a variable is missing in code, add it to `tokens.json` first, then regenerate.
3. Build the component with `fe-build`; screenshot the browser at the same viewport and compare side by side; iterate until the diff is intentional.
4. Register the mapping with Code Connect where available so future `get_design_context` calls return your real component names.

## Cursor setup
- `/add-plugin figma` or add `{"mcpServers": {"figma": {"url": "https://mcp.figma.com/mcp"}}}`.
- Add `.cursor/rules/figma.mdc`: always load `design/tokens.json`, always diff screenshots, never hard-code values from Figma.

## Output
`design/reports/figma-sync.md`: pages imported, variables created/updated, unbound values, components generated, frames implemented with before/after screenshots.

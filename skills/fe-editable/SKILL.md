---
name: fe-editable
description: "Make built sites as easy to manage as a page builder: content as structured data, component slots and variants, visual editing (Astro content collections + Keystatic/Decap, Cursor Design Mode, Bricks dynamic data), safe editing boundaries and documentation for non-developers. Use when the user wants to edit like a builder, hand off to a client, manage content, or avoid touching code for copy and images."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-editable

Goal: changing copy, images, prices or sections never requires editing markup.

## Principles
- Content is data, layout is code. Every section reads from a schema.
- Sections are composable blocks with a small, documented prop surface.
- Design tokens are the only place styling values live; editors pick variants, not values.

## Astro pattern
- `src/content/` collections with Zod schemas for pages, sections, products, trips, FAQs, testimonials.
- Page = ordered list of section blocks: `{ type: 'hero', variant: 'cinematic', ...props }`. A `<SectionRenderer />` maps type -> component.
- Visual editing: add Keystatic (Git-based, free) or Decap CMS; expose only schema fields. For live tweaks use Cursor Design Mode on the running dev server.
- Images via `astro:assets` from the collection; editors upload, build optimizes.

## React / Next pattern
- Same block schema in JSON or a headless CMS (Sanity, Payload). Components accept `variant` and `tone` props only; no className overrides from content.

## Bricks pattern
- Use Bricks global classes + ACSS variables; lock element styles behind classes so clients edit content not CSS.
- Dynamic data from ACF/MetaBox fields; templates per post type; Frames components for consistent sections.
- Enable Bricks "Builder access: content only" role for clients.

## Deliverables
1. `design/components/<Section>.md` lists editable fields and variants.
2. `EDITING.md` at repo root: how to change text, images, add a section, add a page, in plain language with screenshots.
3. Guardrails: schema validation fails the build on missing alt text, oversized images (> 400 KB) or empty required fields.

## Checklist
- Can a non-dev change hero headline, image and CTA in under 2 minutes? 
- Can they reorder sections without code?
- Does a wrong edit fail loudly at build, not silently in production?

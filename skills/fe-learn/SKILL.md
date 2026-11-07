---
name: fe-learn
description: Learn from tutorials, courses, articles, docs and videos and convert them into reusable technique cards for front-end, Figma, Astro, React, Bricks, animation and performance. Uses the /watch skill (claude-video) or transcripts for video. Use when the user shares a YouTube link, course, tutorial, article or says "learn this", "study this", "how did they do that".
license: MIT
compatibility: Best with bradautomates/claude-video (/watch) for video, fetch/browse tools for articles, Figma MCP for Figma files.
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-learn

Goal: never watch the same tutorial twice. Everything learned becomes a **technique card** the build skills can read.

## Inputs and how to ingest
| Source | Method |
|--------|--------|
| YouTube / video URL or file | `/watch <url>` (claude-video) for frames + transcript; fall back to transcript tools (tapestry-skills) |
| Article / docs / blog | fetch full page; capture code blocks verbatim |
| Course module | ingest lesson by lesson; one card per technique, not per lesson |
| Figma file | Figma MCP `get_design_context` on key frames; capture variables and component structure |
| Repo | read README + key files; note architecture decisions |

## Procedure
1. Ingest. For video, request frames at every visible UI/code change, not fixed intervals.
2. Segment into techniques (a technique = one reusable thing you could apply tomorrow).
3. For each technique write `design/knowledge/<category>/<slug>.md` with this frontmatter and body:

```md
---
title: Masked text reveal on scroll
category: motion            # layout | typography | color | motion | component | responsive | performance | content | figma | tooling | anti-pattern
stack: [css, gsap]          # css | tailwind | astro | react | bricks | acss | figma
source: https://...
source_type: video          # video | article | course | figma | repo
learned: 2026-11-08
proven: false
uses: 0
---
## When to use
## How it works (steps)
## Code / recipe
## Pitfalls
## Remix ideas (how to make it ours)
```
4. Update `design/knowledge/INDEX.md` (table: title, category, stack, proven, uses).
5. Report back: list of cards created, the single most valuable technique, and which fe-* skill should consume it.

## Quality bar
- Code snippets must run; adapt to the project's tokens where possible.
- Capture the *why* (principle) not just the *how*; principles transfer across stacks.
- If a tutorial teaches an anti-pattern (inline styles, layout-property animation, px-only type), still record it, under `category: anti-pattern`.

## Curated starting syllabus (ingest these first)
- Shift Nudge Figma 101 (free) and Shift Nudge visual design modules
- Memorisely AI Design Systems Bootcamp materials (tokens -> Figma variables -> React via MCP)
- Figma Academy 2.0 (design systems, handoff)
- Awwwards Academy motion and Figma courses
- Astro docs: content collections, islands, assets, view transitions
- GSAP ScrollTrigger docs and showcase breakdowns
- Automatic.css + Frames docs for Bricks
- web.dev Core Web Vitals guides

# frontend-mastery-skills

A **master front-end agent** that learns how to learn. It watches tutorials, studies inspirations and competitors pixel by pixel, extracts design systems, builds in Astro / React / Bricks, keeps everything editable like a builder, and refuses to ship anything that fails responsiveness, performance or an award-style jury.

Built on the open [Agent Skills spec](https://agentskills.io/specification). Works in Cursor, Claude Code, Codex, Copilot, Gemini CLI, Perplexity Computer and any client that reads `SKILL.md`. Pairs with [Impeccable](https://github.com/pbakaus/impeccable) (design vocabulary) and [claude-video](https://github.com/bradautomates/claude-video) (`/watch`).

## Install

```bash
npx skills add jcrosento/frontend-mastery-skills
npx skills add bradautomates/claude-video -g --skill watch   # video learning
npx skills add pbakaus/impeccable                            # design vocabulary
```
In Cursor also run `/add-plugin figma` and point a rule at `AGENTS.md`.

## Skill map

| Layer | Skill | Superpower |
|-------|-------|-----------|
| Orchestrate | `fe-master` | Decides which skills to run, keeps the knowledge base, compounds what it learns |
| Learn | `fe-learn` | Turns tutorials, courses, articles and videos into reusable technique cards |
| Observe | `fe-inspect` | Pixel / element / device teardown of any URL, screenshot, photo or Figma frame |
| Observe | `fe-competitor` | Deep competitor analysis: UX flows, conversion patterns, SEO, speed, gaps to exploit |
| Think | `fe-concept` | Out-of-the-box concepting: 5 directions, 1 chosen, with a signature interaction |
| System | `fe-extract` | Tokens + DESIGN.md from inspections or code |
| System | `fe-system` | Tokens -> CSS vars / Tailwind / ACSS / Figma variables + component schema |
| System | `fe-figma-sync` | Existing site -> Figma (html.to.design) and tokens <-> Figma variables via MCP |
| Build | `fe-build` | Slop-free Astro / React / Bricks implementation |
| Build | `fe-editable` | Builder-like editability: content schemas, slots, visual-edit friendly structure |
| Build | `fe-motion` | 60fps, reduced-motion-safe animation that tells a story |
| Gate | `fe-responsive` | Viewport sweep 320 -> 1920, zoom, touch, overflow |
| Gate | `fe-perf` | Core Web Vitals budgets with a failing CI gate |
| Gate | `fe-judge` | Awwwards-style 40/30/20/10 rubric + a11y + dev gates |

## The loop

```
LEARN  -> fe-learn (tutorials) + fe-inspect (inspirations) + fe-competitor (market)
THINK  -> fe-concept picks a point of view and signature move
SYSTEM -> fe-extract -> fe-system -> fe-figma-sync
BUILD  -> fe-build + fe-editable + fe-motion
GATE   -> fe-responsive -> fe-perf -> fe-judge
REFLECT-> fe-master writes what worked into design/knowledge/ so the next site starts smarter
```

## Knowledge base layout (per project)

```
design/
  knowledge/      technique cards from fe-learn (one .md per technique)
  inspection/     fe-inspect teardowns + screenshots
  competitors/    fe-competitor reports
  concepts/       fe-concept direction boards
  tokens.json     single source of truth
  DESIGN.md       point of view, rules, component inventory
  components/     component schemas
  reports/        responsive / perf / judge outputs
  LESSONS.md      fe-master retrospective log
```

## License

MIT

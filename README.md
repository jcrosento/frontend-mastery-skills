# frontend-mastery-skills

A **master front-end agent** that learns how to learn. It watches tutorials, studies inspirations and competitors pixel by pixel, deep-scans and audits live sites like a human designer (fonts, weights, states, corners, tap padding, viewport units, what happens after the CTA click, the conversion bottleneck, legal pages, CRM readiness, schema, sitemap, long-tail keywords), extracts design systems, audits WordPress builders (Elementor, Bricks) for consistency, builds in Astro / React / Bricks, keeps everything editable like a builder, and refuses to ship anything that fails responsiveness, performance, schema or an award-style jury.

Built on the open [Agent Skills spec](https://agentskills.io/specification). Works in Cursor, Claude Code, Codex, Copilot, Gemini CLI, Perplexity Computer and any client that reads `SKILL.md`. Pairs with [Impeccable](https://github.com/pbakaus/impeccable) (design vocabulary) and [claude-video](https://github.com/bradautomates/claude-video) (`/watch`).

## Install

```bash
npx skills add jcrosento/frontend-mastery-skills
npx skills add bradautomates/claude-video -g --skill watch   # video learning
npx skills add pbakaus/impeccable                            # design vocabulary
npm i -D playwright gremlins.js lighthouse && npx playwright install chromium   # for fe-scan / fe-perf scripts
```
In Cursor also run `/add-plugin figma` and point a rule at `AGENTS.md`. For WordPress sites install the **MCP Adapter** plugin (see `fe-wp-audit`). Set `PSI_API_KEY` for PageSpeed Insights.

## Skill map

| Layer | Skill | Superpower |
|-------|-------|-----------|
| Orchestrate | `fe-master` | Decides which skills to run, keeps the knowledge base, compounds what it learns |
| Learn | `fe-learn` | Turns tutorials, courses, articles and videos into reusable technique cards |
| Observe | `fe-scan` | Automated evidence: 5 device profiles, section screenshots + box-model, flow walk, monkey test (`--no-forms` safe mode), heatmaps, element census, throttled CDP trace -> bottleneck, SEO hygiene, PSI + CrUX |
| Observe | `fe-audit` | Human-designer audit on top of the evidence: typography, color, corners, states, tap padding, vh/vw, consistency, after-the-click, conversion bottleneck, simplicity, trust/legal, CRM/booking readiness, schema/sitemap/characters/long-tail, feedback loop |
| Observe | `fe-inspect` | Pixel / element / device teardown of any URL, screenshot, photo or Figma frame |
| Observe | `fe-competitor` | Deep competitor analysis: UX flows, conversion patterns, SEO, speed, gaps to exploit |
| Observe | `fe-wp-audit` | Connects to WordPress (MCP Adapter / REST / export ZIP) and audits Elementor + Bricks globals, templates, media, meta, icons, headers |
| Observe | `fe-keywords` | Keyword planner from competitor URLs, Google Ads Keyword Planner and Search Console; maps keywords to pages |
| Think | `fe-concept` | Out-of-the-box concepting: 5 directions, 1 chosen, with a signature interaction |
| System | `fe-extract` | Tokens + DESIGN.md from inspections or code |
| System | `fe-system` | Tokens -> CSS vars / Tailwind / ACSS / Figma variables + component schema |
| System | `fe-consistency` | Enforces one palette, one type system, one icon set, one header/footer, one spacing scale across every page and site; auto-fix plans for Elementor and Bricks |
| System | `fe-schema` | Top-notch JSON-LD: Organization, LocalBusiness subtypes, TouristTrip, Product, FAQ, Breadcrumb, Article; validation loop |
| System | `fe-figma-sync` | Existing site -> Figma (html.to.design) and tokens <-> Figma variables via MCP |
| Build | `fe-build` | Slop-free Astro / React / Bricks implementation |
| Build | `fe-editable` | Builder-like editability: content schemas, slots, visual-edit friendly structure |
| Build | `fe-motion` | 60fps, reduced-motion-safe animation that tells a story |
| Gate | `fe-responsive` | Viewport sweep 320 -> 1920, zoom, touch, overflow |
| Gate | `fe-perf` | Core Web Vitals budgets with a failing CI gate |
| Gate | `fe-judge` | Awwwards-style 40/30/20/10 rubric + a11y + dev gates |

## The loop

```
LEARN  -> fe-learn (tutorials) + fe-scan + fe-audit (own/any live site) + fe-inspect (inspirations) + fe-competitor (market) + fe-wp-audit (WordPress) + fe-keywords (demand)
THINK  -> fe-concept picks a point of view and signature move
SYSTEM -> fe-extract -> fe-system -> fe-consistency -> fe-schema -> fe-figma-sync
BUILD  -> fe-build + fe-editable + fe-motion
GATE   -> fe-responsive -> fe-perf -> fe-judge (fe-scan + fe-audit re-run as the final proof)
REFLECT-> fe-master writes what worked into design/knowledge/ so the next site starts smarter
```

## Paste a URL, get an audit

```bash
node skills/fe-scan/scripts/deep-scan.mjs https://your-site.com --pages 12 --monkey 45 --no-forms
node skills/fe-scan/scripts/elements.mjs https://your-site.com
node skills/fe-scan/scripts/trace.mjs https://your-site.com
node skills/fe-scan/scripts/seo-hygiene.mjs https://your-site.com --keywords "island hopping iloilo,gigantes island tour"
PSI_API_KEY=... node skills/fe-scan/scripts/psi.mjs https://your-site.com --strategy both
```
Then run `fe-audit` to turn the evidence into `design/reports/audit/<site>/<date>/audit.md`: verdict, score card, the conversion bottleneck, top 10 fixes, section findings, CRM/booking readiness table, long-tail content opportunities, feedback-loop checklist.

## Knowledge base layout (per project)

```
design/
  knowledge/      technique cards from fe-learn (one .md per technique)
  inspection/     fe-inspect teardowns + screenshots
  competitors/    fe-competitor reports
  wp-audit/       fe-wp-audit exports, inventories and fix plans
  keywords/       fe-keywords maps and clusters
  concepts/       fe-concept direction boards
  tokens.json     single source of truth
  DESIGN.md       point of view, rules, component inventory
  components/     component schemas
  schema/         JSON-LD templates per page type
  reports/        scan / audit / responsive / perf / judge / consistency outputs
  LESSONS.md      fe-master retrospective log
```

## License

MIT

# frontend-mastery-skills

A **master front-end agent** that learns how to learn. It watches tutorials, studies inspirations and competitors pixel by pixel, deep-scans and audits live sites like a human designer (fonts, weights, states, corners, tap padding, viewport units, what happens after the CTA click, the conversion bottleneck, legal pages, CRM readiness, schema, sitemap, long-tail keywords), extracts design systems, audits WordPress builders (Elementor, Bricks) for consistency, builds in Astro / React / Bricks, keeps everything editable like a builder, and refuses to ship anything that fails responsiveness, performance, schema or an award-style jury.

Built on the open [Agent Skills spec](https://agentskills.io/specification). Works in Cursor, Claude Code, Codex, Copilot, Gemini CLI, Perplexity Computer and any client that reads `SKILL.md`. Pairs with [Impeccable](https://github.com/pbakaus/impeccable) (design vocabulary and interface audits), [emilkowalski/skills](https://github.com/emilkowalski/skills) (native-feeling interaction, gestures and motion craft) and [claude-video](https://github.com/bradautomates/claude-video) (`/watch`).

Two profiles:
- **Site** - marketing, content and booking pages. The full loop below, with SEO and performance gates.
- **App** - the UI of a working product with a backend. `fe-guard` -> `fe-reference` -> `fe-inspect` -> `fe-variants` -> `fe-responsive` -> `fe-regress`. The backend, schema, auth and every network call stay as they are, and a script fails the change if they do not.

## Install

The installer needs Node 22.20 or newer (`node -v`). On an older Node it stops before installing anything.

```bash
# recommended on your own machine: once, for every project, nothing added to any app repository
npx skills add jcrosento/frontend-mastery-skills -g -a cursor -y
npm i --prefix ~/.agents playwright gremlins.js && ~/.agents/node_modules/.bin/playwright install chromium   # browser for the scripts

# or per project, when teammates or cloud agents need the same skills (adds .agents/skills/ and skills-lock.json)
npx skills add jcrosento/frontend-mastery-skills -a cursor -y

# only some skills
npx skills add jcrosento/frontend-mastery-skills -g -a cursor -y --skill fe-master fe-guard fe-reference fe-inspect fe-scan

# update later
npx skills update -g
```
A full install is 25 skills; `npx skills list -g` should show all of them. Companion skills, all optional:
```bash
npx skills add pbakaus/impeccable -g -a cursor -y                    # design vocabulary and interface audits
npx skills add emilkowalski/skills -g -a cursor -y                   # interaction and motion craft (app profile)
npx skills add bradautomates/claude-video -g --skill watch           # video learning
```

### Use it in Cursor
Cursor reads skills from `~/.agents/skills/` (global) and `.agents/skills/` (project). Open the app's folder, open Agent chat, type `/` and pick `fe-master`, then say what you want. The agent also picks a skill up on its own when the request matches its description.

Cursor Cloud Agents (the ones you start from a phone or the web) run on a fresh machine each time. They do not get the global install from your computer, and a global install made inside one cloud chat is gone in the next. For those, use the per-project install once, in its own pull request; after it is merged every new chat lists the skills under `/`. A chat that was already open keeps the list it started with.

```text
/fe-master App profile. Simplify the Send Money screen. UI only: do not touch the server, schema, auth or any network call. Read the screen map first, then show me what you will change before you change it.
/fe-master Site profile. Audit https://example.com and give me the top 10 fixes with evidence.
/fe-guard Set up the UI-only contract for this app in its own pull request. Change nothing else. Run guard.mjs --audit and paste its output.
```
Scripts run from where the skills were installed, for example from an app folder:
```bash
node ~/.agents/skills/fe-scan/scripts/app-map.mjs --root . --declared docs/sitemap.md     # screens, guards and links of an app behind a login
node ~/.agents/skills/fe-guard/scripts/guard.mjs --base origin/main                       # did the change stay UI-only
```
`guard.mjs`, `gates.mjs` and `app-map.mjs` need only Node. Scripts that open a browser need the Playwright line above (without `gremlins.js` the monkey test is skipped and says so); the PageSpeed script needs `PSI_API_KEY`. Inside a clone of this repository, `npm run setup` installs everything and the `npm run ...` shortcuts work.

In Cursor you can also run `/add-plugin figma`. For WordPress sites install the **MCP Adapter** plugin (see `fe-wp-audit`).

## Skill map

| Layer | Skill | Superpower |
|-------|-------|-----------|
| Orchestrate | `fe-master` | Decides which skills to run, keeps the knowledge base, compounds what it learns |
| Learn | `fe-learn` | Turns tutorials, courses, articles and videos into reusable technique cards |
| Observe | `fe-scan` | Automated evidence: 5 device profiles, section screenshots + box-model, flow walk, monkey test (`--no-forms` safe mode), heatmaps, element census, throttled CDP trace -> bottleneck, SEO hygiene, PSI + CrUX; for apps behind a login, a screen map read from the source (routes, guards, redirects, dead links) |
| Observe | `fe-audit` | Human-designer audit on top of the evidence: typography, color, corners, states, tap padding, vh/vw, consistency, after-the-click, conversion bottleneck, simplicity, trust/legal, CRM/booking readiness, schema/sitemap/characters/long-tail, feedback loop |
| Observe | `fe-inspect` | Pixel / element / device teardown of any URL or Figma frame; calibrated measurement of app screenshots (position, size, corner radius), each box re-measured 20 times and refused if it moves, labelled by source app, with the product's own screenshots refused as references |
| Observe | `fe-competitor` | Deep competitor analysis: UX flows, conversion patterns, SEO, speed, gaps to exploit |
| Observe | `fe-wp-audit` | Connects to WordPress (MCP Adapter / REST / export ZIP) and audits Elementor + Bricks globals, templates, media, meta, icons, headers |
| Observe | `fe-keywords` | Keyword planner from competitor URLs, Google Ads Keyword Planner and Search Console; maps keywords to pages |
| Think | `fe-concept` | Out-of-the-box concepting: 5 directions, 1 chosen, with a signature interaction (sites) |
| Think | `fe-reference` | Decides which familiar app a flow should learn from (iOS Camera and CamScanner measured; Facebook and GCash as candidates), with a fixed-weight matrix and gates enforced in code |
| Think | `fe-variants` | 2-3 working versions of one app screen behind a switch in one branch, compared on the same data; losers deleted before merge |
| System | `fe-extract` | Tokens + DESIGN.md from inspections or code |
| System | `fe-system` | Tokens -> CSS vars / Tailwind / ACSS / Figma variables + component schema |
| System | `fe-consistency` | Enforces one palette, one type system, one icon set, one header/footer, one spacing scale across every page and site; auto-fix plans for Elementor and Bricks |
| System | `fe-schema` | Top-notch JSON-LD: Organization, LocalBusiness subtypes, TouristTrip, Product, FAQ, Breadcrumb, Article; validation loop |
| System | `fe-figma-sync` | Existing site -> Figma (html.to.design) and tokens <-> Figma variables via MCP |
| Build | `fe-build` | Slop-free Astro / React / Bricks implementation |
| Build | `fe-editable` | Builder-like editability: content schemas, slots, visual-edit friendly structure |
| Build | `fe-motion` | 60fps, reduced-motion-safe animation that tells a story |
| Gate | `fe-guard` | UI-only contract for existing apps: fails a change that touches backend files, alters a network call or a call to one of the app's data functions (found from the code, not typed by hand), or drops, relabels or reorders a locked control. `--audit` checks the contract itself for holes |
| Gate | `fe-responsive` | Viewport sweep 320 -> 1920, zoom, touch, overflow |
| Gate | `fe-perf` | Core Web Vitals budgets with a failing CI gate |
| Gate | `fe-judge` | Awwwards-style 40/30/20/10 rubric + a11y + dev gates |
| Gate | `fe-regress` | Measured baseline, re-scan after every change, two-try rule before acting on a regression, revision log with before/after evidence |
| Specialist | `fe-legend` | Pixel-level analysis of a poster or map legend, rebuilt as editable SVG/CSS tokens |

## The loop

```
LEARN  -> fe-learn (tutorials) + fe-scan + fe-audit (own/any live site) + fe-inspect (inspirations) + fe-competitor (market) + fe-wp-audit (WordPress) + fe-keywords (demand)
THINK  -> fe-concept picks a point of view and signature move
SYSTEM -> fe-extract -> fe-system -> fe-consistency -> fe-schema -> fe-figma-sync
BUILD  -> fe-build + fe-editable + fe-motion
GATE   -> fe-responsive -> fe-perf -> fe-judge (fe-scan + fe-audit re-run as the final proof)
REFLECT-> fe-master writes what worked into design/knowledge/ so the next site starts smarter
```

## Change an app's UI without touching its backend

```bash
node skills/fe-scan/scripts/app-map.mjs --root . --declared docs/sitemap.md --strict    # read the screens and links first
# once per app, in its own pull request: design/guard.json + design/landmarks.lock.json
node skills/fe-guard/scripts/guard.mjs --audit                       # is the config itself safe: no routes, data or untested lock inside the UI list
node skills/fe-guard/scripts/guard.mjs --base origin/main            # paths + network lines + the app's own data functions, found from the code
node skills/fe-guard/scripts/lock-check.mjs --lock design/landmarks.lock.json --state home --html rendered.html
node skills/fe-inspect/scripts/measure-shot.mjs --manifest design/reference/ios-camera/shots.json --project <product> --overlay
node skills/fe-reference/scripts/gates.mjs --matrix matrix.json --tokens tokens.json --brief borrow-tweak-elevate.md --counts counts.json
node skills/fe-guard/scripts/guard.mjs --base origin/main --final    # also fails if variant code remains
```
What this proves: the change stayed inside the UI folders, no network-facing line changed, every locked control is still present, labelled and in order, the screen did not gain controls, and no written link or redirect points at a screen that does not exist. What it does not prove: that behaviour is identical or that the design is better. The app's own tests and a human review still decide that.

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

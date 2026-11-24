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
npm i --prefix ~/.agents playwright gremlins.js axe-core && ~/.agents/node_modules/.bin/playwright install chromium   # browser for the scripts

# or per project, when teammates or cloud agents need the same skills (adds .agents/skills/ and skills-lock.json)
npx skills add jcrosento/frontend-mastery-skills -a cursor -y

# only some skills
npx skills add jcrosento/frontend-mastery-skills -g -a cursor -y --skill fe-master fe-guard fe-reference fe-inspect fe-scan

# update later
npx skills update -g
```
A full install is 37 skills; `npx skills list -g` should show all of them. Companion skills, all optional:
```bash
npx skills add pbakaus/impeccable -g -a cursor -y                    # design vocabulary and interface audits
npx skills add emilkowalski/skills -g -a cursor -y                   # interaction and motion craft (app profile)
npx skills add bradautomates/claude-video -g --skill watch           # video learning
```

### Use it in Cursor
Cursor reads skills from `.agents/skills/` and `.cursor/skills/` in a project, and from `~/.agents/skills/` and `~/.cursor/skills/` on your computer ([Cursor docs](https://cursor.com/docs/skills)). Open the app's folder, open Agent chat, type `/` and pick `fe-master`, then say what you want. The agent also picks a skill up on its own when the request matches its description.

Which install reaches which agent:

| Where the skills are | Chat on your computer | Cloud Agent (phone, web) | Automation |
|----------------------|-----------------------|--------------------------|------------|
| In the project (`.agents/skills/`, the per-project install above) | Yes | Yes | Yes |
| `~/.agents/skills/` (the `-g` install above) | Yes | No | No |
| `~/.cursor/skills/` with Settings -> Agents -> "Sync Skills for Cloud Agents" switched on | Yes | Yes | No |
| As a Cursor plugin (below) | Yes | Yes, when installed for the account | Not tested |

If you build from a phone, use the per-project install, once per app, in its own pull request. After it is merged every new chat lists the skills under `/`. A chat that was already open keeps the list it started with. Install one way per project: a project install plus a plugin shows every skill twice.

**As a Cursor plugin (experimental).** This repository carries `.cursor-plugin/plugin.json` and `.cursor-plugin/marketplace.json`, checked against Cursor's published schemas. In Cursor: Customize -> Plugins -> import "From GitHub Repository" and give `jcrosento/frontend-mastery-skills`. It ships skills only: no rule, hook or server is added to your chats. It has not yet been installed in a real Cursor account from this repository, so the first import is the test. The scripts that open a browser look for `playwright` and `axe-core` next to the skills, and a plugin install does not put them there; until that is solved, a plugin install gives you the procedures and the Node-only scripts, and the per-project install gives you everything.

### Cursor's own skills, and how these pair with them

Cursor ships its own skills; type `/` to see them ([list](https://cursor.com/docs/skills)). They are about running Cursor, not about design, so they do not overlap with these. The useful pairs:

| Cursor's | Use it with | For |
|----------|-------------|-----|
| `/review`, `/review-bugbot`, `/review-security` | `fe-guard`, `fe-second-eye` | A reviewer that did not write the change. It reads code; it does not judge how a screen looks |
| `/create-subagent` | `fe-second-eye` | Make the read-only second-eye judge on another model (`skills/fe-second-eye/templates/second-eye.agent.md`) |
| `/create-hook` | `fe-guard` | Run `guard.mjs` after an edit, so a UI change that touches the server is caught at once |
| `/split-to-prs` | `fe-guard` | Separate a change that mixed UI and backend into two pull requests |
| `/loop`, `/automate` | `fe-scan`, `fe-ux-audit`, `fe-drift` | Re-run a scan or an audit on a schedule or until it passes |
| `/create-rule` | `AGENTS.md` | Keep the hard rules in the project, where every agent reads them |
| `/create-skill`, `/migrate-to-skills` | `npm run grade -- --dir` | Write a project's own skill, then grade how it is packaged |
| `/canvas` | `fe-pinterest`, `fe-variants` | Lay swatches or options side by side to choose from |

### Audit the skills a project already has

A project often has its own skills in `.cursor/skills/`. Grade them with the same ruler, from a clone of this repository. It reads and writes nothing:

```bash
npm run grade -- --dir /path/to/app/.cursor/skills
```

It flags a description too long to be loaded cheaply, a skill that never says when to use it, a file it names that is not there, and a skill that scores its own work with nobody else checking the score.

How Cursor decides what to load: the one-line description of every installed skill is in every chat, and the body of a skill is read only when the request matches it or you type `/` and its name. That is why each description here is 60 words or fewer and says when to use it and what it is not for. `npm run grade` checks this.

```text
/fe-master App profile. Simplify the Send Money screen. UI only: do not touch the server, schema, auth or any network call. Read the screen map first, then show me what you will change before you change it.
/fe-master Site profile. Audit https://example.com and give me the top 10 fixes with evidence.
/fe-guard Set up the UI-only contract for this app in its own pull request. Change nothing else. Run guard.mjs --audit and paste its output.
/fe-ux-audit Audit the Send Money screen on a phone. Run the script first and paste its output, then do the by-hand list.
/fe-second-eye Judge the before and after of this screen. You did not build it. Open only the packet folder.
/fe-pinterest My saved pins are in ~/boards/warm-studio. Make a style guide. Change nothing in the app yet.
```

**The builder is not the judge.** A model prefers its own work, and the work of models from its own company. So the chat that built a screen does not score it. Two ways to get a second eye in Cursor:
- Start a new chat, pick a model from a different company in the model picker, and run `/fe-second-eye` there. This works on a phone and in Cloud Agents.
- Or copy `skills/fe-second-eye/templates/second-eye.agent.md` to `.cursor/agents/second-eye.md` in the app. Cursor then offers a read-only "second-eye" subagent that always runs on the model named in that file.

`fe-last-eye` refuses a scorecard whose judge is the builder or a model of the builder's family. A person can always be the judge.
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
| Observe | `fe-ux-audit` | A UX auditor's checklist. A script runs the accessibility rules (axe), tap sizes, small text, sideways scroll, dead controls, leaked text and console errors on one screen; the rest is done by hand against ten heuristics, with a severity for each finding |
| Observe | `fe-seo` | An SEO auditor's checklist in the order problems block each other: can it be reached, can it be read, is it fast, is it understood; mapped to the scan scripts and one outside checker |
| Observe | `fe-inspect` | Pixel / element / device teardown of any URL or Figma frame; calibrated measurement of app screenshots (position, size, corner radius), each box re-measured 20 times and refused if it moves, labelled by source app, with the product's own screenshots refused as references |
| Observe | `fe-competitor` | Deep competitor analysis: UX flows, conversion patterns, SEO, speed, gaps to exploit |
| Observe | `fe-wp-audit` | Connects to WordPress (MCP Adapter / REST / export ZIP) and audits Elementor + Bricks globals, templates, media, meta, icons, headers |
| Observe | `fe-keywords` | Keyword planner from competitor URLs, Google Ads Keyword Planner and Search Console; maps keywords to pages |
| Think | `fe-concept` | Out-of-the-box concepting: 5 directions, 1 chosen, with a signature interaction (sites) |
| Think | `fe-reference` | Decides which familiar app a flow should learn from (iOS Camera and CamScanner measured; Facebook and GCash as candidates), with a fixed-weight matrix and gates enforced in code |
| Think | `fe-variants` | 2-3 working versions of one app screen behind a switch in one branch, compared on the same data; losers deleted before merge |
| System | `fe-extract` | Tokens + DESIGN.md from inspections or code |
| System | `fe-system` | Tokens -> CSS vars / Tailwind / ACSS / Figma variables + component schema |
| Family | `fe-family` | The contract for a group of products: one shared craft, a separate palette and voice per brand |
| Family | `fe-drift` | Fails when a product leaves the shared craft numbers, or two brands share a brand color |
| Family | `fe-states` | The six screens every product handles the same way: loading, empty, error, success, offline, not allowed |
| Family | `fe-forms` | One form grammar for booking pages and signed-in apps |
| Family | `fe-shell` | One signed-in frame: navigation, title, primary action, account menu |
| System | `fe-consistency` | Inside one brand: one palette, one type system, one icon set, one header/footer, one spacing scale; auto-fix plans for Elementor and Bricks |
| System | `fe-schema` | Top-notch JSON-LD: Organization, LocalBusiness subtypes, TouristTrip, Product, FAQ, Breadcrumb, Article; validation loop |
| System | `fe-figma-sync` | Existing site -> Figma (html.to.design) and tokens <-> Figma variables via MCP |
| Build | `fe-build` | Slop-free Astro / React / Bricks implementation |
| Build | `fe-editable` | Builder-like editability: content schemas, slots, visual-edit friendly structure |
| Learn | `fe-pinterest` | A Pinterest board or a folder of saved pins becomes a style guide: a measured palette with contrast checked, plus type, shape, imagery and mood, and proposed tokens. Never opens Pinterest by script and never copies a pin into the project |
| Build | `fe-imagery` | Text to image for hero art, illustrations, empty states, icons and social cards: prompt recipe, model choice, export sizes, and a record of how each image was made. Never a screen mockup |
| Build | `fe-motion` | 60fps, reduced-motion-safe animation that tells a story |
| Gate | `fe-guard` | UI-only contract for existing apps: fails a change that touches backend files, alters a network call or a call to one of the app's data functions (found from the code, not typed by hand), or drops, relabels or reorders a locked control. `--audit` checks the contract itself for holes |
| Gate | `fe-responsive` | Viewport sweep 320 -> 1920, zoom, touch, overflow |
| Gate | `fe-perf` | Core Web Vitals budgets with a failing CI gate |
| Gate | `fe-judge` | Awwwards-style 40/30/20/10 rubric + a11y + dev gates. The jury, not the merge |
| Gate | `fe-second-eye` | Independent judging: a blind before and after, judged by a model from another family in both orders, or by a person. A choice that flips with the order does not count |
| Gate | `fe-last-eye` | The last call before a merge. Ten lines, all at 8 or better, judged by someone other than the builder, or the work goes back |
| Gate | `fe-memory` | The memory of one project, so the next build does not repeat a miss |
| Gate | `fe-regress` | Measured baseline, re-scan after every change, two-try rule before acting on a regression, revision log with before/after evidence |
| Specialist | `fe-legend` | Pixel-level analysis of a poster or map legend, rebuilt as editable SVG/CSS tokens |

## The loop

```
LEARN  -> fe-learn (tutorials) + fe-scan + fe-audit (own/any live site) + fe-ux-audit (screens) + fe-seo (search) + fe-inspect (inspirations) + fe-pinterest (moodboards) + fe-competitor (market) + fe-wp-audit (WordPress) + fe-keywords (demand)
THINK  -> fe-concept picks a point of view and signature move
SYSTEM -> fe-extract -> fe-system -> fe-consistency -> fe-schema -> fe-figma-sync
BUILD  -> fe-build + fe-editable + fe-motion + fe-imagery
GATE   -> fe-responsive -> fe-perf -> fe-judge -> fe-second-eye (not the builder) -> fe-last-eye (the only merge call)
REFLECT-> fe-memory logs this project's misses; fe-master writes what worked into design/knowledge/
FAMILY (several products) -> fe-family -> fe-drift, then fe-states / fe-forms / fe-shell on what failed
```

## Grade the skills

```bash
npm run grade            # every skill, out of 100, with the reason for each lost point
npm run grade -- --strict   # exit 1 unless every skill is 100; part of `npm run verify`
```
The grade is about packaging: does the skill install, is its description short and does it say when to use it and what it is not for, do the files it names exist, do its scripts parse, does something route to it, does it say what it writes, and does a skill that scores work send that score to `fe-second-eye`. It does not grade the design a skill produces. That is measured on real screens, by `fe-ux-audit` and by a `fe-second-eye` verdict.

Where the tools, models and datasets behind these skills come from: `design/knowledge/tooling/sources-and-datasets.md`.

## The last eye

`fe-judge` scores the page. It does not merge it. `fe-last-eye` is the last call: consistent, worth first place, animation, performance, responsive, backend, consistency across the product, clean, faithful to the reference, and a new game rather than the last attempt. Every line needs 8 or better, and the card names who built the screen and who judged it; the judge may not be the builder or a model of the builder's family. One miss writes `reprompt.md` and a line in that project's memory, and the builder (`fe-build`, or `/build-agents` when that is how the project builds) recreates those lines. The same finding is not sent around again. The third distinct miss stops and asks.

```bash
node skills/fe-memory/scripts/memory.mjs --project harbor --dir design/memory --subject home
node skills/fe-last-eye/scripts/last-eye.mjs --card design/reports/last-eye/harbor/2026-11-17/scorecard.json --memory design/memory/harbor.jsonl --write
```

## One company, many products

`fe-consistency` keeps one brand tidy, including the same brand on more than one domain. It is the wrong tool when the products are different brands that should only feel related. That job is `fe-family`: shared spacing, controls, focus, type ratio, icons, motion and the six states; each product keeps its own palette, logo and voice. `fe-drift` checks the numbers and fails if two brands share a brand color.

```bash
node skills/fe-drift/scripts/drift.mjs --family design/family/family.json --products design/family/products
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
  memory/         fe-memory and fe-last-eye, one <project>.jsonl per product
  LESSONS.md      fe-master retrospective log
```

## License

MIT

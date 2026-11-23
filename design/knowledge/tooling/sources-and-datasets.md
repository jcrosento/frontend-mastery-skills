---
title: Sources, tools and datasets
category: tooling
stack: [reference]
source: links opened and checked 2026-11-23
source_type: research
learned: 2026-11-23
proven: false
uses: 0
---
Where to look when a skill needs a better tool, a better model or data to test against. Rankings change in weeks; open the link, do not trust a number copied here.

## Tools a UX or UI auditor uses, and what stands in for them here
| Job | Auditor's tool | Here |
|-----|----------------|------|
| Accessibility rules | axe DevTools, WAVE, Lighthouse | `fe-ux-audit` runs axe-core (https://github.com/dequelabs/axe-core). Automated rules find about 57% of accessibility issues (https://www.deque.com/automated-accessibility-coverage-report/); the rest is by hand |
| Heuristic review | Nielsen's ten heuristics, severity 0 to 4, three to five evaluators working apart (https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/) | `fe-ux-audit` by-hand list, `fe-second-eye` as the second evaluator |
| Speed | Lighthouse, PageSpeed Insights, WebPageTest | `fe-scan` `trace.mjs` and `psi.mjs`, `fe-perf` |
| Responsive check | BrowserStack, device lab | `fe-responsive`, `fe-scan` device profiles (Playwright) |
| Visual change | Percy, Chromatic, Playwright screenshots | `fe-regress`, `compare.mjs` |
| Behaviour | Hotjar, Microsoft Clarity, GA4 funnels | not automated; `fe-audit` asks for it. A real person on the real screen is the only source |
| Design file | Figma, Dev Mode | `fe-figma-sync`, `fe-inspect` |
| SEO | Screaming Frog, Search Console, Ahrefs or Semrush | `fe-seo`, `fe-keywords`, and the open checker `@seomator/seo-audit` (https://github.com/seo-skills/seo-audit-skill) |

## Skill collections worth reading before writing a new skill
- https://www.skills.sh/ - directory of installable skills.
- https://github.com/pbakaus/impeccable - design vocabulary and a detector with rules for common interface mistakes. Apache-2.0.
- https://github.com/vercel-labs/agent-skills - `web-design-guidelines`, a long list of interface rules.
- https://github.com/anthropics/skills - `frontend-design`.
- https://cursor.com/docs/context/skills, https://cursor.com/docs/context/rules, https://cursor.com/docs/agent/subagents, https://cursor.com/docs/agent/hooks - how Cursor loads skills, rules, subagents and hooks.

## Rankings
- Who builds the best-looking web UI, voted by people: https://www.designarena.ai/leaderboard
- Web coding: https://arena.ai/leaderboard/webdev
- Text to image, with price per thousand images: https://artificialanalysis.ai/embed/text-to-image-leaderboard/leaderboard/text-to-image

## Datasets (Hugging Face unless noted)
| Dataset | What it holds | Use here |
|---------|---------------|----------|
| `biglab/uiclip_human_data_hf` | Designers' choices between pairs of screens | Check whether a judge agrees with designers |
| `biglab/jitteredwebsites-merged-224-paraphrased` | Web pages with deliberate defects and a description of each | Seed defects for `fe-ux-audit` tests |
| `biglab/webui-all`, `webui-7k`, `webui-70k`, `webui-350k` | Web pages with screenshots and element data at several screen sizes | Test `fe-scan` and `fe-responsive` at scale |
| `HuggingFaceM4/WebSight` | Synthetic page screenshots with their HTML. CC-BY-4.0 | Screenshot-to-code checks |
| `SALT-NLP/Design2Code-hf` | Real pages as a screenshot-to-code benchmark | Measure how close a build is to a reference |
| `osunlp/Mind2Web` | Tasks carried out on real websites | Flow-walk test cases |
| https://github.com/google-research-datasets/uicrit | Designers' written critiques of phone screens (archived) | Examples of what a good critique names |
| https://github.com/YueJiang-nj/UEyes-CHI2023 | Eye tracking on 1,980 screens | Check the predicted attention map in `fe-scan` |

Read each dataset's licence before using it in a product. Several are for research only.

## Models that help, and their limit
- UIClip (https://huggingface.co/biglab/uiclip_jitteredwebsites-2-224-paraphrased): a cheap alarm for a broken render. Not a judge; see `skills/fe-second-eye/references/models.md`.
- OmniParser (https://github.com/microsoft/OmniParser): finds the controls in a screenshot when there is no DOM to read, for example a native app.

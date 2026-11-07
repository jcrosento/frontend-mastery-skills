# frontend-mastery-skills

Agent Skills that give a coding agent a *senior front-end eye*: inspect any inspiration (URL, screenshot, photo, Figma) pixel by pixel, extract a design system, build with Astro / React / Bricks, then pass hard gates for responsiveness, performance, motion quality and award-style judging.

Built on the open [Agent Skills spec](https://agentskills.io/specification). Works in Claude Code, Cursor, Codex, Copilot, Gemini CLI, Perplexity Computer and any client that reads `SKILL.md`. Pairs with [Impeccable](https://github.com/pbakaus/impeccable) for design vocabulary.

## Install

```bash
npx skills add jcrosento/frontend-mastery-skills
# or copy skills/* into .claude/skills, .cursor/skills, .agents/skills
```

## The pipeline (use in this order)

| # | Skill | Question it answers | Gate |
|---|-------|---------------------|------|
| 1 | `fe-inspect` | What exactly is this reference doing, per element, per breakpoint? | Inspection report + measured screenshots |
| 2 | `fe-extract` | What tokens, type scale, grid and motion rules does it imply? | `tokens.json` + `DESIGN.md` |
| 3 | `fe-system` | How do we turn tokens into a schema (CSS vars / Tailwind / ACSS / Figma variables)? | Design system compiled, one source of truth |
| 4 | `fe-build` | How do we build it in Astro, React or Bricks without AI slop? | Component checklist passed |
| 5 | `fe-motion` | How do we add world-class, 60fps, reduced-motion-safe animation? | Motion spec + perf trace |
| 6 | `fe-responsive` | Does it hold at 320, 390, 768, 1024, 1280, 1920 and with 200% zoom? | Viewport sweep, zero overflow/CLS |
| 7 | `fe-perf` | Does it hit Core Web Vitals green on mobile? | LCP<2.5s, INP<200ms, CLS<0.1 |
| 8 | `fe-judge` | Would an Awwwards / CSSDA jury score it 8+? | Scored rubric, blocking issues fixed |

## Philosophy

- Measure, don't guess. Every claim about a reference must come from a screenshot, computed style or DOM snapshot.
- One source of truth. Tokens live in `design/tokens.json`; everything else is generated.
- Differentiate on purpose. Pick a stated point of view before writing UI; the default is forbidden.
- Gates, not vibes. A page is not done until `fe-responsive`, `fe-perf` and `fe-judge` pass.

## Repo layout

```
skills/
  fe-inspect/      SKILL.md, scripts/capture.mjs, references/breakpoints.md
  fe-extract/      SKILL.md
  fe-system/       SKILL.md
  fe-build/        SKILL.md
  fe-motion/       SKILL.md
  fe-responsive/   SKILL.md
  fe-perf/         SKILL.md, scripts/lighthouse-gate.mjs
  fe-judge/        SKILL.md
AGENTS.md          Orchestration rules for the whole pipeline
```

## License

MIT

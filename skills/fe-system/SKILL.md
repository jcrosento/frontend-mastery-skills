---
name: fe-system
description: Compile design/tokens.json into target design-system schemas — CSS custom properties, Tailwind v4 @theme, Automatic.css settings for Bricks Builder, Figma variables via Figma MCP — and generate the component schema (props, variants, states). Use when the user mentions design system, tokens to code, Tailwind theme, ACSS, Bricks global styles, Figma variables, or component API.
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-system

Goal: one `tokens.json` → every platform, with zero hand-copied values.

## Targets
- **CSS**: `src/styles/tokens.css` with `:root { --color-brand-500: ... }` plus `@media (prefers-color-scheme: dark)` semantic overrides.
- **Tailwind v4**: `@theme { --color-brand-500: ...; --font-display: ...; --spacing-*: ... }`.
- **Astro**: import tokens.css in the base layout; expose fluid type with `clamp()` generated from the scale.
- **Bricks + Automatic.css**: export ACSS settings JSON (colors, type scale, spacing) and Bricks global classes; map semantic tokens to ACSS variables (`var(--primary)`, `var(--space-m)`).
- **Figma**: with Figma MCP `use_figma`, create a Variables collection mirroring tokens (Primitives + Semantic modes light/dark) and base components with Auto Layout and variants.

## Component schema
For each component write `design/components/<Name>.md`: purpose, anatomy, props/variants (size, tone, emphasis), states (default, hover, focus-visible, active, disabled, loading, error), responsive behaviour, motion, accessibility (role, name, keyboard), do/don't.
Start set: Button, Link, Input, Card, Section, Container, Nav, Footer, Hero, Media, Badge, Tabs, Accordion, Modal, Toast.

## Rules
- Generated files carry a header `/* generated from design/tokens.json — do not edit */`.
- Provide a `npm run tokens` script (Style Dictionary or a 40-line node script) so regeneration is one command.

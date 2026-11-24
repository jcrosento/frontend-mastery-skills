---
name: fe-imagery
description: "Text-to-image for websites and apps: hero art, illustrations, empty-state pictures, icons and social cards, with a prompt recipe, a model picked for the job, export sizes and a record of how each image was made. Use when the user asks to generate, create or replace an image. Not for screen mockups or design options; build those with fe-variants."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-imagery

A generated image is an asset, like a photo from a shoot. It is never a design, never a reference and never evidence.

## Rules

- Do not generate a picture of the interface to show a design. A model draws screens that cannot be built and text that is not real. Options for a screen are built with `fe-variants`.
- A generated image is not a reference for `fe-inspect` or `fe-reference`, and not a before or after for `fe-second-eye`.
- Real things stay real: the actual boat, room, island, product, team member or customer is photographed, not generated. Say so when asked to generate one.
- No text inside the image. Headlines, prices and labels are HTML over the image, so they can be edited, translated and read by a screen reader. The exception is a social card, and its text is checked letter by letter.
- Ask before any paid render. Say how many images and which model.

## Procedure

1. Read `design/tokens.json` or `DESIGN.md` for the palette, and the brand voice if there is one. Write the job in one line: where the image goes, its ratio, what must be readable on top of it.
2. Write the prompt with `templates/prompt.md`. Every prompt has subject, setting, light, lens or medium, palette by hex, composition with the empty area for text, and what to leave out.
3. Pick the model for the job, not by habit. Read the current ranking at https://artificialanalysis.ai/embed/text-to-image-leaderboard/leaderboard/text-to-image and weigh price: on 2026-11-23 the top model cost about six times the fourth-ranked one per image. In Cursor, the agent can generate an image itself and saves it to `assets/`.
4. Generate three, not one. Choose with the user. The builder does not get the only vote on its own image.
5. Export: AVIF or WebP, a 2x and a 1x, explicit `width` and `height`, under 200 KB for a hero. Write alt text that says what the picture shows, or `alt=""` when it is decoration.
6. Record it. Append one line to `design/assets/generated.jsonl`: `{ "file", "model", "date", "prompt", "used_on", "edited": true|false }`.
7. Run `fe-perf` on the page. A hero image is usually the largest paint.

## What you write

The image files, the line in `design/assets/generated.jsonl`, and one sentence: which model, how many were made, which one was chosen and by whom.

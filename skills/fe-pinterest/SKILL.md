---
name: fe-pinterest
description: "Turns a Pinterest board or a folder of saved pins into a style guide: palette with contrast checked, type, shape, imagery and mood, written to design/style-guide/ with proposed tokens. Use when the user shares a Pinterest board, pins or a moodboard and wants a style guide or a look. Not for copying one screen's layout; use fe-inspect and fe-reference."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-pinterest

A board is a feeling. A style guide is a set of decisions a builder can follow. This skill turns the first into the second, and says which parts the board supports and which parts you chose.

## Rules

- Pins are inspiration, not assets. Never ship a pin's photo, illustration, logo or words, and never copy a pin into the repo. The guide records file names or links only.
- Do not open Pinterest with a script or a browser automation. Its terms forbid collecting content by automated means without permission (https://policy.pinterest.com/en-gb/terms-of-service). The user saves the pins, or shares their own board through the official API. See `references/getting-the-pins.md`.
- The board proposes; it does not apply. Nothing here edits `design/tokens.json`, a stylesheet or a component. The user approves the guide first.
- Readable beats pretty. A board colour that fails contrast is moved until it passes or is marked decoration only.
- On a working app the board changes the skin only: colour, type, imagery, radius. Layout and behaviour stay with `fe-reference`, and `fe-guard` still runs before any edit.
- Say how much of the board backs each claim: "9 of 14 pins". One striking pin is not a style.

## Procedure

1. Get the pins into a folder on this machine: 12 to 30 images, one look per board. Fewer than 6 is refused. Ask what the board is for (which product, which audience) and what the user loves most in it.
2. Measure the colour:

```bash
node skills/fe-pinterest/scripts/palette.mjs <folder> --name <board-name>
```

   It reads the image files only, with the network switched off, and needs `playwright` installed beside the skills to decode them; without it the script exits 2 and prints the install line. Exit 0 is COHERENT, 1 is MIXED (the pins disagree: light and dark together, or no shared colours), 2 is could not run or too few pins. On MIXED, show the user the problems and the odd ones and ask them to split or prune the board. Do not average two looks into one.
3. Look at every pin yourself and fill the parts a script cannot measure, with `templates/style-guide.md`. For each, count the pins that show it:
   - Type: serif or sans, weight, case, tight or airy. Name two free families that match (a heading and a body), not the font in the pin.
   - Shape: corner radius (square, soft, pill), borders or shadows, line weight.
   - Space: dense or airy, strict grid or loose.
   - Imagery: photo or illustration, light, colour treatment, subject, crop.
   - Mood: three words, and three words it is not.
4. Check the roles the script proposed against what you saw. You may swap the accent for another colour in "Seen on the board"; rerun nothing, but recheck contrast (4.5:1 for text, 3:1 for large text and control edges) and write why.
5. Write `design/style-guide/<board-name>/style-guide.md`. Keep `palette.json` and `tokens.proposed.json` beside it.
6. Show the user the guide before anything is built. A page of swatches and two sample components built with `fe-variants` is the honest preview; a generated picture of a screen is not.

## Hand-offs

| Next | Skill |
|------|-------|
| Make the approved colours real tokens | `fe-system`, starting from `tokens.proposed.json`. On an existing project, `fe-extract` first, so the board is compared with what is already there |
| Several products sharing one look | `fe-family` |
| Pictures in the board's style | `fe-imagery`, with the guide's imagery section as the prompt palette |
| Does the built screen match the board | `fe-second-eye`. The model that wrote the guide does not judge the result |

## What you write

`design/style-guide/<board-name>/palette.json` and `tokens.proposed.json` come from the script. You write `style-guide.md` there. Nothing else changes.

## Limits

The script measures colour and nothing else. Its COHERENT or MIXED verdict was tuned on ten test boards, not on thousands; treat it as a reason to look, not a ruling. Photos average out duller than paint, so the proposed accent is often quieter than the board feels: that is the one role to adjust by eye.

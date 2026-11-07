---
name: fe-concept
description: Out-of-the-box creative direction for websites. Generates 5 distinct concept directions from the brief, knowledge base and competitor gaps, scores them, commits to one, and defines a signature interaction and visual system seed. Use when the user wants something unique, "out of this world", award-level, differentiated, or before building any hero or homepage.
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-concept

The default layout is forbidden. Every site gets a point of view.

## Inputs
Brief, audience, brand assets, `design/knowledge/`, `design/competitors/`, `design/inspection/`.

## Procedure
1. Write the **tension**: what the brand is vs what the category looks like (e.g. "expedition travel that feels like a field journal, in a category full of glossy booking engines").
2. Generate 5 directions using different lenses: Editorial, Brutal/Raw, Cinematic, Playful/Toy, Luxurious/Quiet, Data/Instrument, Handmade/Analog, Retro-future. Pick 5 that fit the tension.
3. For each direction define: name, one-sentence idea, typography pairing, color strategy, layout grammar (grid, density, rhythm), imagery treatment, signature interaction, one reference, risk.
4. Score each 1-5 on: distinctiveness, fit to audience, feasibility in chosen stack, performance cost, editability. Pick the winner; note a fallback.
5. Define the **signature move**: one interaction a visitor will remember (hero, navigation, transition or scroll moment). Specify it precisely enough for fe-motion.
6. Seed the system: 3 fonts max, 1 accent, base unit, radius philosophy, motion temperament. Hand to fe-extract.

## Output
`design/concepts/<date>-directions.md` with the 5 cards, score table, winner, signature move spec and system seed. Include low-fi text wireframe of the hero at mobile and desktop.

## Idea generators when stuck
- Swap the medium: what if the site were a map, a boarding pass, a logbook, a tide chart, a radio?
- Invert hierarchy: imagery first, then type; or type only, no imagery above fold.
- Change the scroll: horizontal chapters, pinned story, sticky index.
- Use real data as decoration: live weather, tides, departure times, coordinates.
- Make the navigation the hero.

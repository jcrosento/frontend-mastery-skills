# The layers

Each layer has three parts: what the spec holds, what the browser measures, and the rule that scores it. A score is the share of uses that follow the spec, from 0 to 100. The pass mark is 95 unless the spec sets `pass` for the whole file or for one layer (`"type": { "pass": 98 }`).

"Uses" means elements a visitor can see. Hidden elements, text clipped to a pixel for screen readers, icon fonts, and known third-party widgets (chat bubbles, cookie banners, captchas) are not counted; the read prints the widgets it skipped. Add your own with `--ignore "<css selector>"` on `read`; it is saved in the spec and applied by the gate.

Every page is measured twice: 390 px wide as a phone and 1440 px wide. A layer's score is the worse of the two, because a visitor only has one screen.

## 1. pages

Spec: none. Input: the old site's `read.json`, given with `--keep-urls`.
Measured: each old path is requested on the new site.
Rule: a path passes when it answers below 400 after redirects. Paths that were already dead on the old site are not owed anything.
Why first: a beautiful site that loses its addresses loses its search traffic and its bookmarks.

## 2. structure

Spec: none; these are the same for every site.
Measured per page: exactly one h1, a main landmark, a nav landmark, a footer, heading levels that do not skip, no sideways scroll, `lang` on the html element, a title.
Why before colour: a reference can look good and be built badly. Structure is never borrowed from the reference; it is held to the rule.

## 3. colour

Spec: `colour.palette` (hex), `colour.tolerance` (default 0.02).
Measured: the colour of every text run, every filled background, every visible border.
Rule: a use passes when it is within the tolerance of a palette colour in OKLab, a space where equal distances look equally different. 0.02 is about one just-noticeable step: a warm off-white and pure white are 0.022 apart, so they stay two colours. Colours more than half transparent are not counted.
Swap: `layers.mjs colour <spec> <tokens>` replaces this layer from a `fe-pinterest` token file and keeps the role names for the CSS.

## 4. type

Spec: `type.families`, `type.heading`, `type.sizes` (px), `type.weights`.
Measured: first family, size and weight of every element that holds text.
Rule: the family is in the list; the size is within half a pixel of a listed size; the weight is listed.
Note: phone and wide screen sizes both belong in `sizes`. Fluid type (`clamp`) produces in-between sizes and will fail; use stepped sizes or list the steps.

## 5. space

Spec: `space.base` (px), `space.scale` (allowed values off the base).
Measured: padding, vertical margin and flex or grid gap of every element, up to 200 px. Larger gaps are layout, not rhythm.
Rule: a gap passes when it is a multiple of the base within half a pixel, or within half a pixel of a scale value.

## 6. shape

Spec: `shape.radii` (`"12px"`, `"pill"`, `"round"`), `shape.borders` (px).
Measured: corner radius of anything with a fill, an edge, a shadow or an image; width of visible borders.
Rule: listed, within half a pixel. `pill` is any radius of 500 px or more; `round` is 50%.

## 7. depth

Spec: `depth.shadows` (the computed strings).
Measured: `box-shadow` of every element.
Rule: an exact match. Two shadows that differ by a pixel are two shadows.

## 8. motion

Spec: `motion.durations` (ms), `motion.easings`.
Measured: transition and animation durations and the first easing of every element that moves.
Rule: a duration within 10 ms of a listed one; an easing that is listed. If anything on a page moves and its stylesheets contain no `prefers-reduced-motion` rule, the layer is capped at 80 whatever the numbers say. When the stylesheets cannot be read (another origin), that check is skipped, not failed.
Not measured: what moves, in which order, and whether it helps. That is `fe-motion` and a person.

## 9. interaction

Spec: none.
Measured per page: Tab is pressed eight times; each focused control must show an outline or change its look. On the wide screen, up to eight buttons and menu links are hovered; each must change something (colour, background, border, shadow, underline, transform, opacity).
Rule: share that pass. Nothing is clicked.

## The loop

Each full gate run is added to `runs.jsonl`. The verdict comes from this run and the ones before it:

| Verdict | Exit | Meaning | Do |
|---------|------|---------|----|
| PASS | 0 | Every layer at its mark | Hand to `fe-second-eye` |
| FAIL | 1 | Names the lowest layer in the stack that fails, and the try number | Fix that layer only; run again |
| REGRESSED | 1 | A layer that passed last run fails now | Undo the last change to it before anything else |
| STUCK | 3 | The named layer failed three runs without gaining a point | Stop; ask the user |

A run with `--layer` is a spot check. It writes a scorecard but is not logged, so it can neither lock a layer nor count as a try.

The lowest failing layer is named first, not the lowest score, because upper layers sit on lower ones: fixing type before structure means fixing type twice.

## What a draft spec is

`read` keeps, for each layer, the values seen on at least half the pages, then the most used, until 92% of uses are covered or the layer's cap is reached. The rest is listed in `leftOut`. A reference almost never follows its own system fully; on the live site this was tested on, the draft left out 11 colours, 9 type sizes, 8 radii and 11 durations. Those are the reference's accidents. Do not add them back to make a build pass.

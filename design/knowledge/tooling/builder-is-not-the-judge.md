---
title: The builder is not the judge
category: tooling
stack: [process, models]
source: fe-second-eye, added 2026-11-23; not yet run on a live merge
source_type: skill
learned: 2026-11-23
proven: false
uses: 0
---
## Symptom
Every scorecard on a project reads 100. The same model built the screen, judged it and wrote the score, so the score only shows that the model agrees with itself.
## Why
Models rate their own output higher than other output of the same quality (https://arxiv.org/html/2404.13076), and rate the output of models from their own company higher too (https://arxiv.org/html/2609.17857v1). In that study more than half of paired choices also flipped when the two items were shown in the other order.
## Recipe
Measured lines come from a script. Opinion lines come from `fe-second-eye`: a blind before and after, judged in a fresh chat by a model from another company, once in each order, one narrow question at a time. A person outranks every model. `fe-last-eye` refuses a card whose judge is the builder.

```bash
node skills/fe-second-eye/scripts/second-eye.mjs pack --before before.png --after after.png --brief brief.md --out design/reports/second-eye/<screen>/<date>
node skills/fe-second-eye/scripts/second-eye.mjs tally --dir design/reports/second-eye/<screen>/<date> --builder-model <model that built it>
```
## Limit
The script trusts the model name a judge writes on its ballot. A model can write the wrong name. The rule turns self-grading from a silent default into a false statement on a file; it does not make it impossible. For screens staff use every day, book a person.

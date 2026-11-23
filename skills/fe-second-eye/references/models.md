# Choosing the judge

Model names age in weeks. Use the rule; treat the names as an example dated 2026-11-23.

## The rule

1. The judge is from a different family than the builder. Same company counts as the same family, whatever the model is called.
2. Two judges from two families are better than one. A panel of smaller models from separate families tracked human judgment more steadily than one large judge, at about one seventh of the cost (https://arxiv.org/html/2404.18796).
3. A panel does not remove the bias. Judges gave 6.7 points more support to their own family even when no judge graded its own text, so no family may be both the builder and the majority of the panel (https://arxiv.org/html/2609.17857v1).
4. Show both orders. In that study 55.4% of paired choices reversed when the order was swapped. `second-eye.mjs` counts a choice only when it survives the swap.
5. Ask one question at a time and force a choice per question. That is the mitigation that held up in https://arxiv.org/html/2604.22891v2.
6. A person outranks every model. Designers' critiques were preferred over a tuned model's 81% of the time (https://arxiv.org/html/2407.08850).

## Where to read the current ranking

- Building and judging web UI: https://www.designarena.ai/leaderboard (people vote between two built pages).
- Web coding: https://arena.ai/leaderboard/webdev
- Images for `fe-imagery`: https://artificialanalysis.ai/embed/text-to-image-leaderboard/leaderboard/text-to-image

## Example pairing, 2026-11-23

Design Arena overall that day: GPT-6.2 Sol 1404, Claude Fable 5.2 1391, Gemini 4 Neon 1390, GPT-6.2 Astra 1390. The top three are from three families and sit within 14 points, so any of them can judge the other two.

| You build with | Judge with | Second judge |
|----------------|------------|--------------|
| a Claude model | a GPT model | a Gemini model |
| a GPT model | a Claude model | a Gemini model |
| a Gemini model | a Claude model | a GPT model |
| Cursor Composer | a Claude or GPT model | a Gemini model |

## Models that are not judges

- UIClip (https://huggingface.co/biglab/uiclip_jitteredwebsites-2-224-paraphrased) scores a screenshot against a caption. In a trial on 19 phone screens it caught washed-out contrast 19 of 19 and misaligned rows 18 of 19, but preferred a half-size, unreadable copy 17 of 19 times. Use it only as a cheap alarm for a broken render, on a before and after pair. Its absolute score means nothing.
- In a 2024 test, general vision models asked which of two screens was better designed agreed with designers about as often as a coin: 51.6% and 54.6% (https://arxiv.org/html/2404.12500v1). Newer models are stronger, but no public test shows they can be trusted alone. That is why the ballot asks five narrow questions, twice, and a person still outranks it.

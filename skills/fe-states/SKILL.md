---
name: fe-states
description: "Design the six screens every product must share: loading, empty, error, success, offline and not allowed. Covers what the person sees, the one next action, and the sentence shape. Use when a screen is blank, a list can be empty, a save can fail, or products handle those moments differently."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-states

The normal screen is the easy one. Products feel unrelated in the moments around it: a spinner with no words, an empty table, a red paragraph, a dead end after save, a blank page on a bad connection, a person who is signed in but not allowed. Every product in the family uses the same shape for these six. The colors stay with the brand.

## The six
| State | Person sees | One next action | Do not |
|---|---|---|---|
| loading | The place the content will land, already the right height, plus a short label ("Loading trips") | None, unless it has run longer than a few seconds, then "Cancel" or "Retry" | A blank page, a spinner on top of a layout shift |
| empty | What this place is for, in one sentence | The action that adds the first item | "No data" with no action |
| error | What failed, in the product's words, and that the typed work is still there | Retry, or the other path (a form's fix) | Clearing the form, a code, "Something went wrong" alone |
| success | The outcome in the same verb as the button that got them here | The next real task, or a quiet confirmation if the task is done | A new marketing pitch, a modal they must dismiss to see the result |
| offline | That the last action did not send, and what is saved on the device | Retry when the connection returns | Pretending the save worked |
| denied | That this account cannot do this, without blaming the person | The place they can go (back, or ask the owner) | A raw 403, a hidden button with no explanation |

A marketing site uses loading, empty, error and success on every booking or contact flow. Offline and denied matter as soon as the site has an account. An app uses all six.

## Shape
- One sentence, then one action. Two actions only when the second is "Back".
- The action uses the family microcopy shape from fe-family: a verb, the same verb as the task.
- The block sits in the content area, not in a toast the person can miss. A toast may repeat a success. It may not be the only place an error exists.
- Reserve the height before the result arrives so the page does not jump (the hero rule, applied to lists and forms).
- Color comes from the product palette plus one shared meaning: the error color is not a brand color of a sibling product. If the only red is another product's brand, pick a different error color and record it in that product's tokens.

## Procedure
1. For the screen in front of you, list which of the six can happen. A list can be empty. A save can fail. A payment page can lose the connection.
2. Design each one before calling the screen done. Write the sentence and the button label in the product file's notes or on the screen itself.
3. Add the state id to `design/family/products/<product>.json` only after it is in the interface.
4. Run fe-drift. A missing id fails the check. An id with no screen is a false pass. Say which you verified by opening the screen.

## Hand-offs
fe-forms owns field-level errors. This skill owns the screen when the whole action fails. fe-shell owns where the block sits. fe-guard still applies: do not change the request the button sends.

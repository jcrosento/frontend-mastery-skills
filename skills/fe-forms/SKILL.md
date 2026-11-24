---
name: fe-forms
description: "One form grammar for websites and signed-in apps: label above the field, error under it, validate on blur, one primary action, and money and date inputs that do not zoom the phone. Use when building or fixing a booking form, checkout, settings form or any screen where a person types. Not for loading, empty or error screens; use fe-states."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-forms

People decide that a company feels solid while filling a form. A booking page and a settings screen should ask in the same way, even when the brands differ.

## Grammar
- Label above the field, always visible. Placeholder is an example, not the label.
- Help text under the label, or under the field when it is a hint. The error replaces the hint in the same spot. It is not a tooltip and not only a red border.
- One column on a phone. Two columns only when the pair is one idea (first name, last name) and both still fit at 390px.
- One primary button, the family control height (44, or 52 when it is the page's main action). Any other action is a text button.
- The button is a verb from fe-family. It stays disabled only while the request is in flight, and it then shows the loading state from fe-states. Do not disable it because the form is incomplete. Let the person press it and show the field errors.
- On error, keep every value. Move focus to the first invalid field.

## When to validate
- On blur, that field.
- On submit, every field.
- After the first error on a field, on each change, so fixing it clears the message.
- Do not validate on the first keystroke of a field the person has not left.

## Inputs that usually go wrong
- Text is at least 16px, or the phone zooms the page on focus.
- Email, phone, number, date and URL set the matching keyboard (`inputmode` and `type`).
- Money shows the currency the product actually charges. Do not invent a second currency. The field accepts the typed amount. The server still checks it. This skill does not change prices.
- Dates are a real date control, with the month named, not a six-digit string the person has to guess.
- A required field says so in the label ("Phone, required"), not only with an asterisk.

## Website and app
The grammar is the same. A website form lives in the page. An app form lives in fe-shell's content area and uses the page's one primary action, so there are not two competing save buttons.

## Procedure
1. Mark every field: label, required or not, keyboard, error sentence.
2. Build the six surrounding states with fe-states for the submit action (loading, error, success, offline at minimum).
3. Check at 390 and 1440: nothing covered, nothing cut off, the primary action visible without hunting.
4. On an existing app, run fe-guard. The form may change markup and styles. It may not change the request, the field names the server already accepts, or the price.

## What you write
The form, and `design/reports/forms.md`: one row per field (label, required, keyboard, error sentence) and the result of the 390 and 1440 check.

## Hand-offs
Field errors are this skill. The whole-page failure is fe-states. Token sizes are fe-family and fe-drift. Backend and payment logic stay out of the UI change.

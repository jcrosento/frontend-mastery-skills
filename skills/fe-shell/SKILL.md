---
name: fe-shell
description: "One signed-in frame for every app: where navigation sits, where the page title and the one primary action sit, and where settings and the account menu live. Use when building or aligning a SaaS shell, a dashboard frame, or logged-in navigation across products."
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-shell

Signed-in products feel like one company when the frame is the same, even if the colors are not. A marketing site does not wear this frame. It keeps the header and footer from fe-consistency. The moment a person is signed in, this skill takes over.

## The frame
Five regions, in this order of importance:
1. **Current page.** Title, and the one primary action for this page (fe-forms if it submits). The title says the place, not the company slogan.
2. **Navigation.** The product's main places. Same order on every page. Icons from that product's one icon set, at the family icon size, with a text label. Icon-only is allowed only when the label appears on focus or hover and the hit target is still 44.
3. **Account.** One menu: who is signed in, settings, sign out. It is not a second navigation.
4. **Content.** The work. Width is consistent inside the product. Lists, forms and the six states from fe-states all sit here.
5. **Product mark.** The product's own logo, linking to its home. Not a sibling product's logo.

On a phone the navigation becomes a list the person opens. The title and the primary action stay on screen. Do not hide the only way to save behind that list.

## What stays different
- Colors, logo and product name, from the family product file.
- Which items are in the navigation. A booking site's account area and a finance app do not pretend to have the same sections. The positions of those sections follow the frame. The names do not.
- Settings live in the account menu in every app, not sometimes in the nav and sometimes in a footer.

## Procedure
1. Sketch the five regions on one existing screen before applying them everywhere.
2. Move pages into the frame without adding or removing a route. On an existing app, fe-guard runs first. Navigation rules and who may open a page are not UI.
3. Check 390, 768 and 1440. At 390 the open navigation covers the work and closes on the same control that opened it. Nothing scrolls sideways.
4. Confirm loading, empty, error, denied and offline from fe-states render inside the content region, with the frame still visible, so the person can leave.

## Hand-offs
fe-family holds the sizes. fe-forms holds anything the primary action submits. fe-consistency holds the public header and footer of a `site`. A `site` with a small signed-in area uses this frame only behind sign-in.

# iOS Camera - interaction patterns

Studied: Photo and Slo-mo viewfinder, mode strip, zoom chips, top control cluster, options sheet, settings panel, empty gallery. Category: single-purpose capture tool. Why it matters: the clearest example of one dominant action and everything else receding.

Measured 2026-11-13 from five owner-supplied screenshots (iOS 26, 923x2000 px). Device: iPhone 14 Pro Max, confirmed by the owner, so sizes are logical points on its 430x932 pt screen; `tokens.json` also gives every size as a fraction of screen width, which holds on any device. Names in brackets are tokens in `tokens.json`. Tolerance +/-2 px, about 1 pt.

### cam-01  single-primary-action-thumb-zone
- where: shutter button, bottom centre
- measured: disc 68 pt across, 15.7% of screen width [shutter.disc]; outer ring 81 pt, its lower edge 114 pt above the screen bottom [shutter.outer]. The disc is about 1.4x the 48 pt secondary buttons on the same screen. Ring stroke width not measured.
- job: the one thing the user came to do is the largest, most central, most reachable target
- maps_to: seatours/every-page (Book / Check dates); ledgera/release-flow (Capture proof)

### cam-02  mode-strip
- where: horizontally scrolling labels under the viewfinder; current mode highlighted
- measured: strip 48 pt tall, 34 pt above the screen bottom, width wraps its labels (176 pt for two) [mode-strip]; selected mode pill 103 x 48 pt, full strip height [mode-pill.selected]; flanked by two 48 pt round buttons 34 pt from each side edge [thumb-well, flip-button]. Label type size not measured.
- job: switch between a small set of top-level states with one swipe, always knowing which state you are in
- maps_to: seatours/tours (Island hopping, Expedition, Private, Transfer); ledgera/disbursement (Request, Release, Reconcile)

### cam-03  zoom-chips
- where: .5 / 1x / 2 / 3 values above the shutter
- measured: selected value sits in a 38 pt circle [zoom.selected]; four values on a 39 pt centre-to-centre pitch, unselected values are bare text with no container [zoom.labels]. Gap to shutter: the row sits between 667 and 705 pt from the top, the shutter ring starts at 738 pt.
- job: a compact selector for a few discrete values, positioned next to the primary action
- maps_to: seatours/tours (Half day, Full day, 3D2N, 5D4N); ledgera/reports (Week, Month, Quarter, Year)

### cam-04  muted-settings-cluster
- where: top-right group of four small icons
- measured: four icons 13 to 18 pt wide on a 34 to 37 pt pitch, group 120 pt wide, 27 pt from the right edge, 96 pt from the top [cluster.icons]. TODO(fe-inspect) container height and inactive opacity: the container is translucent glass over a bright viewfinder and cannot be separated from the image behind it.
- job: secondary controls grouped and dimmed so they never compete with the primary action
- maps_to: seatours/header (currency, language, contact); ledgera/header (filters, export, settings)

### cam-05  options-sheet-large-targets
- where: sheet that rises from the bottom edge when the options control is tapped (Flash, Exposure); the viewfinder stays visible above it
- measured: sheet 414 x 163 pt, inset 8 pt from the sides and bottom, 17.5% of screen height [sheet]; two round targets 68 pt across, 130 pt centre to centre, each with a text label beneath [sheet.target-1, sheet.target-2]. The related settings panel at the top is 414 x 84 pt with the same 8 pt side inset [panel].
- job: rarely used settings appear on demand as a few large labelled targets in thumb reach, without leaving the task or covering it
- maps_to: ledgera/send-money (attach, note, split - options that are not needed on every request); seatours/booking (add-ons, guest count)

### cam-06  round-nav-buttons
- where: top corners of the gallery screen reached from the thumbnail well
- measured: two round buttons 44 pt across, 20 pt from the side edges, 59 pt from the top [nav-button.back, nav-button.library]
- job: back and one alternative destination, at the platform's minimum comfortable touch size, with nothing else in the bar
- maps_to: ledgera/detail-screens (Back, More); seatours/tour-detail (Back, Share)

# iOS Camera - interaction patterns

Studied: Photo mode viewfinder, mode strip, zoom chips, top control cluster. Category: single-purpose capture tool. Why it matters: the clearest example of one dominant action and everything else receding.

### cam-01  single-primary-action-thumb-zone
- where: shutter button, bottom centre
- measured: TODO(fe-inspect) diameter, ring width, distance from bottom edge
- job: the one thing the user came to do is the largest, most central, most reachable target
- maps_to: seatours/every-page (Book / Check dates); ledgera/release-flow (Capture proof)

### cam-02  mode-strip
- where: horizontally scrolling labels under the viewfinder; current mode highlighted
- measured: TODO(fe-inspect) label type size, spacing, highlight treatment, strip height
- job: switch between a small set of top-level states with one swipe, always knowing which state you are in
- maps_to: seatours/tours (Island hopping, Expedition, Private, Transfer); ledgera/disbursement (Request, Release, Reconcile)

### cam-03  zoom-chips
- where: .5 / 1x / 2 / 3 chips above the shutter
- measured: TODO(fe-inspect) chip diameter, gap, selected size delta
- job: a compact selector for a few discrete values, positioned next to the primary action
- maps_to: seatours/tours (Half day, Full day, 3D2N, 5D4N); ledgera/reports (Week, Month, Quarter, Year)

### cam-04  muted-settings-cluster
- where: top-right pill with flash, night, live, more
- measured: TODO(fe-inspect) pill height, icon size, opacity of inactive state
- job: secondary controls grouped and dimmed so they never compete with the primary action
- maps_to: seatours/header (currency, language, contact); ledgera/header (filters, export, settings)

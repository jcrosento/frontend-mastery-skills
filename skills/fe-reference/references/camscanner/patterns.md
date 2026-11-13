# CamScanner (iOS) - interaction patterns

Studied: Files tab with a row swiped open, capture screen in Scan and Sign modes. Category: document capture and filing. Why it matters: capture -> review -> file is the same loop as receipt -> approve -> ledger.

Measured 2026-11-13 from three owner-supplied screenshots (dark theme, 923x2000 px; a fourth screenshot was supplied and not used). Device: iPhone 14 Pro Max, confirmed by the owner, so sizes are logical points on its 430x932 pt screen; `tokens.json` also gives every size as a fraction of screen width. Names in brackets are tokens in `tokens.json`. Tolerance +/-2 px, about 1 pt. The Home tab was not supplied, so Home patterns stay unmeasured.

### cs-01  swipe-row-actions
- where: Files list; left swipe on any row
- measured: action cells 63 to 64 pt wide and 80 pt tall, the full row height, each a solid colour with an icon and a one-word label [swipe.cell-1, swipe.cell-2, swipe.cell-3]. Three cells measured; a fourth continues to the screen edge and was not measured separately. Icon size not measured.
- job: exposes the 3-4 most frequent per-item actions without leaving the list or opening a menu
- maps_to: ledgera/disbursement-list (Approve, Reject, Attach photo, Note); seatours/tour-list (Save, Share, WhatsApp, Compare)

### cs-02  filter-chips
- where: Files; horizontal chip row directly under the count header
- measured: chips 24 pt tall, 8 pt apart, first chip 16 pt from the left edge, widths 51 to 109 pt set by the label, corner radius 4 pt [chips]. Horizontal padding not measured.
- job: one-tap narrowing of a long list by category, scrolls horizontally, selected state obvious
- maps_to: ledgera/custody-balances (Department, Status, Period); seatours/tours (El Nido, Coron, Linapacan, Private)

### cs-03  count-header
- where: Files; item count plus storage meter at top
- measured: TODO(fe-inspect) header height, type size of count, meter height. Text on a flat background; the measurer reads shapes, not type.
- job: tells the user the size of what they are looking at before they scroll; turns a list into a live signal
- maps_to: ledgera/approvals ("14 pending - PHP 2.4M in custody"); seatours/tours ("12 departures this week")

### cs-04  quick-action-grid
- where: Home; 2 rows x 4 icons above Recents
- measured: TODO(fe-inspect) cell size, icon size, label type size, row gap. No Home screenshot has been supplied.
- job: puts the eight most common entry points one tap from launch
- maps_to: ledgera/home (New request, Capture, Approve, Reports, Custody, Sheets sync, Xero, Settings); seatours/home (8 destinations)

### cs-05  recents-four-slot-row
- where: Files; thumbnail + title + date + page count, fixed grid
- measured: thumbnail 63 pt square, 16 pt from the left edge; rows repeat every 80 pt, corner radius 4 pt [row.thumb-1, row.thumb-2]. Title and date type sizes not measured.
- job: every row scans in one pass because the four slots never move
- maps_to: ledgera/recent-transactions (receipt thumb, payee, date, amount); seatours/tour-card (photo, name, next departure, seats left)

### cs-06  bottom-nav-centre-fab
- where: all tabs; 5-slot bar with raised centre camera button
- measured: centre button 59 pt across, horizontally centred, its lower edge 42 pt above the screen bottom [fab]. TODO(fe-inspect) bar height: the bar is translucent over the list and has no measurable edge.
- job: the single most important action is always under the thumb, visually separated from navigation
- maps_to: ledgera/mobile (Capture receipt); seatours/mobile (Book)

### cs-07  three-tile-shortcut-row
- where: Files; three equal tiles at the top, above the count header and filter chips
- measured: three tiles 126 x 92 pt, 10 pt apart, 16 pt from each side edge, corner radius 8 pt [tiles]; a full-width folder row in the list below is 398 x 60 pt with a 4 pt corner radius [folder-row]
- job: three fixed destinations get equal, large targets; the row never scrolls and never grows a fourth
- maps_to: ledgera/home (Send money, Approve, Report); seatours/home (Tours, Expeditions, Transfers)

### cs-08  capture-shutter
- where: capture screen, Scan mode
- measured: outer ring 69 pt, inner disc 52 pt, ring's lower edge 104 pt above the screen bottom [shutter.outer, shutter.disc]. Within 12 pt of the iOS Camera shutter (cam-01) in size and position.
- job: keeps the capture control where the platform camera taught the user to expect it
- maps_to: ledgera/receipt-capture; seatours/guest-id-upload

### cs-09  single-filled-button
- where: capture screen, Sign mode intro card
- measured: one filled button 349 x 45 pt, 40 pt from each side edge [cta]
- job: a first-use screen offers exactly one filled action; everything else is text
- maps_to: ledgera/empty-states (Send first request); seatours/empty-cart (Browse tours)

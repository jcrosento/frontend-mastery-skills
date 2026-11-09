# CamScanner (iOS) - interaction patterns

Studied: Home, Files, Tools, Me tabs; swipe actions on Files rows. Category: document capture and filing. Why it matters: capture -> review -> file is the same loop as receipt -> approve -> ledger.

### cs-01  swipe-row-actions
- where: Files list; left swipe on any row
- measured: TODO(fe-inspect) reveal width, action cell width, row height, icon size
- job: exposes the 3-4 most frequent per-item actions without leaving the list or opening a menu
- maps_to: ledgera/disbursement-list (Approve, Reject, Attach photo, Note); seatours/tour-list (Save, Share, WhatsApp, Compare)

### cs-02  filter-chips
- where: Files; horizontal chip row directly under the count header
- measured: TODO(fe-inspect) chip height, horizontal padding, gap, radius
- job: one-tap narrowing of a long list by category, scrolls horizontally, selected state obvious
- maps_to: ledgera/custody-balances (Department, Status, Period); seatours/tours (El Nido, Coron, Linapacan, Private)

### cs-03  count-header
- where: Files; "All (63)" plus storage meter at top
- measured: TODO(fe-inspect) header height, type size of count, meter height
- job: tells the user the size of what they are looking at before they scroll; turns a list into a live signal
- maps_to: ledgera/approvals ("14 pending - PHP 2.4M in custody"); seatours/tours ("12 departures this week")

### cs-04  quick-action-grid
- where: Home; 2 rows x 4 icons above Recents
- measured: TODO(fe-inspect) cell size, icon size, label type size, row gap
- job: puts the eight most common entry points one tap from launch
- maps_to: ledgera/home (New request, Capture, Approve, Reports, Custody, Sheets sync, Xero, Settings); seatours/home (8 destinations)

### cs-05  recents-four-slot-row
- where: Home and Files; thumbnail + title + date + page count, fixed grid
- measured: TODO(fe-inspect) thumbnail size, row height, title/date type sizes
- job: every row scans in one pass because the four slots never move
- maps_to: ledgera/recent-transactions (receipt thumb, payee, date, amount); seatours/tour-card (photo, name, next departure, seats left)

### cs-06  bottom-nav-centre-fab
- where: all tabs; 5-slot bar with raised centre camera button
- measured: TODO(fe-inspect) bar height incl. safe area, FAB diameter, FAB elevation
- job: the single most important action is always under the thumb, visually separated from navigation
- maps_to: ledgera/mobile (Capture receipt); seatours/mobile (Book)

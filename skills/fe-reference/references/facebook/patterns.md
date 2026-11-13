# Facebook (mobile) - interaction patterns

Status: candidate, unmeasured. These blocks are written from general familiarity with the app, not from screenshots. They may be scored in a decision matrix but cannot be cited in a brief until screenshots are supplied and fe-inspect has measured them. Layout details change between app versions; confirm each `where` line against current screenshots before measuring.

Category: social feed. Why it is a candidate: for many users it is the app they have spent the most hours in, so its feed, composer and reaction mechanics are deeply learned.

### fb-01  bottom-tab-bar
- where: main screen; row of icon tabs with the current tab highlighted
- measured: TODO(fe-inspect) bar height, tab count, icon size, selected treatment. No screenshot supplied.
- job: a handful of top-level destinations stay one tap away on every screen
- maps_to: ledgera/mobile (Home, Requests, Approvals, Reports); seatours/mobile (Home, Tours, Trips, Account)

### fb-02  composer-prompt-row
- where: top of the feed; avatar plus a one-line prompt that opens the full composer
- measured: TODO(fe-inspect) row height, avatar size, prompt field height. No screenshot supplied.
- job: starting the most common action looks like answering a question, not filling a form
- maps_to: ledgera/home (start a cash request from one line); seatours/home ("Where do you want to go?")

### fb-03  feed-card
- where: feed; header (avatar, name, time), body, media, action row
- measured: TODO(fe-inspect) header height, avatar size, action row height, card gap. No screenshot supplied.
- job: every item has the same four parts in the same order, so a long mixed list scans quickly
- maps_to: ledgera/activity (who, when, what, amount, actions); seatours/tour-card

### fb-04  inline-action-row
- where: bottom of each feed card; a few equal-width text-and-icon actions
- measured: TODO(fe-inspect) row height, target width, icon size. No screenshot supplied.
- job: the two or three things you can do to an item sit on the item, always in the same place
- maps_to: ledgera/request-card (Approve, Ask, Reject); seatours/tour-card (Save, Share, Book)

### fb-05  count-badge
- where: tab icons and the notification entry; small numbered badge
- measured: TODO(fe-inspect) badge diameter, offset from the icon. No screenshot supplied.
- job: tells the user what needs attention before they open anything
- maps_to: ledgera/approvals (items waiting for you); seatours/trips (unpaid bookings)

### fb-06  skeleton-then-content
- where: feed while loading; grey placeholder cards in the shape of real ones
- measured: TODO(fe-inspect) placeholder block sizes, count shown. No screenshot supplied.
- job: the screen keeps its shape while data arrives, so nothing jumps
- maps_to: ledgera/lists (requests, balances); seatours/search-results

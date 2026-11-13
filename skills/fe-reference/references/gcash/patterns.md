# GCash (mobile) - interaction patterns

Status: candidate, unmeasured. These blocks are written from general familiarity with the app, not from screenshots. They may be scored in a decision matrix but cannot be cited in a brief until screenshots are supplied and fe-inspect has measured them. Layout details change between app versions; confirm each `where` line against current screenshots before measuring. Do not capture screenshots that show a real balance, account number or name; use a state with those hidden.

Category: mobile wallet. Why it is a candidate: sending money, confirming it and getting a receipt is the same job as a cash request and release, and it is a money app users in the Philippines already operate daily. The familiarity score in a matrix still needs its own cited source.

### gc-01  balance-header
- where: home; one large amount at the top with a show/hide control
- measured: TODO(fe-inspect) header height, amount type size, control size. No screenshot supplied.
- job: the single number the user came to check is the first and largest thing on the screen
- maps_to: ledgera/home (cash in custody); ledgera/department (available to request)

### gc-02  service-grid
- where: home; grid of icon-plus-label shortcuts under the balance
- measured: TODO(fe-inspect) columns, cell size, icon size, label size, row gap. No screenshot supplied.
- job: the few most common money actions are one tap from launch, each with a plain label
- maps_to: ledgera/home (Send money, Liquidate, Approve, Report); seatours/home (destinations)

### gc-03  amount-entry
- where: send flow; one screen with the amount as the main field
- measured: TODO(fe-inspect) field height, amount type size, keypad or keyboard treatment, button position. No screenshot supplied.
- job: one question per screen, with the answer large enough to verify at a glance
- maps_to: ledgera/send-money (amount step); seatours/checkout (deposit amount)

### gc-04  review-before-send
- where: send flow; summary of recipient, amount and fee with one confirm button
- measured: TODO(fe-inspect) row height, label and value alignment, button size and position. No screenshot supplied.
- job: the user sees exactly what will happen, once, before money moves
- maps_to: ledgera/send-money (confirm); ledgera/approve-and-sign; seatours/checkout (review)

### gc-05  receipt-screen
- where: after a successful send; amount, reference number, date, and share or save actions
- measured: TODO(fe-inspect) amount size, row heights, action placement. No screenshot supplied.
- job: proof that it worked, with the reference a person will be asked for later
- maps_to: ledgera/release (proof of release); seatours/booking-confirmed

### gc-06  transaction-row
- where: history; title, date, signed amount aligned right
- measured: TODO(fe-inspect) row height, type sizes, amount alignment. No screenshot supplied.
- job: money in and money out are distinguishable in one glance down the right edge
- maps_to: ledgera/ledger-list; ledgera/liquidation

# iOS Camera - where it applies

Status: agent draft, not yet confirmed by the owner. Treat the table as a starting hypothesis for the decision matrix, not as a decision; the matrix still has to be scored per flow.

| Venture | Flow | Why this app | Patterns |
|---------|------|--------------|----------|
| Kael (ledgera) | Receipt and proof capture | Same task: point, capture, confirm. Users already know where the shutter is | cam-01, cam-05, cs-08 |
| Kael (ledgera) | Home, one dominant action per screen | "Send money" is to Kael what the shutter is to Camera | cam-01, cam-04 |
| Kael (ledgera) | Switching between a few top-level states | Request / Release / Reconcile behave like camera modes | cam-02 |
| Seatours | Mobile booking bar | One primary action (Book) with secondary controls dimmed | cam-01, cam-04 |
| Seatours | Trip length and date-range pickers | A few discrete values next to the primary action | cam-03 |

Poor fit: dense tables, multi-step forms and anything text-heavy. Camera has almost no text and no lists; use CamScanner or a candidate app for those.

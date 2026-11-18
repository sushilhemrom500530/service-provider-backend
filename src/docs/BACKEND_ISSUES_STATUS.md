# Backend issues: status (updated 17 Nov 2026)

Answers QA's `docs/backend_issues.md`, item by item. "Fixed" means fixed in the backend code on branch `dev-16-11-26`, with automated tests. Every fix reaches the shared test server only after a deploy, so **deploy the new backend and stop any older server version** still connected to the same database.

Status legend: ✅ fixed · 🟡 fixed in code, live data or an action still needed · ⏳ waiting for a decision / go-ahead · ℹ️ not a bug.

---

## M4. Completion text offered a review that couldn't be given (17 Nov 2026, 17:50 BDT)

| # | Problem | Status | What changed |
|---|---|---|---|
| M4 | "You can now leave a review" was sent even when the customer had already reviewed the listing | ✅ | The completion notification (provider "Mark as done" and automatic completion) follows the same rule as the booking's `review` action: one review per customer per listing, none after a no-show. The rule is checked against the database when the notification is sent. Can review: "We hope you enjoyed Après-Ski Sports Massage. You can now leave a review." Already reviewed: "We hope you enjoyed Après-Ski Sports Massage." (manual completion: "Thanks for visiting …"). `data.canReview` (true/false) tells the app whether to show a Review button. |

**Q1 (multi-day ski passes):** still open, waiting for the product decision.

Tests: `booking.completedReview.test.ts` (4). Full suite: **228 passed**.

---

## S. Ski Pass report of 17 Nov 2026 (16:50 BDT)

| # | Problem | Status | What changed |
|---|---|---|---|
| S1 | "Booking confirmed" didn't name the pass or the day | ✅ | "6-Day 3 Valleys Pass on Fri 20 Nov is confirmed. Ticket TKT-935691." Same treatment for every booking text that lacked it: the customer's "Payment received for … on …", the provider's "<customer> booked / requested <listing> on …", and the approval "… on … has been confirmed by the provider". Ski Pass shows the day only; other services show the day and time. `data.startAt` (plus `ticketNumber` or `approveBy`) carries the exact values. |
| S2 | Ski Pass accepted 11 people | ✅ | Limit of **10 people per booking**, checked on `POST /booking/intent` and again on `create`. Above it: **400** "A ski pass booking is for up to 10 people. Make a second booking for more." The ski pass detail returns `maxPeoplePerBooking: 10`, so the app can read the limit instead of hard-coding it (one constant: `POLICY.SKI_PASS_MAX_PEOPLE`). Other services keep their own limits (massage `capacity`, restaurant seats, vehicle seats). |

**Q1 (multi-day passes):** unchanged and still open. Today "6-Day" is only part of the name, and a booking covers the chosen day. A real multi-day pass needs a `days` field on the listing (product decision).
**Q2 (restaurant service fee):** done, see section R. The provider gets €48 and the platform €17 on a €65 lunch.

Tests: `booking.skiPass.test.ts` (5). Full suite: **224 passed**.

---

## R. Restaurant service fee goes to the platform (17 Nov 2026)

**Decision:** the restaurant service fee is platform money, as the admin panel already describes it ("supports platform operations…").

| | Before | Now |
|---|---|---|
| Lunch €65 (seats €60 + fee €5), 20 % commission | provider €52, platform €13 | provider **€48** (60 × 80 %), platform **€17** (12 + 5) |
| Late customer cancel (90 % back), €6.50 kept | provider €5.20, platform €1.30 | provider **€4.80**, platform **€1.70** (the €0.50 fee share stays with the platform) |
| Full refund (reject / expiry / cancel > 24 h) | nobody keeps anything | unchanged; the fee goes back to the card too |

What changed:
- **Booking:** stores `serviceFee` when it is created. Older restaurant bookings without it use their restaurant's fee at payout, and it is then recorded.
- **Payout:** one rule, `payBookingShare`, for completion (manual and automatic), the share kept on a late customer cancel, and admin refunds of an open booking. The service fee in what is kept goes to the platform in full; the provider is paid on the rest, minus the commission. `platformFee` on the booking = commission + service fee.
- **Refunds after payout and disputes:** they take back the stored `providerEarning` / `platformFee` pro rata, so the fee is returned correctly too.
- **Provider earning on a booking:** new `serviceFee` field: `{ gross: 65, serviceFee: 5, platformFee: 17, net: 48 }`.
- **Provider dashboard:** `pending` leaves out the service fee.
- Other services have no service fee and are unchanged.

**Data:** today's lunch (`…264bd9`, €65, still unpaid) will be paid under the new rule: provider +€48, platform +€17. Three restaurant bookings paid out **before** this change gave the €5 fee to the provider (about €9.60 too much in total). They are left as they were.

Tests: `booking.serviceFee.test.ts` (10). Full suite: **219 passed**.

---

## M. Massage report of 17 Nov 2026 (15:40 BDT)

| # | Problem | Status | What changed |
|---|---|---|---|
| M1 | The same time could be booked again and again | ✅ | New listing field **`capacity`**: guests at the same time (therapists), 1-50, **default 1**, also accepted as `therapists`. `POST /booking/intent` / `create` count the open bookings (waiting, accepted, in progress) that overlap the session, using the **peak** number of guests at any moment. A full time gets **409** "This time is already booked. Choose another time." (or "Only N places left…"); more people than `capacity` gets **400**. Sessions that only touch (11:00-12:00 and 12:00-13:00) don't clash, and cancelled or rejected bookings free the time. If two customers pay for the last place at the same moment, the later booking is refused and refunded automatically. **Availability:** `?date&duration` returns every start time (every 30 min; `step` 15/30/60) with `available`, `left` and `isPast`, so the app can grey out taken times; `?date&time&duration` returns `available`, `left` and `reason` (`booked`, `closed`, `past`, `too_many_guests`). |
| M2 | The customer's cancel text didn't say which booking | ✅ | "Après-Ski Sports Massage on Tue 17 Nov, 12:00 PM CET was cancelled. €90.00 (90%) is refunded to your card." Plus `data: { startAt, refunded, percent }`. |
| M3 | The provider's "cancelled by customer" text had no date | ✅ | "A booking for Après-Ski Sports Massage on Tue 17 Nov, 12:00 PM CET was cancelled by the customer." Plus `data.startAt`. The rejected, expired and admin-refund texts now carry the date too, in every category. |

**Answers to the questions (as built)**
1. **Capacity:** set per listing by the provider (`capacity`), default 1 (one therapist). The listing form needs a "Guests at the same time / therapists" field (app and admin).
2. **Price per person:** yes. The total is the duration price × `personCount`, and the unit now reads `per_person` (was `per_session`). With capacity 1, a booking is for one guest; a provider with 2 therapists sets `capacity: 2` to accept couples.
3. **Session never marked done:** completed automatically at its end (start + duration) by the minute job; the provider is paid, and the customer gets "Booking completed… leave a review". There is no no-show for Massage.
4. **Provider cancels an accepted booking:** allowed until the start time, always with a 100% refund (`reject`). Label it "Cancel booking" in the app when the status is `Confirmed`.

**App:** use the day slots to grey out taken times, show `capacity` on the form, read the unit `per_person`, and handle 409 on intent ("choose another time").

Tests: `booking.massage.test.ts` (16). Full suite: **209 passed**.

---

## T. Transport report of 17 Nov 2026 (12:45 BDT)

| # | Problem | Status | What changed |
|---|---|---|---|
| T1 | A car not returned can be booked again | ✅ | A rental handed over and past its end without a return keeps the vehicle busy until it is returned, at the latest the 48 h auto-close. `POST /booking/intent` → 409 "This vehicle has not been returned by the previous customer yet…". Availability returns `reason: "not_returned"`. The next booking can't be handed over while the car is out. The same rule applies to Ski Hire units. (`booking.availability.ts`, `booking.lifecycle.ts` hand-over) |
| T2 | Insurance and maintenance fees | ✅ | **Decided: one all-inclusive trip price.** The fees are removed from the model, validation and responses, and the booking price is unchanged (`amount` only). `POST /transport` no longer requires them; older apps that still send them get no error, and the values are ignored and never stored. Stored listings cleaned (`npm run migrate:transport-fees -- --apply`: 4 listings, 0 left). Admin panel: the Insurance and Maintenance cards were removed from the listing detail page. **App:** stop sending the `0`s. |
| T3 | Unread count differs between socket and REST | ✅ | Both now use one count, `ChatService.unreadCounts`: messages from the other person not read by me (and not deleted by me). The stored counter on the chat is no longer used for the badge. REST leaves out deleted chats, like the socket. The seed now makes the stored state consistent. |
| T4 | Category logos swapped | 🟡 | **Not a code bug.** The original data already had these images: "Audi" has the Toyota logo, "Hino" has the Acura logo (and "Suzuki" too). The seed only kept them by name. **Action:** the admin uploads the right logos (Admin → Category → Transport), or OK to rename those sub-categories "Toyota" / "Acura". |
| T5 | Provider names "ebu", "", "N/A" | 🟡 | `fix:owner-names` applied: "N/A" → "Mynul Islam" (`68fccd9d…`). Still to do: provider `6902d955…` (Transport) and `68f8c4c0…` have **no name stored anywhere**, so the user or an admin must enter it; the app shows "Provider" meanwhile. "ebu" is a real name: the user or an admin changes it. |
| T6 | No notification for a no-show | ✅ | Both sides get `booking.no_show`. Customer: "… was not picked up, so the booking is closed as a no-show. The €420.00 payment is not refunded." Provider: "… €378.00 is added to your wallet." |
| T7 | Late fee text gives the wrong delay | ✅ | "… was returned 15 min late. Late fee: €45.00 (1 started hour)." `data: { lateMinutes, chargedHours, lateFee, currency }`. |
| T8 | Money not formatted | ✅ | Every booking, refund, late-fee and withdrawal text uses `formatMoney` → "€45.00". |

**Answers to the questions**
1. **Fees:** removed; the trip price is all-inclusive (T2).
2. **Car not returned:** no longer bookable (T1).
3. **Chauffeur or self-drive:** the backend works as a **self-drive rental** (hand-over, return, late fee). "Professional driver" is only the seed's demo description. If it is a chauffeur service, the texts and the late fee need a product decision.
4. **No-show:** as built, it is `Completed`, `noShow: true`, with no refund and the provider paid. Product to confirm. Both sides are now notified.
5. **Early hand-over:** allowed today with no limit; it is only refused after the end time. A car still out with the previous customer now blocks it (T1). Tell us if a limit is wanted, e.g. "not more than 1 h before the start".

Tests: `booking.transport.test.ts` (12), `chat.unread.test.ts` (3), `transport.test.ts` (+4 for T2). Full suite: **194 passed**.

---

## 0. Retest of 17 Nov 2026

### Bugs
| # | Issue | Status | Cause / what was done |
|---|---|---|---|
| 1 | Auto-cancelled booking became `Completed` at its end time (`6afbcf03…3010`) | ✅ code · ⏳ old server | **Cause:** an **old server build (April 2026)** is still running on the same database. Its 5-minute timer sets every booking past its end to Completed and only skips bookings already Completed. Proof in the DB: status changed at exactly 03:55:00 (a timer), **no `completedAt`** (the new code always writes it), and `cancelledAt` + the €38 refund were still stored. **Fix:** a booking with `cancelledAt` but no `completedAt` is always `Cancelled` (no review, cancellation shown), and the stored status is put back on the next read or job run. Refund and payout untouched. **Still needed: stop the old process.** Booking `6afbcf03…` is repaired automatically after this deploy. |
| 2 | `earning` leaves out the late fee | ✅ | New `earning.lateFee {gross, platformFee, net, status}`: `pending` while due, `paid` with the split once paid (matches the wallet). `gross`/`net` stay the booking price. Guide §4, §6.4. |
| 3 | Raw ISO time in notification text | ✅ | Texts now say e.g. "return it by Wed 18 Nov, 5:00 PM CET". The exact time is in the new `data` field (`returnBy`, `approveBy`). Both places that had ISO text were fixed (hand-over, new booking request). Guide §8. |
| 4 | Database reset at 02:50 UTC | ℹ️ | Not the deploy: the demo-data seed (`npm run seed`) was run by hand, on purpose. Deploys never run it. A full backup exists (`backups/seed-20261117-084949`). **Production needs its own database** (today test and `.env` share one). |

### Still open from earlier
| Item | Status | Result |
|---|---|---|
| Change password, wrong current password → 401 | ✅ | Now **400** "Current password is incorrect." |
| Login wording | ✅ | "Password is incorrect." |
| Sign-up with an existing email | ℹ️ | **400** "User already exists."; the existing account is never changed (tested). |
| Account deletion | ✅ | New `DELETE /users/me`: refused (409, with reasons) while bookings are open, a late fee is unpaid, or a provider has money / a pending withdrawal; otherwise personal data is removed, listings are taken down, sessions end, email freed; bookings/payments/reviews stay anonymised ("Deleted user"). Guide §12. |
| Review list shapes | ✅ | Massage now returns `data: [...]` + `rating` like the others. Every review has an `id` (the old ones without were removed with the reseed). |
| Provider name "N/A" | 🟡 | Old data only (3 users). `npm run fix:owner-names` cleans it; waiting for your OK. |
| Transport fees | ⏳ | Product decision. |
| Withdraw test | ⏳ | Waiting for the go-ahead. |

### Answers to QA's backend questions
1. **Old server:** yes, one is still connected (see bug 1). Stop it.
2. **Database reset:** a manual demo seed, not the deploy (see bug 4).
3. **Late fee in `earning`:** `earning.lateFee {gross, platformFee, net, status}`.
4. **Late fee cap:** the booking price, for every return (manual and the 48 h auto-return).
5. **No-show:** not refunded; the provider gets the price minus the platform fee. Product owner to confirm the policy.
6. **Pending refund:** retried every minute (from about 2 min after the cancel), normally done in about 3 min once Stripe is reachable. Both sides get the cancel notification when the refund is done.
7. **Time zone:** one zone for the whole platform (`BUSINESS_TIMEZONE`, default Europe/Paris), not per listing.
8. **Socket:** API host without `/api/v1`. On `sushil5000.ssh.bd` the handshake and the WebSocket upgrade (101) work.
9. **Sign-up with an existing email:** 400, account unchanged.
10. **Account deletion:** done (see above).
11. **Change password:** done, 400.
12. **Withdraw test:** waiting for the go-ahead.

**Tests:** `booking.retest.test.ts` (6), `accountDeletion.test.ts` (7); 175 passing in total.

---

## 1. Must-fix bugs

### #0 Unreturned rental completed at its end time, provider paid (booking `6afacb41…a440`) ✅
- **Cause:** an **old server version** was still running on the same database. Its timer marks every Ski Hire booking past its end time `Completed`, without checking hand-over or return. The new code's payout job then trusted that status and paid the provider.
- **Fix:**
  - The new code ignores a `Completed` it didn't set itself: such a completion has no `completedAt`. The booking is reopened automatically: a handed-over rental stays `InProgress` with the overdue timer until `return`, or until the 48 h auto-return with the late fee.
  - No payout without a real completion.
  - The rented unit stays blocked for other customers.
  - The server logs a warning when this happens.
- **Tests:** `booking.foreignCompletion.test.ts` (5 tests).
- **Still to do:**
  - Stop the old server, or deploy the new one over it.
  - `6afacb41…a440` stays completed: the provider was paid €20 of test money. That €20 can be reversed on request.

### #0b Customer cancel didn't refund (booking `6afacc06…a56c`) ✅
- **Cause:** Stripe **did** refund the €25 to the card. The server process restarted 6 seconds later, before it wrote the refund to the database. Nothing ever finished it, and the webhook ignored app-made refunds.
- **Fix (crash-safe cancellation):**
  - The refund owed is saved in the same update that cancels.
  - A job finishes any unfinished cancel within minutes. Before refunding, it checks Stripe for refunds already sent and records them instead of sending another.
  - Each Stripe refund uses an idempotency key, and each refund id is counted once. A refund can never happen twice.
  - The webhook records app refunds that were never recorded.
  - Customer cancel, provider reject, expiry and admin cancel all use this path.
- **Booking `6afacc06…a56c` is repaired:** payment `Refunded` €25, booking `refundedAmount` 25, provider payout reversed, both cancel notifications sent. Stripe shows **one** refund only.
- **App change:** the cancel response is `refund: { amount, percent, status: "refunded" | "pending" }`. See guide §5.
- **Tests:** `booking.refunds.test.ts` (7 tests).

---

## 2. First issue list

| # | Issue | Status | What was done / what's left |
|---|---|---|---|
| 1 | Ski pass stuck "Pending" at €0 | 🟡 | The new code charges the real price and confirms ski passes at payment. Booking `6af955ff…7d03` (TKT-851897) was created by the **old** server (€660 price, €0 charged). Cancelling it needs your OK; no refund, since €0 was paid. |
| 2 | Review button stays after reviewing (409) | ✅ | `review` is hidden once the customer has reviewed that listing: on that booking, on their other bookings of the same listing, and in lists. |
| 3 | Massage time / duration format | ✅ | Durations always come back as `"<n> min"`, also for old listings. Booking `schedule.time` is `"h:mm A"` and `schedule.duration` is `"<n> min"`. |
| 4 | Impossible listings accepted | 🟡 | Massage: a duration longer than the opening hours is refused (400), also when the hours are edited. Opening hours that cross midnight are now checked at booking. Restaurant: slots longer than 6 h or outside opening hours were already refused. **Old data:** 4 test massages with impossible durations still exist; they can't be booked. They can be deactivated on request. |
| 5 | Rating count ≠ reviews | 🟡 | The code is correct. 47 old listings miss the stored count. Fix: run `npm run migrate:booking-platform -- --apply` (waiting for your OK). |
| 6 | Old notifications have no booking link | ℹ️ | All new notifications carry `booking` (22 so far). The old 145 can't be linked. App: treat `booking: null` as "no link". |
| 7 | Transport insurance / maintenance fees | ✅ | Removed: the trip price is all-inclusive (see T2). |

---

## 3. Not finished by QA

| Item | Status | What to do |
|---|---|---|
| Late fee | ✅ (retest) | Book a rental ending in a few minutes, approve it, hand it over, and don't return it. After end + 15 min: still `InProgress`, overdue timer with fee. A new booking by that customer gets **402**. Provider `return` → customer `pay_late_fee` → pay with a test card → provider paid. If it turns "Completed" at the end time, the old server is still running. |
| Complete massage / restaurant (17 Nov) | ℹ️ | By design, only after the service has started (before that: 409). After the start: provider **Complete** → provider paid. If nobody presses it, it completes automatically at the end time. |
| Withdraw / add bank account | ⏳ | Safe to test on a **test provider**: no real money moves ("accept" only marks it Paid; the transfer is manual). Steps: add an account → request a withdrawal (the amount is reserved) → admin **reject** → the balance comes back. Waiting for the go-ahead. |
| Listing editors (Massage, Restaurant, Transport, Ski Pass) | ✅ (bug found + fixed) | **Bug:** sending the loaded listing back returned **400 "category must be a valid id"** for Ski Hire, Transport, Restaurant and Massage. The detail shows `category: "<service>"`, but the update expected a sub-category id. **Fix:** the update accepts the detail shape back: `subCategory: {id}` / `subCategoryId`, and the `category` text is read-only. Rules: guide, "Listing editor screens". Tests: `src/test/listingEditors.test.ts` (19). QA: for each service, change title, description and sub-category plus one slot / seat / item / duration, then save. |

---

## 4. Questions

| Question | Answer |
|---|---|
| Socket host in production | **Yes, the API host without `/api/v1`** (e.g. `https://api.example.com`). Socket.IO runs on the same server and port (path `/socket.io`). Connect with `auth: { token }`. Reconnect with the new token after a refresh, and refetch the screen after a reconnect. The proxy must forward WebSocket upgrades. See guide §8. |
| Test withdraw / add account? | See §3: safe on a test provider; waiting for the go-ahead. |

---

## 5. Test data left on the shared server (from QA)
Ski pass 26 Nov, massage 17 Nov (accepted), restaurant 17 Nov (accepted), transport (completed), the 5★ "QA test review" on "Fiber Switch Card", and the demo customer's notifications marked read. None of it gets in the way. It is kept unless removal is requested.

---

## 6. Waiting on the backend owner
1. Deploy the new backend and **stop the old server version**.
2. OK to run the listing migration with `--apply` (#5).
3. OK to cancel the €0 ski pass `6af955ff…` (#1). Optional: reverse the €20 on `6afacb41…`, deactivate the 4 impossible test massages.
4. Decision on the transport fees (#7).
5. Go-ahead for QA's withdraw test.

**Automated tests:** 228 passing (`npm test`).

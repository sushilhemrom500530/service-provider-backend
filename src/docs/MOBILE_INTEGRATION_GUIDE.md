# Peak Privee: Mobile Integration Guide

This guide covers everything the mobile app (customer and provider) needs: the five services (Ski Pass, Ski Hire, Transport, Restaurant, Massage), payments, bookings, notifications, live updates, wallet and dashboards.

- Base URL: `https://<server>/api/v1`
- Socket: `wss://<server>` (Socket.IO)

---

## 1. Basics

### Auth
- Send `Authorization: Bearer <accessToken>` on every private endpoint.
- Roles: `User` (customer), `Provider` (one `providerType`), `Admin`.
- Browsing listings, a listing's detail, its reviews and booking availability are **public** (no token).

### Response envelope (every endpoint)
```json
{ "success": true, "message": "Bookings fetched.", "data": { }, "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 } }
```
- `meta` is only present on lists.
- Errors:
```json
{ "success": false, "message": "Only 1 VIP seat(s) left for 7:00 PM on 2026-12-20.", "errors": [{ "field": "date", "message": "…" }] }
```
- `errors` only appears for field validation. Always show `message` to the user; it is written for people.

| HTTP | Meaning in this API |
|---|---|
| 400 | Invalid input (the message says which field) |
| 401 | Missing or expired token |
| 402 | Payment not completed (Stripe intent not `succeeded`) |
| 403 | Not allowed (wrong role, not your booking or listing) |
| 404 | Not found (or deleted) |
| 409 | State conflict: sold out or already booked, already approved or cancelled, double tap. **Refresh the screen.** |
| 502/503 | Payment provider or storage problem: retry later |

### Pagination
- Query: `?page=1&limit=10`. `limit` is capped at 50.

### Dates and times
- Send **calendar days** as `YYYY-MM-DD`, e.g. `"2026-12-20"`.
- Send **date-times** as ISO 8601 **with a timezone**, e.g. `"2026-12-20T09:00:00+01:00"` or `"…Z"`. A date-time without a zone is rejected (400).
- Clock times use the resort's local time (Europe/Paris), e.g. `"7:00 PM"` or `"19:00"`. This applies to restaurant slots, massage time and opening hours.
- Responses send instants in UTC ISO format (`startAt`, `endAt`…). Show them in the device's local time.

---

## 2. The five services at a glance

| Service | Customer picks | Price | Needs provider approval | Rental flow |
|---|---|---|---|---|
| Ski Pass | day + persons | `amount × persons` | No (confirmed at payment, ticket number) | – |
| Massage | day + time + duration + persons | duration price × persons | Yes | – |
| Restaurant | day + slot + seats per type | Σ seat price × seats + service fee | Yes | – |
| Ski Hire | start/end date-time + items × qty | Σ item price × qty × rental units (`per_day`/`per_hour`/`per_rental`) | Yes | hand-over, then return (late fee) |
| Transport | start/end date-time + passengers | listing `amount` (per trip) | Yes | hand-over, then return (late fee) |

- The **server always computes the price**. The app shows the `amount` returned by `/booking/intent`.
- Listing APIs (browse, detail, create/edit for providers) are documented per service in **Appendix A–E**.

---

## 3. Booking: one flow for every service

```
Customer: choose → POST /booking/intent → Stripe Payment Sheet → POST /booking/create → booking (Pending or Confirmed)
```

### 3.1 Check availability (optional, recommended before showing the pay button)
`GET /booking/availability/:listingId` (public)

| Service | Query | Response `data` |
|---|---|---|
| Restaurant | `date=2026-12-20` | `{ slots: [{ slotId, startTime, endTime, isPast, seats: [{ itemId, type, price, available }] }] }` |
| Ski Hire | `start=ISO&end=ISO` | `{ items: [{ itemId, name, price, quantity, available }] }` |
| Transport | `start=ISO&end=ISO` | `{ available: true }` |
| Ski Pass / Massage | – | `{ available: true }` |

### 3.2 `POST /booking/intent` (customer)
One body for all services; fields that don't apply are ignored.

| Field | Ski Pass | Massage | Restaurant | Ski Hire | Transport |
|---|---|---|---|---|---|
| `productId` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `date` (`YYYY-MM-DD`) | ✔ | ✔ | ✔ | | |
| `personCount` | ✔ (default 1) | ✔ (default 1) | | | ✔ (≤ seats) |
| `time` (`"10:30 AM"`) | | ✔ | | | |
| `duration` (`"60 min"`, one of the listing's durations) | | ✔ | | | |
| `slotId` | | | ✔ | | |
| `bookingItems` `[{ itemId, quantity }]` | | | ✔ seat types | ✔ items | |
| `startDateAndTime`, `endDateAndTime` | | | | ✔ | ✔ |
| `phoneNumber`, `address` | optional | optional | optional | optional | optional (pickup) |
| `destination` | | | | | optional |

Examples:
```json
{ "productId": "…", "date": "2026-12-20", "personCount": 2 }
{ "productId": "…", "date": "2026-12-20", "time": "10:30 AM", "duration": "60 min" }
{ "productId": "…", "date": "2026-12-20", "slotId": "…", "bookingItems": [{ "itemId": "<VIP seat id>", "quantity": 2 }] }
{ "productId": "…", "startDateAndTime": "2026-12-20T09:00:00+01:00", "endDateAndTime": "2026-12-23T17:00:00+01:00",
  "bookingItems": [{ "itemId": "<skis id>", "quantity": 2 }] }
{ "productId": "…", "startDateAndTime": "2026-12-20T08:00:00+01:00", "endDateAndTime": "2026-12-20T10:00:00+01:00",
  "personCount": 3, "address": "Hotel Alpina", "destination": "Geneva airport" }
```

Response `data`:
```json
{
  "paymentIntentId": "pi_…", "clientSecret": "pi_…_secret_…", "publishableKey": "pk_…",
  "amount": 170, "currency": "eur", "category": "Ski_Hire",
  "breakdown": { "items": [{ "itemId": "…", "name": "Skis", "quantity": 2, "price": 25 }], "priceUnit": "per_day", "units": 4 }
}
```
- Nothing is booked yet. Errors such as 400 (input), 404 (listing) or 409 (sold out) come **before** any payment.

### 3.3 Pay with the Stripe Payment Sheet
- Initialise Stripe with `publishableKey`.
- Present the sheet with `clientSecret` (Flutter `flutter_stripe` / RN `@stripe/stripe-react-native`).

### 3.4 `POST /booking/create` (customer, after the sheet succeeds)
```json
{ "paymentIntentId": "pi_…", "productId": "…", "…same fields as /intent…" }
```
- Sending only `paymentIntentId` also works: the server reuses what was sent to `/intent`.
- **201** with the booking detail (§4).
- **Idempotent:** calling it again with the same `paymentIntentId` returns the same booking. Safe to retry on network errors.
- If the booking can't be made after paying (e.g. someone took the last seat), the payment is **refunded automatically**. The `message` then ends with "Your payment has been refunded."
- If the app was closed after paying, the server still creates the booking (Stripe webhook). It appears in **My bookings**.

---

## 4. The booking object

Lists return **cards**; `GET /booking/:id` returns the **detail** (card + more).

```json
{
  "id": "…",
  "category": "Ski_Hire",
  "status": "InProgress",
  "actions": ["return"],
  "listing": { "id": "…", "title": "Alpine Rentals", "thumbnail": "https://…", "serviceArea": "Courchevel" },
  "schedule": {
    "date": "2026-12-20", "startAt": "2026-12-20T08:00:00.000Z", "endAt": "2026-12-23T16:00:00.000Z",
    "time": null, "duration": null, "slot": null
  },
  "people": null,
  "items": [{ "id": "…", "name": "Skis", "quantity": 2, "price": 25 }],
  "price": { "total": 170, "currency": "eur" },
  "ticketNumber": null,
  "approvalDeadline": null,
  "timer": { "state": "return_in", "minutes": 312, "lateFee": 0 },
  "lateFee": null,
  "provider": { "id": "…", "name": "…", "photo": "…", "email": "…", "phone": "…" },
  "createdAt": "…"
}
```
- **Customer** responses have `provider` (contact card); **provider** responses have `customer` instead.
- **Detail adds:**
  - `contact {phoneNumber,address,destination}`
  - `timeline {bookedAt, approvedAt, handedOverAt, returnedAt, completedAt, cancelledAt}`
  - `cancellation {by: user|provider|admin|system, reason, refundAmount}`
  - `noShow`
  - for the provider: `earning {gross, platformFee, net, status: pending|paid|none}`
- `slot` (Restaurant): `{ startTime, endTime }`. `time`/`duration`: Massage. `ticketNumber`: Ski Pass. `people`: persons/passengers/seats.

### 4.1 `status`
| status | Meaning |
|---|---|
| `Pending` | Paid, waiting for the provider. `approvalDeadline` says until when. |
| `Confirmed` | Approved, not started |
| `InProgress` | Rental handed over, or the service time has started |
| `Completed` | Finished (also rentals never picked up: `noShow: true`) |
| `Cancelled` | Cancelled by the customer, rejected by the provider, or expired (see `cancellation`) |

### 4.2 `actions`: draw buttons from this list
- The server decides what the viewer may do **now**. Show exactly these buttons.
- After any action, use the returned booking (or refresh).

| action | Who | Button | Endpoint |
|---|---|---|---|
| `approve` | provider | Accept | `PATCH /booking/:id/approve` |
| `reject` | provider | Reject (full refund) | `PATCH /booking/:id/reject` `{ reason? }` |
| `hand_over` | provider (Ski Hire, Transport) | Hand over | `PATCH /booking/:id/hand-over` |
| `return` | provider (Ski Hire, Transport) | Mark as returned | `PATCH /booking/:id/return` |
| `complete` | provider (Massage, Restaurant, Ski Pass) | Mark as done | `PATCH /booking/:id/complete` |
| `cancel` | customer | Cancel booking | `PATCH /booking/:id/cancel` `{ reason? }` |
| `pay_late_fee` | customer | Pay late fee | §6 |
| `review` | customer | Write a review | `POST /<service>/:listingId/review` (Appendix) |

- All actions return the updated booking detail.
- A 409 means the booking changed meanwhile (another device, or an automatic rule): refresh.

### 4.3 `timer` (Ski Hire, Transport): live banner
| state | Show |
|---|---|
| `starts_in` | "Pick-up in {minutes}" |
| `pickup_due` | "Pick-up time passed {minutes} ago" (provider: hand over) |
| `return_in` | "Return in {minutes}" |
| `overdue` | "Late by {minutes} · €{lateFee} so far" |

- `minutes` is computed when the response is built. Count down locally and refresh every few minutes.

---

## 5. Flows by role and service

### Customer app
- **Home / My bookings:** `GET /booking/my?tab=upcoming|active|past|cancelled&category=&date=YYYY-MM-DD&page=`
  - `upcoming`: not started. `active`: started / in progress. `past`: completed. `cancelled`: cancelled. No `tab` returns all, newest first.
- **Booking detail:** `GET /booking/:id`. Only the customer, the provider of the listing, or an admin can open it.
- **Cancel:** `PATCH /booking/:id/cancel` (only before the start and before hand-over). The refund goes **to the card**:
  - still `Pending`, or more than **24 h** before the start → **100 %**
  - within 24 h of the start → **90 %**; the provider keeps 10 %
  - Response detail includes `refund: { amount, percent }`.
- **After completion:** the `review` action, which opens the service's review endpoint.

### Provider app
- **Bookings list:** `GET /booking/provider?tab=requests|upcoming|active|past|cancelled&category=&date=&page=`
  - `requests` = waiting for your approval (badge count).
- **Per service:**

  | Service | What the provider does |
  |---|---|
  | Ski Pass | Nothing to approve. Optional `complete` on the day; otherwise it completes automatically after the day. |
  | Massage, Restaurant | `approve` / `reject` → (service time) → `complete`. If not marked, it completes automatically at the end time. |
  | Ski Hire, Transport | `approve` / `reject` → `hand_over` when the customer picks it up → `return` when it comes back. A return more than 15 min late creates a late fee (§6). |

- **Dashboard:** `GET /dashboard/meta/provider` (§9).

### Automatic rules (server, every minute)
| Rule | Result |
|---|---|
| Not approved within **24 h** (or before the start, if sooner) | `Cancelled` (`by: system`), **100 % refund**, both notified |
| Ski Pass / Massage / Restaurant past the end time | `Completed`, provider paid |
| Rental approved but never handed over, past the end | `Completed` with `noShow: true` (not refunded) |
| Rental handed over, not returned **48 h** after the end | Closed automatically; late fee counted up to then |

---

## 6. Late fee (Ski Hire, Transport)

- **Rule:**
  - 15 minutes free.
  - Then **every started hour × the listing's `extraChargePerHour`**.
  - Never more than the booking price.
- **Where it shows:** `lateFee: { hours, amount, status: "due" | "paid" }`. The customer gets a notification and the `pay_late_fee` action.

Pay it (customer):
1. `POST /booking/:id/late-fee/intent` → `{ paymentIntentId, clientSecret, publishableKey, amount, currency }`
2. Present the Stripe Payment Sheet.
3. `POST /booking/:id/late-fee/confirm` `{ "paymentIntentId": "pi_…" }` → booking with `lateFee.status: "paid"`. Idempotent; the webhook also confirms it.

---

## 7. Money

- The customer pays the platform (Stripe).
- When a booking completes, the provider's wallet gets **price − platform fee**. The fee % is set by the admin (`profitCharge`, currently 20 %). Late fees work the same way.
- While a booking is open, the provider's share shows as `earning.status: "pending"`.

### Provider wallet and withdrawals
| | Endpoint |
|---|---|
| Balance | `GET /wallet/get-balance` → `{ balance }` |
| Payout accounts | `GET /wallet/get-my-account` → `{ balance, accounts: [{ id, accountType, cardHolderName, card: "•••• 4242" }] }` |
| Add account | `POST /wallet/add` `{ accountType, cardNumber, cardHolderName }` |
| Request withdrawal | `POST /Withdraw/send-request` `{ cardId: <account id>, amount }`. The amount is reserved from the balance immediately. |
| My withdrawals | `GET /Withdraw/my` → `[{ id, amount, status: Pending|Paid|Rejected, card, createdAt }]` |

- A rejected withdrawal returns the amount to the balance.

### Payments history (customer)
- `GET /payment/all?purpose=booking|late_fee` → `[{ id, bookingId, purpose, amount, refundedAmount, currency, status: Paid|Refunded|Partially_Refunded, createdAt }]`

---

## 8. Notifications and live updates

### REST
| | Endpoint |
|---|---|
| List | `GET /notifications?page=&unread=true` → `[{ id, title, description, type, event, bookingId, isRead, createdAt }]`, `meta.unread` |
| Badge | `GET /notifications/unread-count` → `{ unread }` |
| Mark one read | `PATCH /notifications/:id/read` |
| Mark all read | `PATCH /notifications/read-all` |

- Tapping a notification with `bookingId` opens `GET /booking/:bookingId`.
- `event` values: `booking.requested`, `booking.confirmed`, `booking.new`, `booking.approved`, `booking.rejected`, `booking.expired`, `booking.cancelled`, `booking.handed_over`, `booking.completed`, `booking.late_fee_due`, `booking.late_fee_paid`, `withdraw.requested`, `withdraw.paid`, `withdraw.rejected`.

### Socket.IO
- Connect with `auth: { token: <accessToken> }`. The server puts each device in the user's room.

| Event | Payload | Do |
|---|---|---|
| `notification:new` | the notification object | prepend to the list, bump the badge |
| `booking:updated` | `{ id, status }` | if that booking (or its list) is on screen, refetch it. **No pull-to-refresh needed.** |

---

## 9. Dashboards

**Provider:** `GET /dashboard/meta/provider`
```json
{
  "bookings": { "total": 12, "requests": 2, "upcoming": 3, "inProgress": 1, "completed": 5, "cancelled": 1 },
  "earnings": { "balance": 480, "earned": 520, "platformFees": 130, "pending": 300, "lateFeesDue": 40 },
  "listings": 3,
  "today": [ "booking cards running today" ],
  "recent": [ "5 newest booking cards" ]
}
```

**Admin:** `GET /dashboard/meta/admin?year=2026`
- `stats {customers, providers, bookings, revenue, platformFees, refunds, platformBalance}`
- `charts.monthly[{month, revenue, platformFees, bookings}]`
- `charts.byCategory[{category, bookings, revenue}]`

---

## 10. Changes from the previous API (migration checklist)

| Before | Now |
|---|---|
| Envelope `{ code, message, data }` | `{ success, message, data, meta? }`; errors `{ success:false, message, errors? }` |
| Lists returned `{ pagination, result }` inside `data` | `data` is the array; paging is in `meta` |
| `bookingStatus` + `isPermitted` + `isHandOver` | a single `status` + `actions` |
| `/booking/all`, `/my-booking`, `/itinerary`, `/my-booking-home` | still work (by role), but use `/booking/my` (customer) and `/booking/provider` (provider) with `tab` |
| `/update-permit/:id`, `/update-status/:id`, `/reject/:id`, `/hand-over/:id`, `/complete/:id`, `/refund/:id` | still work; prefer `/booking/:id/approve`, `reject`, `hand-over`, `return`, `complete`, `cancel` |
| `timeLabel`, `overTimeAmount` | `timer { state, minutes, lateFee }` |
| `overTimeCharge` (not charged) | `lateFee { hours, amount, status }`, paid in the app (§6) |
| Customer cancel: 90 % to an in-app wallet | refund to the **card**: 100 % / 90 % rule (§5) |
| Restaurant `slots: [id]` | `slotId` (the old `slots: [id]` still works); availability is per date |
| Restaurant seats `items` | `seats` in listing responses; booking still uses `bookingItems[{itemId, quantity}]` |
| Listing responses with `reviews`, owner email/phone, `availableQty`, `__v` | lean cards/details; reviews via `GET /<service>/:id/reviews` |
| `GET /notifications/all` | `GET /notifications` (old path still works) + read endpoints + socket |
| Withdraw `cardId` = full card number | `cardId` = payout account `id` (full number still accepted) |

---

## 11. Business safeguards (what the app can rely on)

| Situation | What the server does | What the app shows |
|---|---|---|
| Customer pays, then the app crashes or loses network before `/booking/create` | The Stripe webhook books it. A job also checks unfinished payments every minute (after 5 min) and books them, or refunds them if they can no longer be booked | The booking appears in **My bookings**. Calling `/booking/create` again with the same `paymentIntentId` returns it |
| Two customers pay for the last seat, unit or vehicle at the same moment | The earlier booking wins; the later one is removed and **refunded at once** | 409 with a message ending "Your payment has been refunded." |
| Customer has an unpaid late fee | New bookings are refused until it is paid | 402 "Please pay your outstanding late fee…". Open that booking (`pay_late_fee`) |
| Provider never answers | Auto-cancel + 100 % refund at the approval deadline | Booking `Cancelled`, `cancellation.by = "system"` |
| Rental never picked up | Completed as a no-show, not refunded | `noShow: true` |
| Rental never returned | Closed 48 h after the end, late fee up to then (capped at the booking price) | `lateFee.status = "due"` |
| Support refunds a customer (complaint) | Admin `PATCH /booking/:id/admin-refund { amount?, reason }`: full or partial, to the card. The provider's share of the refunded part is taken back proportionally | Detail `refundedAmount`; both sides notified (`booking.refunded`) |
| Refund made directly in the Stripe dashboard | Webhook `refund.created` records it the same way as an admin refund | Same as above |
| Card dispute / chargeback | Webhook `charge.dispute.created`: the provider payout is frozen, or taken back if already paid. Closed **won** → given back; **lost** → the money stays with the customer | Provider/admin detail `dispute { status, amount, reason }`; notifications `booking.disputed`, `booking.dispute_won`, `booking.dispute_lost` |
| Double tap or two devices on any action | Every state change is atomic; the second gets 409 | Refresh the booking |
| Provider deletes a listing with open bookings | Refused (409). They can set it inactive instead (hidden from browse; existing bookings continue) | Show the message |

**Server setup required:**
- In the Stripe dashboard, add the webhook `https://<server>/api/v1/booking/webhook` with these events: `payment_intent.succeeded`, `refund.created`, `charge.dispute.created`, `charge.dispute.closed`.
- Put its signing secret in `STRIPE_WEBHOOK_SECRET`.

---

# Appendix A: Ski Pass listings API

Base URL: `/api/v1/ski-pass`. Auth header: `Authorization: Bearer <accessToken>`.

Ski passes have **no sub-category**: `subCategory` is always `null` and `?category=` is ignored. Filter by pass type with `?passType=Basic|Vip|Premium` (case-insensitive). Price is **per person**.

Envelope: `{ success, message, data, meta? }`. Error: `{ success:false, message, errors? }`.

| Method | Path (alias) | Auth |
|---|---|---|
| GET | `/` (`/all`) | public |
| GET | `/my` (`/my-all`) | Provider (own) / Admin (all) |
| GET | `/:id` | public |
| GET | `/:id/reviews` | public |
| POST | `/` (`/create`) | Provider with `providerType = Ski_Pass` |
| PATCH | `/:id` (`/update/:id`) | owner or Admin |
| PATCH | `/:id/status` | owner or Admin |
| DELETE | `/:id` (`/delete/:id`) | owner or Admin |
| POST | `/:id/review` (`/review/:id`) | User (customer) |

### Objects

**Card** (lists):
```json
{
  "id": "665f…",
  "category": "Ski_Pass",
  "subCategory": null,
  "title": "Day pass",
  "thumbnail": "https://…/a.png",
  "serviceArea": "Courchevel",
  "passType": "Basic",
  "price": { "amount": 45, "unit": "per_person" },
  "rating": { "average": 4.5, "count": 12 },
  "provider": { "id": "665a…", "name": "Alpine Passes", "photo": "https://…" },
  "isActive": true
}
```

**Detail** = card + :
```json
{
  "description": "One day, all lifts",
  "services": [{ "title": "Lift access", "description": "All lifts, all day" }],
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z"
}
```
Reviews are never inside the detail; use `GET /:id/reviews`.

### GET `/` : browse (public)
Only active, non-deleted passes.

| Query | Type | Notes |
|---|---|---|
| `search` | string | title contains |
| `passType` | `Basic` \| `Vip` \| `Premium` | unknown value → empty list |
| `serviceArea` | string | contains |
| `minPrice`, `maxPrice` | number | on the per-person price |
| `sort` | `price_asc` \| `price_desc` \| `rating` \| `newest` | default `newest` |
| `page`, `limit` | int | default 1 / 10, max limit 50 |

```
GET /api/v1/ski-pass?passType=vip&maxPrice=200&page=1&limit=10
```
```json
{ "success": true, "message": "Ski passes fetched successfully.",
  "data": [ /* cards */ ],
  "meta": { "page": 1, "limit": 10, "total": 3, "totalPages": 1 } }
```

### GET `/my` : my passes
Provider: own passes, active and inactive (deleted are hidden). Admin: all passes, or `?owner=<userId>`.
Query: `search`, `passType`, `status=active|inactive`, `sort`, `page`, `limit`. Response: cards + `meta`.
Errors: 401 no token, 403 customer.

### GET `/:id` : detail (public)
Returns the detail object. Errors: 400 invalid id, 404 not found or deleted.

### GET `/:id/reviews` (public)
Query: `page`, `limit`.
```json
{ "success": true, "message": "Reviews fetched successfully.",
  "data": [{ "id": "…", "rating": 5, "comment": "Great", "user": { "id": "…", "name": "Jane", "photo": "" }, "createdAt": "…" }],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "rating": { "average": 5, "count": 1 } }
```

### POST `/` (alias `/create`) : create
`multipart/form-data` (the thumbnail is required, so JSON alone returns 400).

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` (or `thumbnail`) | image file | yes | jpg/png/webp/heic… |
| `title` | string | yes | max 150 |
| `passType` (old: `skiPassType`) | `Basic` \| `Vip` \| `Premium` | yes | case-insensitive |
| `price` (old: `amount`) | number > 0 | yes | per person |
| `services` | JSON string: `[{"title","description"}]` | yes, ≥ 1 | |
| `serviceArea` | string | yes | |
| `description` | string | yes | |

The owner is always the caller. `owner`, `averageRating`, `reviews`… in the body are ignored.

```bash
curl -X POST $BASE/api/v1/ski-pass \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@pass.png -F title="Day pass" -F passType=Basic -F price=45 \
  -F serviceArea=Courchevel -F description="One day, all lifts" \
  -F 'services=[{"title":"Lift access","description":"All lifts, all day"}]'
```
Response **201**: `{ success, message: "Ski pass created successfully.", data: <detail> }`.
Errors: 400 validation (missing field, bad `passType`, non-numeric price, empty `services`, bad JSON, no file), 403 not a Ski Pass provider (also customers and admins).

### PATCH `/:id` (alias `/update/:id`) : update
JSON or multipart. Send only the fields to change; the others are kept.
Fields: `title`, `passType`/`skiPassType`, `price`/`amount`, `services` (replaces the whole list, ≥ 1), `serviceArea`, `description`, `isActive` (boolean), file `file`/`thumbnail` (new thumbnail).
All other fields are ignored (`owner`, `averageRating`, `reviewCount`, `reviews`, `isDeleted`).
```json
PATCH /api/v1/ski-pass/665f…
{ "price": 55, "passType": "Premium" }
```
Response 200: `data: <detail>`. Errors: 400 validation / invalid id, 403 not the owner (or a customer), 404.

### PATCH `/:id/status`
Body `{ "isActive": false }`. Inactive passes are hidden from browse, still visible at `/:id` and in `/my`.
Response: `data: { "id": "…", "isActive": false }`. Errors: 400, 403, 404.

### DELETE `/:id` (alias `/delete/:id`)
Soft delete. Response: `data: { "id": "…", "deleted": true }`.
Errors: **409** if the pass has `Active`/`Pending` bookings (set it inactive instead), 403 not the owner, 404 not found or already deleted.

### POST `/:id/review` (alias `/review/:id`)
Body `{ "rating": 1-5 (integer), "comment": "string" }`. Only a customer with a **Completed** booking of this pass, once.
Response **201**: `data: { "review": { "id", "rating", "comment", "createdAt" }, "rating": { "average", "count" } }`.
Errors: 400 bad rating/comment, 403 not a customer or no completed booking, 404, 409 already reviewed.

### Stored ↔ API fields
| Stored (DB) | API |
|---|---|
| `_id` | `id` |
| `skiPassType` | `passType` (input accepts both) |
| `amount` | `price.amount` (input: `price` or `amount`), `price.unit = "per_person"` |
| `owner` (populated) | `provider { id, name, photo }` |
| `averageRating`, `reviewCount` | `rating { average, count }` |
| `title`, `thumbnail`, `serviceArea`, `description`, `services`, `isActive`, `createdAt`, `updatedAt` | same |
| `reviews`, `refunds`, `isDeleted`, `__v` | never returned |

# Appendix B: Ski Hire listings API

Base URL: `/api/v1/ski-hire`. Auth header: `Authorization: Bearer <accessToken>`.

A ski hire listing is a shop with **items** (skis, boots, helmets…). Each item has a price and a stock quantity. `priceUnit` says what one item price pays for: `per_day` (default), `per_hour` or `per_rental`. The card price is the **cheapest item**.

Envelope: `{ success, message, data, meta? }`. Error: `{ success:false, message, errors? }`.

| Method | Path (alias) | Auth |
|---|---|---|
| GET | `/` (`/all`) | public |
| GET | `/my` (`/my-all`) | Provider (own) / Admin (all) |
| GET | `/:id` | public |
| GET | `/:id/reviews` | public |
| POST | `/` (`/create`) | Provider with `providerType = Ski_Hire` |
| PATCH | `/:id` (`/update/:id`) | owner or Admin |
| PATCH | `/:id/status` | owner or Admin |
| DELETE | `/:id` (`/delete/:id`) | owner or Admin |
| POST | `/:id/review` (`/review/:id`) | User (customer) |

### Objects

**Card** (lists):
```json
{
  "id": "665f…",
  "category": "Ski_Hire",
  "subCategory": { "id": "6650…", "name": "Skis", "photo": "https://…" },
  "title": "Alpine Rentals",
  "thumbnail": "https://…/t.png",
  "serviceArea": "Courchevel",
  "price": { "amount": 15, "unit": "per_day" },
  "rating": { "average": 4.5, "count": 12 },
  "provider": { "id": "665a…", "name": "Alpine Rentals SAS", "photo": "https://…" },
  "isActive": true
}
```

**Detail** = card + :
```json
{
  "description": "Skis and boots",
  "priceUnit": "per_day",
  "extraChargePerHour": 5,
  "items": [
    { "id": "6661…", "name": "Skis", "photo": "https://…/skis.png", "price": 30, "quantity": 10 },
    { "id": "6662…", "name": "Boots", "photo": "", "price": 15, "quantity": 5 }
  ],
  "createdAt": "2026-11-16T10:00:00.000Z"
}
```
- `items[].quantity` is the total stock. Availability depends on the dates and is computed by the booking API, not here.
- `items[].id` is the id to send as `bookingItems[].itemId` when booking.
- Reviews are never in the detail: use `GET /:id/reviews`.

### GET `/` : browse (public)
Only active, non-deleted listings.

| Query | Type | Notes |
|---|---|---|
| `search` | string | title contains (case-insensitive) |
| `category` | string | sub-category name (contains) or sub-category id |
| `serviceArea` | string | contains |
| `minPrice`, `maxPrice` | number | at least one item priced inside the range |
| `sort` | `price_asc` \| `price_desc` \| `rating` \| `newest` | default `newest`. `price_asc` sorts by the cheapest item, `price_desc` by the most expensive item |
| `page`, `limit` | number | default 1 / 10, `limit` max 50 |

```
GET /api/v1/ski-hire?category=skis&minPrice=10&maxPrice=40&sort=price_asc&page=1&limit=10
```
```json
{ "success": true, "message": "Ski hire listings fetched.",
  "data": [ <card>, … ],
  "meta": { "page": 1, "limit": 10, "total": 23, "totalPages": 3 } }
```

### GET `/my` (alias `/my-all`)
Provider: own listings, active and inactive (deleted ones never). Admin: all listings, optional `owner=<userId>`.
Query: `search`, `category`, `status=active|inactive`, `sort`, `page`, `limit`. Response like browse; check `isActive` on each card.

### GET `/:id` (public)
Response 200: `data: <detail>`. Errors: 400 invalid id, 404 not found or deleted. Inactive listings are still returned (with `isActive:false`).

### GET `/:id/reviews` (public)
Query: `page`, `limit`.
```json
{ "success": true, "message": "Reviews fetched.",
  "data": [{ "id": "…", "rating": 5, "comment": "Great", "user": { "id": "…", "name": "Jane", "photo": "" }, "createdAt": "…" }],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "rating": { "average": 5, "count": 1 } }
```

### POST `/` (alias `/create`) : create
`multipart/form-data` (or JSON with a `thumbnail` URL).

| Field | Type | Required | Notes |
|---|---|---|---|
| `thumbnail` | file | yes* | *or a `thumbnail` URL string |
| `category` | string | yes | a Ski Hire sub-category id (`GET /api/v1/category…`) |
| `title` | string | yes | max 150 |
| `serviceArea` | string | yes | |
| `description` | string | no | |
| `priceUnit` | `per_day` \| `per_hour` \| `per_rental` | no | default `per_day` |
| `extraChargePerHour` | number ≥ 0 | no | late-return charge per hour, default 0 |
| `items` | JSON string (array) | yes | `[{ "name": "Skis", "price": 30, "quantity": 10 }]`, at least 1 |
| `itemPhoto_<i>` | file | no | photo of `items[i]` (0-based) |

Item rules: `name` ≥ 2 characters and must contain letters, `price` > 0, `quantity` whole number ≥ 1.

Old names still accepted: `productItems` instead of `items`, `productName` instead of `name`; item photos as repeated `files` (i-th file = i-th item) or `files[<i>]` / `images[<i>]`.

The owner is always the caller. `owner`, `averageRating`, `reviews`… in the body are ignored.

```bash
curl -X POST $BASE/api/v1/ski-hire \
  -H "Authorization: Bearer $TOKEN" \
  -F thumbnail=@shop.png -F category=6650… -F title="Alpine Rentals" \
  -F serviceArea=Courchevel -F priceUnit=per_day -F extraChargePerHour=5 \
  -F 'items=[{"name":"Skis","price":30,"quantity":10},{"name":"Boots","price":15,"quantity":5}]' \
  -F itemPhoto_0=@skis.png -F itemPhoto_1=@boots.png
```
Response **201**: `{ success, message: "Ski hire created.", data: <detail> }`.
Errors: 400 validation (missing field, bad item, bad `priceUnit`, bad JSON, wrong sub-category, no thumbnail), 403 not a Ski Hire provider (also customers and admins).

### PATCH `/:id` (alias `/update/:id`) : update
JSON or multipart. Send only what changes. Allowed: `category`, `title`, `description`, `thumbnail` (file or URL), `serviceArea`, `priceUnit`, `extraChargePerHour`, `items` (or `productItems`), `removeItemIds`, item photo files. Everything else is ignored (`owner`, `averageRating`, `reviewCount`, `reviews`, `isDeleted`).

**Items:**
- Send `id` (or `_id`) to change an existing item; only the fields you send change (`{ "id": "6661…", "price": 35 }`). Without an id, an item with the same name is updated; if no id is sent at all and the list has the same length as the stored one, items are matched by position (old app behaviour).
- An item that matches nothing is **added** (needs `name`, `price`, `quantity`).
- Items you don't send are **kept**. To remove: `removeItemIds: ["6662…"]` (409 if open bookings use that item).
- Changing `quantity` keeps booked units booked: e.g. total 10 with 3 booked → set to 12 → 9 still free.
- New photo for the i-th sent item: `itemPhoto_<i>` (or `files[<i>]` / `images[<i>]` / repeated `files`/`images`). No photo sent = old photo kept.

```json
PATCH /api/v1/ski-hire/665f…
{ "priceUnit": "per_hour",
  "items": [ { "id": "6661…", "quantity": 12 }, { "name": "Goggles", "price": 9, "quantity": 2 } ],
  "removeItemIds": ["6662…"] }
```
Response 200: `data: <detail>`. Errors: 400 validation / unknown item id / invalid id / last item removed, 403 not the owner, 404, 409 removed item has open bookings.

### PATCH `/:id/status`
Body `{ "isActive": false }`. Inactive listings are hidden from browse, still visible at `/:id` and in `/my`.
Response: `data: { "id": "…", "isActive": false }`. Errors: 400, 403, 404.

### DELETE `/:id` (alias `/delete/:id`)
Soft delete (owner or Admin). Response: `data: { "id": "…", "deleted": true }`.
Errors: 403, 404, **409** while the listing has Active/Pending bookings (finish/cancel them or set it inactive).

### POST `/:id/review` (alias `/review/:id`)
Customers only, after a **completed** booking of this listing; one review per customer.
```json
{ "rating": 5, "comment": "Great skis" }
```
Response **201**: `data: { "review": { "id", "rating", "comment", "createdAt" }, "rating": { "average": 4.7, "count": 3 } }`.
Errors: 400 (rating not 1-5 whole number, empty comment), 403 (not a customer / no completed booking), 404, 409 already reviewed.

# Appendix C: Transport listings API

Base: `/api/v1/transport`. Auth header: `Authorization: Bearer <accessToken>`.
Success envelope: `{ "success": true, "message": "...", "data": ..., "meta"?: {...} }`.
Error envelope: `{ "success": false, "message": "...", "errors"?: [{ "field", "message" }] }`.

| Method | Path (old alias) | Auth |
|---|---|---|
| GET | `/` (`/all`) | none |
| GET | `/my` (`/my-all`) | Provider, Admin |
| GET | `/:id` | none |
| GET | `/:id/reviews` | none |
| POST | `/` (`/create`) | Provider with `providerType = Transport` |
| PATCH | `/:id` (`/update/:id`) | listing owner or Admin |
| PATCH | `/:id/status` | listing owner or Admin |
| DELETE | `/:id` (`/delete/:id`) | listing owner or Admin |
| POST | `/:id/review` (`/review/:id`) | User (customer) |

### Objects

**Card** (lists):
```json
{
  "id": "665f...",
  "category": "Transport",
  "subCategory": { "id": "665a...", "name": "Van", "photo": "https://..." },
  "title": "Mercedes V-Class",
  "thumbnail": "https://...",
  "serviceArea": "Courchevel",
  "price": { "amount": 120, "unit": "per_trip" },
  "rating": { "average": 4.5, "count": 12 },
  "provider": { "id": "665b...", "name": "Alpine Cars", "photo": "https://..." },
  "isActive": true
}
```
`price.amount` is charged once per booking.

**Detail** = card fields plus:
```json
{
  "description": "Airport transfer",
  "seats": 7,
  "mileage": "15 km/l",
  "power": "190 hp",
  "extraChargePerHour": 25,
  "insuranceFee": 0,
  "maintenanceFee": 10,
  "createdAt": "2026-11-16T10:00:00.000Z"
}
```
`seats`, `extraChargePerHour`, `insuranceFee`, `maintenanceFee` may be `null` on very old listings.

### GET `/` — browse
Query (all optional): `search` (title), `category` (sub-category name or id), `serviceArea`, `minPrice`, `maxPrice`, `sort` = `price_asc | price_desc | rating | newest` (default newest), `page` (default 1), `limit` (default 10, max 50).
Only active, non-deleted listings.
```
GET /api/v1/transport?category=van&maxPrice=200&sort=price_asc&page=1&limit=10
```
```json
{ "success": true, "message": "Transport listings fetched.", "data": [ /* cards */ ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 } }
```

### GET `/my` — my listings
Provider: own listings, including inactive ones (deleted ones are hidden). Admin: all listings (optional `owner=<userId>`).
Query: `search`, `status=active|inactive`, `category`, `sort`, `page`, `limit`. Returns cards + `meta`.
Errors: 401 no token, 403 customer.

### GET `/:id` — detail
Returns the detail object. Inactive listings are still returned (`isActive: false`).
Errors: 400 invalid id, 404 not found or deleted.

### GET `/:id/reviews`
Query: `page`, `limit`. Newest first.
```json
{ "success": true, "message": "Reviews fetched.",
  "data": [{ "id": "...", "rating": 5, "comment": "Great", "user": { "id": "...", "name": "...", "photo": "..." }, "createdAt": "..." }],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "rating": { "average": 5, "count": 1 } }
```

### POST `/` — create (multipart/form-data)
| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | image | yes | thumbnail (`thumbnail` also accepted); HEIC converted |
| `category` | string | yes | Transport sub-category id |
| `title` | string | yes | max 150 |
| `serviceArea` | string | yes | |
| `amount` | number | yes | price per trip, > 0 |
| `seats` (old: `personCount`) | integer | yes | ≥ 1 |
| `mileage` (old: `milage`) | string | yes | e.g. `"15 km/l"` |
| `power` | string | no | e.g. `"190 hp"` |
| `extraChargePerHour` (old: `extraChargePerHours`) | number | yes | ≥ 0, late-return rate |
| `insuranceFee` | number | yes | ≥ 0 |
| `maintenanceFee` (old: `maintainCharge`) | number | yes | ≥ 0 |
| `description` | string | no | |

The owner is always the caller (any `owner` field is ignored). No defaults are invented for the fees.
```
curl -X POST $BASE/api/v1/transport -H "Authorization: Bearer $T" \
  -F file=@van.png -F category=665a... -F title="Mercedes V-Class" -F serviceArea=Courchevel \
  -F amount=120 -F seats=7 -F mileage="15 km/l" -F power="190 hp" \
  -F extraChargePerHour=25 -F insuranceFee=0 -F maintenanceFee=10 -F description="Airport transfer"
```
`201` → `{ "success": true, "message": "Transport created.", "data": { /* detail */ } }`
Errors: 400 validation (message like `"seats: seats must be at least 1"`, plus `errors[]`), 400 missing thumbnail, 400 category not a Transport sub-category, 401, 403 not a Transport provider.

### PATCH `/:id` — update (JSON or multipart)
Same fields as create, all optional (old names accepted); send only what changes. A new `file` replaces the thumbnail.
Ignored: `owner`, `averageRating`, `reviewCount`, `reviews`, `isDeleted`, `isActive` (use `/status`).
```json
PATCH /api/v1/transport/665f...
{ "amount": 140, "seats": 8 }
```
`200` → detail. Errors: 400 validation / bad id, 403 not owner or Admin, 404.

### PATCH `/:id/status`
Body `{ "isActive": false }` (boolean or `"true"`/`"false"`). Inactive listings disappear from browse.
`200` → `{ "data": { "id": "665f...", "isActive": false } }`. Errors: 400, 403, 404.

### DELETE `/:id`
Soft delete. `200` → `{ "data": { "id": "665f...", "deleted": true } }`.
Errors: 403 not owner or Admin, 404, **409** while the listing has Active/Pending bookings (finish/cancel them, or set it inactive).

### POST `/:id/review`
Body `{ "rating": 1-5 (integer), "comment": "string" }`.
`201` → `{ "data": { "review": { "id", "rating", "comment", "createdAt" }, "rating": { "average": 5, "count": 1 } } }`.
Errors: 400 bad rating/comment, 403 not a customer or no completed booking of this listing, 404, 409 already reviewed.

# Appendix D: Restaurant listings API

Base URL: `/api/v1/restaurant`. Auth header: `Authorization: Bearer <accessToken>`.

A restaurant listing has **seat types** (`VIP` and/or `Normal`, 1 or 2 of them, each type once), each with a price per seat and a seat count, plus **time slots** inside the opening hours. The card price is the **cheapest seat** (`per_seat`). A platform-wide **service fee** (set by Admin) is added to each booking.

Envelope: `{ success, message, data, meta? }`. Error: `{ success:false, message, errors? }`.

| Method | Path (alias) | Auth |
|---|---|---|
| GET | `/` (`/all`) | public |
| GET | `/my` (`/my-all`) | Provider (own) / Admin (all) |
| GET | `/:id` | public |
| GET | `/:id/reviews` | public |
| POST | `/` (`/create`) | Provider with `providerType = Restaurant` |
| PATCH | `/:id` (`/update/:id`) | owner or Admin |
| PATCH | `/:id/status` | owner or Admin |
| DELETE | `/:id` (`/delete/:id`) | owner or Admin |
| POST | `/:id/review` (`/review/:id`) | User (customer) |
| GET | `/service-fee` (`/view/service-fee`) | any logged-in user |
| PATCH | `/service-fee` (`/service-fee/update`) | Admin |

### Objects

**Card** (lists):
```json
{
  "id": "665f…",
  "category": "Restaurant",
  "subCategory": { "id": "6650…", "name": "Fine dining", "photo": "https://…" },
  "title": "Le Chalet",
  "thumbnail": "https://…/t.png",
  "serviceArea": "Courchevel",
  "price": { "amount": 40, "unit": "per_seat" },
  "rating": { "average": 4.5, "count": 12 },
  "provider": { "id": "665a…", "name": "Le Chalet SAS", "photo": "https://…" },
  "isActive": true
}
```

**Detail** = card + :
```json
{
  "description": "Fondue and views",
  "openTime": "10:00 AM",
  "closeTime": "11:00 PM",
  "isOpenNow": true,
  "foodType": "Savoyard",
  "serviceFee": 5,
  "seats": [
    { "id": "6661…", "type": "VIP", "photo": "https://…/vip.png", "price": 80, "quantity": 10, "description": "Window" },
    { "id": "6662…", "type": "Normal", "photo": "https://…/n.png", "price": 40, "quantity": 30, "description": "" }
  ],
  "slots": [
    { "id": "6671…", "startTime": "12:00 PM", "endTime": "2:00 PM" },
    { "id": "6672…", "startTime": "7:00 PM", "endTime": "9:00 PM" }
  ],
  "createdAt": "2026-11-16T10:00:00.000Z"
}
```
- `seats[].quantity` is the total seat count. Free seats/slots for a date come from the booking API, not here.
- `seats[].id` → `bookingItems[].itemId`; `slots[].id` → booking `slots[]`.
- `isOpenNow` is computed from `openTime`/`closeTime` at request time (restaurant time zone, default Europe/Paris). Hours may cross midnight.
- Times: `"h:mm AM/PM"` (e.g. `"7:00 PM"`) or 24 h `"19:00"`.
- Reviews are never in the detail: use `GET /:id/reviews`.

### GET `/` : browse (public)
Only active, non-deleted listings.

| Query | Type | Notes |
|---|---|---|
| `search` | string | title contains (case-insensitive) |
| `category` | string | sub-category name (contains) or id |
| `serviceArea` | string | contains |
| `minPrice`, `maxPrice` | number | at least one seat type priced in the range |
| `sort` | `price_asc` \| `price_desc` \| `rating` \| `newest` | default `newest` |
| `page`, `limit` | int | default 1 / 10, max limit 50 |

`GET /api/v1/restaurant?category=fine&maxPrice=50&page=1&limit=10`
```json
{ "success": true, "message": "Restaurants fetched.", "data": [ /* cards */ ],
  "meta": { "page": 1, "limit": 10, "total": 2, "totalPages": 1 } }
```

### GET `/my` : my restaurants (Provider / Admin)
Own listings including inactive ones (not deleted). Admin sees all (optional `owner=<userId>`).
Query: `search`, `status=active|inactive`, `page`, `limit` (also the browse filters). Returns cards + `meta`.

### GET `/:id` : detail (public)
404 when deleted, 400 for a malformed id.

### GET `/:id/reviews` (public)
Query `page`, `limit`.
```json
{ "success": true, "message": "Reviews fetched.",
  "data": [ { "id": "…", "rating": 5, "comment": "Great", "user": { "id": "…", "name": "Anna", "photo": "" }, "createdAt": "…" } ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "rating": { "average": 5, "count": 1 } }
```

### POST `/` : create (Provider, `providerType = Restaurant`)
JSON or `multipart/form-data`. In multipart, send arrays as **JSON strings**. Returns **201** + detail.

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | max 200 |
| `category` | string | yes | Restaurant sub-category id |
| `serviceArea` | string | yes | |
| `openTime`, `closeTime` | string | yes | e.g. `"10:00 AM"`, `"11:00 PM"` |
| `description` | string | no | |
| `foodType` | string | no | |
| `seats` | array (1–2) | yes* | `[{ type: "VIP"\|"Normal", price ≥ 1, quantity ≥ 0 (int), description?, photo? (URL) }]` |
| `items` | array | yes* | old name: `[{ seat, price, totalQty, description?, photo? }]` (*send `seats` OR `items`) |
| `slots` | array ≥ 1 | yes | `[{ startTime, endTime }]`, max 6 h each, inside opening hours |
| `thumbnail` | file or URL | yes | |

Multipart files:
- `thumbnail` (or `file`): the cover image.
- Seat photo for seat index `i` of the `seats`/`items` array: `files[i]` (e.g. `files[0]`, `files[1]`), or `seatPhoto_i`, or repeated `files` fields in seat order. Each seat needs a photo file or a `photo` URL.

The owner is always the caller. The service fee is the current platform fee (not sent by the app).

```bash
curl -X POST $API/restaurant \
  -H "Authorization: Bearer $TOKEN" \
  -F title="Le Chalet" -F category=6650… -F serviceArea=Courchevel \
  -F openTime="10:00 AM" -F closeTime="11:00 PM" -F foodType=Savoyard \
  -F 'seats=[{"type":"VIP","price":80,"quantity":10},{"type":"Normal","price":40,"quantity":30}]' \
  -F 'slots=[{"startTime":"12:00 PM","endTime":"2:00 PM"},{"startTime":"7:00 PM","endTime":"9:00 PM"}]' \
  -F thumbnail=@cover.jpg -F 'files[0]=@vip.jpg' -F 'files[1]=@normal.jpg'
```

### PATCH `/:id` : update (owner or Admin)
JSON or multipart (same files as create). Send only what changes; returns the detail.

| Field | Notes |
|---|---|
| `title`, `description`, `serviceArea`, `foodType`, `category`, `openTime`, `closeTime`, `thumbnail` (file or URL) | replaced when sent |
| `seats` / `items` | **patch**: a seat with `id` (old: `_id`) updates that seat; without `id` it matches the same `type`, else it is **added** (needs `type`, `price`, `quantity`, photo). Unsent seats are kept; unsent fields keep their value. Photo file for `seats[i]`: `files[i]` |
| `removeSeatIds` (alias `removeItemIds`) | `["seatId"]` or `"id1,id2"`. 409 while open bookings use the seat |
| `slots` | **patch**: with `id` (or `_id`) edits that slot; without `id` adds a slot. Unsent slots are kept |
| `removeSlotIds` | `["slotId"]`. 409 while open bookings use the slot |

Ignored: `owner`, `serviceFee`, `averageRating`, `reviewCount`, `reviews`, `isDeleted`, `status`, `availableQty`.
Changing the seat count keeps already-booked seats booked. Changing hours re-checks every slot against them.

```json
PATCH /api/v1/restaurant/665f…
{ "seats": [ { "id": "6661…", "price": 90 } ],
  "slots": [ { "id": "6671…", "startTime": "12:30 PM", "endTime": "2:30 PM" }, { "startTime": "9:00 PM", "endTime": "10:30 PM" } ],
  "removeSlotIds": ["6672…"] }
```

### PATCH `/:id/status` (owner or Admin)
`{ "isActive": false }` → `{ "id": "665f…", "isActive": false }`. Inactive listings are hidden from browse.

### DELETE `/:id` (owner or Admin)
Soft delete → `{ "id": "665f…", "deleted": true }`. **409** while the restaurant has `Active`/`Pending` bookings.

### POST `/:id/review` (customer)
`{ "rating": 1-5 (int), "comment": "string" }` → **201**
```json
{ "review": { "id": "…", "rating": 4, "comment": "Great", "createdAt": "…" }, "rating": { "average": 4, "count": 1 } }
```
403 without a completed booking of this restaurant, 409 if already reviewed.

### Service fee
- `GET /service-fee` (alias `/view/service-fee`), any logged-in role → `{ "serviceFee": 5 }`
- `PATCH /service-fee` (alias `/service-fee/update`), Admin, body `{ "serviceFee": 5 }` (number ≥ 0) → `{ "serviceFee": 5, "updatedRestaurants": 12 }`. Applies to every restaurant and to new ones.

### Errors
| Code | When |
|---|---|
| 400 | validation (message + `errors[]`), bad JSON string in multipart, bad id, slot invalid/outside hours, missing photo, duplicate seat type, unknown seat/slot id |
| 401 | no/invalid token |
| 403 | wrong role/provider type, not the owner |
| 404 | restaurant not found or deleted |
| 409 | delete/remove seat/remove slot with open bookings; review duplicate; listing changed by a booking during the update (retry) |

# Appendix E: Massage listings API

Base URL: `/api/v1/massage`. Auth header: `Authorization: Bearer <accessToken>`.

Every response: `{ success, message, data, meta? }`. Errors: `{ success: false, message, errors?: [{ field, message }] }`.

| Method | Path | Old alias | Auth |
|---|---|---|---|
| GET | `/` | `/all` | none |
| GET | `/my` | `/my-all` | Provider (own) / Admin (all) |
| GET | `/:id` | | none |
| GET | `/:id/reviews` | | none |
| POST | `/` | `/create` | Provider with `providerType = Massage` |
| PATCH | `/:id` | `/update/:id` | owner or Admin |
| PATCH | `/:id/status` | | owner or Admin |
| DELETE | `/:id` | `/delete/:id` | owner or Admin |
| POST | `/:id/review` | `/review/:id` | User (customer) |

### Shapes

**Card** (lists):
```json
{
  "id": "6650…", "category": "Massage",
  "subCategory": { "id": "6640…", "name": "Thai", "photo": "https://…" },
  "title": "Deep tissue", "thumbnail": "https://…", "serviceArea": "Chamonix",
  "price": { "amount": 80, "unit": "per_session" },
  "rating": { "average": 4.5, "count": 12 },
  "provider": { "id": "6630…", "name": "Anna Spa", "photo": "https://…" },
  "isActive": true
}
```
`price.amount` = the cheapest duration price (or the listing `amount` when there are no durations).

**Detail** = card + :
```json
{
  "description": "",
  "openTime": "9:00 AM", "closeTime": "21:00",
  "durations": [
    { "id": "6651…", "duration": "60 min", "minutes": 60, "price": 80 },
    { "id": "6652…", "duration": "90 min", "minutes": 90, "price": 120 }
  ],
  "benefits": "Relaxes muscles",
  "recommendations": "Drink water",
  "createdAt": "2026-11-16T10:00:00.000Z"
}
```
- `durations` are sorted shortest first. `minutes` is `null` only for a legacy value that can't be read.
- **Booking:** send `duration` exactly as the `duration` string from this list (e.g. `"60 min"`).
- Reviews are never in the detail: use `GET /:id/reviews`.

### GET `/` (browse, public)
Query (all optional): `search` (title), `category` (sub-category name or id), `serviceArea`, `minPrice`, `maxPrice` (on the starting price), `sort` = `price_asc | price_desc | rating | newest` (default newest), `page` (default 1), `limit` (default 10, max 50).
Only active, non-deleted listings.
```
GET /api/v1/massage?search=thai&sort=price_asc&page=1&limit=10
```
```json
{ "success": true, "message": "Massages fetched.", "data": [ <card> ],
  "meta": { "page": 1, "limit": 10, "total": 3, "totalPages": 1 } }
```

### GET `/my`
Query: `search`, `status` = `active | inactive`, `page`, `limit`. Provider: own listings incl. inactive (not deleted). Admin: all listings (optional `owner=<userId>`). Returns cards + `meta`. 401 no token, 403 customer.

### GET `/:id`
Detail. 400 invalid id, 404 unknown or deleted.

### GET `/:id/reviews`
Query `page`, `limit`.
```json
{ "success": true, "data": {
    "reviews": [{ "id": "…", "rating": 5, "comment": "Great", "user": { "id": "…", "name": "…", "photo": "…" }, "createdAt": "…" }],
    "rating": { "average": 5, "count": 1 } },
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 } }
```

### POST `/` (create): `multipart/form-data`
| Field | Type | Required | Notes |
|---|---|---|---|
| `file` (or `thumbnail`) | image file | yes | jpg/png/webp/heic… |
| `category` | string (sub-category id) | yes | must be a Massage sub-category |
| `title` | string | yes | |
| `openTime`, `closeTime` | string | yes | `"9:00 AM"`, `"09:00 PM"`, `"21:30"` (12h with AM/PM or 24h). Closing after midnight is allowed. |
| `durations` (or old `priceByDuration`) | JSON string array | yes | `[{"duration":"60 min","price":80}]` (old shape `{"duration","amount"}` also accepted). 1-20 entries, no duplicate durations. |
| `serviceArea` | string | yes | |
| `benefits` | string | yes | |
| `recommendations` (or old `ourRecommendations`) | string | yes | |
| `amount` | number | no | fallback price; defaults to the cheapest duration |
| `description` | string | no | |

`duration` accepts `"60"`, `60`, `"60 min"`, `"60mins"`, `"1h"`, `"1 hour"`, `"1.5 hours"`, `"1h 30"`, `"1 hour 30 min"` (5 to 1440 minutes, whole minutes). It is stored and returned as `"<minutes> min"` (e.g. `"1h"` → `"60 min"`). Prices must be > 0.
Owner is always the caller (`owner` in the body is ignored).

```
curl -X POST $BASE/api/v1/massage \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@thumb.png -F category=6640… -F title="Deep tissue" \
  -F openTime="9:00 AM" -F closeTime="9:00 PM" -F serviceArea=Chamonix \
  -F benefits="Relaxes muscles" -F recommendations="Drink water" \
  -F 'durations=[{"duration":"1h","price":80},{"duration":"90","price":120}]'
```
201 → `data` = detail.
Errors: 400 validation (`errors[]` lists fields; missing thumbnail; bad sub-category), 401, 403 (not a Massage provider).

### PATCH `/:id` (update): multipart or JSON
Same fields as create, all optional. Only these fields can change; `owner`, `averageRating`, `reviewCount`, `reviews`, `isDeleted`, `isActive` are ignored (use `/status` for `isActive`).
- `durations`: the sent list **replaces** the whole list. Entries keep their `id` when you send it back (`id`/`_id`) or when the same duration is sent again.
- When `durations` is sent without `amount`, the fallback `amount` follows the new cheapest price.
- New thumbnail: file field `file` (or `thumbnail`).
```json
PATCH /api/v1/massage/6650…
{ "title": "Deep tissue 2", "durations": [{ "id": "6651…", "duration": "60 min", "price": 85 }] }
```
200 → detail. Errors: 400, 401, 403 (not owner/admin), 404.

### PATCH `/:id/status`
Body `{ "isActive": false }` (boolean or `"true"/"false"`). 200 → `{ "id": "…", "isActive": false }`. Inactive listings are hidden from browse but still in `/my` and `/:id`. Errors 400/403/404.

### DELETE `/:id`
Soft delete. 200 → `{ "id": "…", "deleted": true }`. 409 while the listing has Active/Pending bookings (finish/cancel them, or set it inactive). 403 not owner/admin, 404.

### POST `/:id/review`
Body `{ "rating": 1-5 (integer), "comment": "string" }`. Customer only, after a **Completed** booking of this listing; one review per customer.
201 → `{ "review": { "id", "rating", "comment", "createdAt" }, "rating": { "average", "count" } }`.
Errors: 400 bad rating/comment, 403 (not a customer, or no completed booking), 404, 409 already reviewed.

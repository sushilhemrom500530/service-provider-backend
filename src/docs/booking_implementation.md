# Booking Payment API — Stripe PaymentIntent Flow

_Last updated: 2026-11-15_

## Overview

Every booking (Ski Pass, Ski Hire, Transport, Restaurant, Massage) is now paid through Stripe before it is saved. One pair of endpoints serves all five categories; the backend reads the category from the product.

1. **`POST /api/v1/booking/intent`** — the backend checks the booking (user, product, dates, stock, slots) and creates a Stripe PaymentIntent. It returns `clientSecret` and `publishableKey`. Nothing is saved yet.
2. **Frontend** opens the Stripe payment box with those two values. The user pays.
3. **`POST /api/v1/booking/create`** — the frontend sends the same booking body plus `paymentIntentId`. The backend asks Stripe whether that payment really succeeded, then creates the booking, reduces stock, credits the provider wallet, saves the payment and notifies the user.

The Stripe secret key never leaves the server. A fake or reused payment id is rejected, and a booking that fails after payment is refunded automatically.

## Environment setup

Add these to the backend `.env`, then restart the server. Both keys come from the Stripe Dashboard → Developers → API keys; use the test keys (`sk_test_`, `pk_test_`) while developing.

| Variable | Example | Used for | Sent to frontend? |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Creating and verifying payments (already existed) | Never |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Opening the payment box on the frontend (new) | Yes, in `/booking/intent` response |
| `STRIPE_CURRENCY` | `eur` | Currency of every PaymentIntent (new, default `eur`) | Yes, in response |

Files changed: `src/config/index.ts`, `.env.example`, and the booking module (`booking.routes.ts`, `booking.controller.ts`, `booking.service.ts`, `booking.validations.ts`).

## Step 1 — POST /api/v1/booking/intent

Validates the booking and returns what the frontend needs to open the Stripe payment box. It saves nothing and changes no stock.

**Auth:** `Authorization: Bearer <access token>` (role `User`).

**Body:** the same fields as `/booking/create`. `userId` and `productId` are required; the rest depends on the category.

**Price:** for **Ski Pass** the server calculates the price itself: pass `amount` × `personCount` (default 1). Any `totalPrice` sent by the app is ignored. For the other categories, send `totalPrice` (in euros, not cents); it is required.

> **Update:** every category is now priced by the server and `totalPrice` from the app is ignored. See [Server pricing for every category](#server-pricing-for-every-category).

| Category | Required fields | Optional |
| --- | --- | --- |
| Ski Pass | `date` | `personCount` (guests, default 1), `time` |
| Ski Hire | `bookingItems[]` (`itemId`, `quantity`) | `date`, `duration` |
| Transport | `startDateAndTime`, `endDateAndTime` | `personCount`, `phoneNumber`, `address`, `destination` |
| Restaurant | `date`, `slots[]`, `bookingItems[]` | `time`, `personCount` |
| Massage | `date` | `time`, `duration` |

Example (Restaurant):

```json
{
  "userId": "665f1c...",
  "productId": "6671a2...",
  "date": "2026-12-20",
  "time": "19:30",
  "slots": ["6671a2...slot"],
  "bookingItems": [{ "itemId": "6671a2...item", "quantity": 2 }],
  "totalPrice": 85.5
}
```

**Response 200:**

```json
{
  "code": 200,
  "message": "Payment intent created successfully",
  "data": {
    "paymentIntentId": "pi_3Q...",
    "clientSecret": "pi_3Q..._secret_...",
    "publishableKey": "pk_test_...",
    "amount": 85.5,
    "amountInCents": 8550,
    "currency": "eur",
    "category": "Restaurant"
  }
}
```

**Errors:**

| Status | When |
| --- | --- |
| 400 | Missing or invalid field, past date, end before start, invalid slot, not enough stock |
| 401 | Token missing or invalid, `userId` does not match the token, user not active |
| 404 | User, product or product owner not found |
| 500 | `STRIPE_SECRET_KEY` not set on the server |
| 502 | Stripe refused to create the PaymentIntent |

## Step 2 — Frontend opens the payment box

Use `publishableKey` and `clientSecret` from step 1. Keep the booking body in memory; step 3 sends it again.

**Web (React, `@stripe/react-stripe-js`):**

```js
const { data } = await api.post('/booking/intent', bookingBody);
const stripePromise = loadStripe(data.publishableKey);

// <Elements stripe={stripePromise} options={{ clientSecret: data.clientSecret }}>
//   <PaymentElement /> + Pay button
// </Elements>

const { error, paymentIntent } = await stripe.confirmPayment({
  elements,
  redirect: 'if_required',
});
if (!error && paymentIntent.status === 'succeeded') {
  await api.post('/booking/create', { ...bookingBody, paymentIntentId: paymentIntent.id });
}
```

**Mobile (React Native `@stripe/stripe-react-native`, or Flutter `flutter_stripe`):** initialise Stripe with `publishableKey`, call `initPaymentSheet({ paymentIntentClientSecret: clientSecret, merchantDisplayName })`, then `presentPaymentSheet()`. With no error, call `/booking/create` with `paymentIntentId`.

If the user cancels or the card is declined, do not call `/booking/create`. The PaymentIntent simply stays unpaid; no booking or charge exists.

## Step 3 — POST /api/v1/booking/create

Creates the booking only after Stripe confirms the payment. **Breaking change:** a random `transactionId` no longer works; it must be a real, succeeded Stripe PaymentIntent id.

**Auth:** `Authorization: Bearer <access token>` (role `User`).

**Body:** the same body sent to `/booking/intent`, plus `paymentIntentId`. The old field name `transactionId` is still accepted as an alias.

```json
{
  "userId": "665f1c...",
  "productId": "6671a2...",
  "date": "2026-12-20",
  "slots": ["6671a2...slot"],
  "bookingItems": [{ "itemId": "6671a2...item", "quantity": 2 }],
  "totalPrice": 85.5,
  "paymentIntentId": "pi_3Q..."
}
```

**What the backend checks before booking:**

1. The id starts with `pi_` and has not been used for another booking.
2. Stripe (server to server) reports the PaymentIntent as `succeeded`.
3. The PaymentIntent was created for this user and this `productId`.
4. The amount Stripe received equals the price fixed by the server in step 1. The saved `totalPrice` is always the amount actually charged; the app's `totalPrice` is not used here.
5. `personCount` is the same as in step 1, so guests can't be added after paying.

Then the existing booking logic runs unchanged: stock and slots are reduced, the booking is saved, the provider wallet is credited, a `Payment` record (`transactionId` = PaymentIntent id, status `Paid`) is stored, and the user gets a notification.

**Response 200:** `{ "code": 200, "message": "Booking successfully", "data": { ...booking } }`

**Errors:**

| Status | When | Refunded? |
| --- | --- | --- |
| 400 | Missing or invalid `paymentIntentId`, wrong product, amount mismatch, `personCount` changed | No charge to refund |
| 400 / 404 | Booking rejected after payment (e.g. stock sold out meanwhile, invalid slot) | Yes, automatically; message ends with "Your payment has been refunded." |
| 402 | Payment not completed (status shown in message) | Nothing charged |
| 403 | Payment belongs to another user | No |
| 409 | Payment already used for a booking | No |
| 500 | Booking failed and the automatic refund also failed | No; message contains the PaymentIntent id for support |

## Full flow and edge cases

The booking is saved only after Stripe confirms the payment.

```
 Frontend                         Backend                          Stripe
    |                                |                                |
    |-- 1. POST /booking/intent ---->|                                |
    |                                |-- 2. Create PaymentIntent ---->|
    |                                |<-- 3. id + clientSecret -------|
    |<-- 4. clientSecret +           |                                |
    |       publishableKey ----------|                                |
    |                                |                                |
    |-- 5. User pays in the payment box ----------------------------->|
    |<-- 6. Payment succeeded ----------------------------------------|
    |                                |                                |
    |-- 7. /booking/create --------->|                                |
    |      + paymentIntentId         |-- 8. Retrieve PaymentIntent -->|
    |                                |<-- 9. succeeded, amount,       |
    |                                |       metadata ----------------|
    |                    [10. Checks pass: save booking]              |
    |                    [stock, wallet, payment, notification]       |
    |<-- 11. Booking created (200) --|                                |
```

The backend talks to Stripe twice: once to create the payment, once to verify it.

| Situation | What happens |
| --- | --- |
| User cancels or card is declined | Frontend does not call `/booking/create`; nothing is saved or charged |
| Paid, but stock or slot is gone by step 10 | Booking is rejected and the payment is refunded in full automatically |
| Same `paymentIntentId` sent twice | Second call gets 409; one payment = one booking |
| Payment made for another user, product or amount | Rejected (403 or 400) |
| User closes the app after paying, before step 7 | Money is taken but no booking exists. Not handled yet: needs a Stripe webhook (`STRIPE_WEBHOOK_SECRET` is already in config). **Update: handled now** by the Stripe webhook, see [Stripe webhook](#stripe-webhook-paid-but-app-closed) |

Still open: for Ski Hire, Transport, Restaurant and Massage, `totalPrice` is still chosen by the app in step 1. The backend guarantees the charged amount equals the saved price, but does not yet compute those prices from the product's own rates.

> **Update:** done. All five categories are priced by the server; see [Server pricing for every category](#server-pricing-for-every-category).

## Automatic completion (Completed status)

A scheduled job (`src/jobs/automaticUpdateJobService.ts`) moves past bookings to `Completed`, which enables "Rate & review" in the app. Bookings that are `Cancelled`, `Deleted` or already `Completed` are never changed.

| Category | Becomes Completed | Job, frequency |
| --- | --- | --- |
| Transport | When `endDateAndTime` has passed | Booking status job, every 5 min |
| Ski Pass | 24 hours after `date` | Booking status job, every 5 min |
| Massage | 24 hours after `date` | Booking status job, every 5 min |
| Ski Hire | When `endDateAndTime` has passed, or 24 hours after `date` if it has no end date. Rented items are returned to stock first | Ski Hire job, every 5 min |
| Restaurant | When `date` has passed. Slots and seats are returned first | Restaurant job, every 1 min |

## Ski Pass date and time

For Ski Pass, the full date **and** time live in `date` (ISO string). `time` and `startDateAndTime` are only filled if the app sends them; the server does not derive `time` from `date`, because `date` is stored in UTC and could show the wrong hour. Read the time from `date` and convert it to local time in the app.

The app now also sends `time` as `"HH:mm"` (the arrival time in local time). It is saved exactly as sent and returned in every booking response. There is no `startTime` field; `startDateAndTime` is used by Transport only, so it stays `null` for Ski Pass.

## Ski Pass approval and provider notification

- **Ski Pass bookings are approved automatically.** A paid Ski Pass is a ready-to-use ticket, so `/booking/create` saves it with `isPermitted: true`. Other categories still start as `isPermitted: false` and are approved by the provider with `PATCH /api/v1/booking/update-permit/:id` (body `{ "isPermitted": true }`).
- **The provider is notified of every new booking** (all categories), with `type: "booking"` and title `New Booking`. For categories that need approval, the message says the booking is waiting for approval. The customer still gets the `Payment Successful` notification as before.

## Provider contact in booking responses

Customer-facing booking endpoints now include the provider under `product.owner`, so the user can call or chat with the provider from the booking:

| Endpoint | Where |
| --- | --- |
| `GET /api/v1/booking/:id` | `data.product.owner` |
| `GET /api/v1/booking/my-booking` | `product.owner` on each booking |
| `GET /api/v1/booking/itinerary` | `product.owner` on each booking |
| `GET /api/v1/booking/my-booking-home` | `product.owner` on each booking |

```json
"owner": {
  "_id": "6650ab...",
  "fullName": "Alpine Pass Co.",
  "phoneNumber": "+33 6 12 34 56 78",
  "profileUrl": "https://...",
  "providerType": "Ski_Pass"
}
```

`owner._id` is the provider's user id; use it as the other participant to open a chat. Email, wallet and other private fields are not returned.

## Fixing old Ski Pass totals

Bookings created before the price fix were saved with the price of one pass, or 0. Known cases:

| Ticket | Guests × price | Saved | Should be |
| --- | --- | --- | --- |
| TKT-851897 | 3 × €220 | €0 | €660 |
| TKT-499858 | 5 × €2 | €2 | €10 |
| TKT-313001 | 3 × €5 | €5 | €15 |
| TKT-478856 | 2 × €5 | €5 | €10 |

`src/scripts/fixSkiPassTotals.ts` corrects them. For each wrong Ski Pass booking it sets `Booking.totalPrice` and `Payment.amount` to pass amount × `personCount`, and credits the difference to the provider's wallet (with an `Earn` transaction). Cancelled and deleted bookings are skipped.

1. Dry run (changes nothing, prints each wrong booking and its Stripe `transactionId`):
   `npm run fix:skipass-totals`
2. Compare each "should be" with the amount charged in the Stripe Dashboard. The script uses today's pass price; if a pass price changed since the booking, fix that one by hand.
3. Apply, for all or only for chosen tickets:
   `npm run fix:skipass-totals -- --apply`
   `npm run fix:skipass-totals -- --apply --tickets=TKT-851897,TKT-499858`

Run it once only; a second run finds nothing to fix because the totals are already correct.

## App checklist

- [ ] Use `POST /booking/intent` → Stripe payment box → `POST /booking/create` with `paymentIntentId`. Payments created any other way are rejected.
- [ ] Send the same `personCount` to both calls. For Ski Pass the server sets the price; `totalPrice` from the app is ignored.
- [ ] Send `time` as `"HH:mm"`.
- [ ] Show provider contact from `product.owner`; open chat with `product.owner._id`.
- [ ] After the backend is deployed: do one Ski Pass purchase with 2+ guests and check the saved `totalPrice` is price × guests and `time` is the arrival time.

## Testing

Use test keys only. A PaymentIntent can't be paid from Postman alone, so confirm it with Stripe's test payment method.

1. Call `POST http://localhost:5000/api/v1/booking/intent` with a user token and a booking body. Copy `paymentIntentId`.
2. Confirm it in test mode, for example with the Stripe CLI: `stripe payment_intents confirm pi_... --payment-method pm_card_visa --return-url https://example.com`. Or pay through the frontend with card `4242 4242 4242 4242`, any future expiry, any CVC.
3. Call `POST http://localhost:5000/api/v1/booking/create` with the same body plus `paymentIntentId`. Expect 200.
4. Call `/booking/create` again with the same id. Expect 409.

| Test card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0025 0000 3155` | Asks for 3D Secure, then succeeds |
| `4000 0000 0000 9995` | Declined (insufficient funds) |

After a successful booking, check the Stripe Dashboard (Payments, test mode): the payment shows `userId`, `productId` and `category` in its metadata.

## Ski Hire pricing

Each Ski Hire listing now says what an item `price` pays for, in the new field `priceUnit`:

| `priceUnit` | Meaning | 21 days of a €25 item |
| --- | --- | --- |
| `per_day` (default) | Price per started day | 21 × €25 = €525 |
| `per_hour` | Price per started hour | 504 h × €25 |
| `per_rental` | One price for the whole rental | €25 |

- Existing listings have no value stored, so they are treated as `per_day`. Providers can change it with `PATCH` on their Ski Hire listing (`"priceUnit": "per_rental"`), and set it when creating one. It is returned with the listing.
- The server calculates the Ski Hire price in `/booking/intent`: Σ (item `price` × `quantity`) × rental units. The app's `totalPrice` is ignored for Ski Hire, as for Ski Pass.
- Started units round up: 1 day and 2 hours is 2 days with `per_day`.
- `startDateAndTime` and `endDateAndTime` are now **required** for Ski Hire. The start can't be in the past, and the end must be after the start.
- The `/booking/intent` response also returns `priceUnit` and `rentalUnits` for Ski Hire, so the app can show "21 days × €25".
- `/booking/create` rejects the booking if the rental dates or the items/quantities differ from those that were paid for.

## Ski Hire stock and overlapping rentals

| Check | When | Result |
| --- | --- | --- |
| Item exists and current stock (`availableQty`) | `/booking/intent` and `/booking/create` | 400 "Insufficient quantity…" |
| Overlapping rentals: for each item, quantity already booked by other `Active`/`Pending` rentals whose dates overlap + requested quantity ≤ `totalQty` | `/booking/intent`, and again in `/booking/create` | 400 "… is not available for these dates. Only N left." At create, the payment is refunded automatically |

Stock is given back:

| Event | Stock returned |
| --- | --- |
| Provider completes the rental (`PATCH /booking/complete/:id`, hand-over) | Yes (new). Only once, never above `totalQty` |
| Rental end passes (Ski Hire job, every 5 min) | Yes, then the booking is marked Completed |
| Customer cancels (`PATCH /booking/refund/:id`) | Yes |

The cancel endpoint used to save the status `Cancel`, which is not a valid value; it now saves `Cancelled`. Bookings already stored as `Cancel` are treated as cancelled by the jobs and are never auto-completed.

## Overtime

Overtime (`timeLabel` "Over Time…" and `overTimeAmount` in `GET /booking/:id`) is only calculated while a Ski Hire or Transport booking is still open: status `Active` or `Pending`, not handed over, and with a valid `endDateAndTime`. Completed, cancelled and deleted bookings show no overtime. This stops the ever-growing amounts on old bookings (one showed €13,118,245.80); those now show none.

## Phone numbers

- Every phone number saved on a user is cleaned automatically: `"N/A"`, `"-"`, `"null"` and similar become empty (`""`, meaning not set); spaces, dashes and brackets are removed; a `00` prefix becomes `+`.
- The app should send numbers with a country code (`+33612345678`). The server does not guess a missing country code.
- Old records: `npm run fix:phone-numbers` cleans placeholders and, with `--country=+33`, adds the country code to numbers that have none (a leading `0` is dropped: `0612345678` → `+33612345678`). It is a dry run unless `--apply` is added, and it lists numbers that still have no valid code so they can be fixed by hand:
  - `npm run fix:phone-numbers`
  - `npm run fix:phone-numbers -- --country=+33`
  - `npm run fix:phone-numbers -- --country=+33 --apply`

## Test data in production listings

- `npm run report:suspicious-listings` lists listings that look like test data, without changing anything: prices above `--max-price` (default 5000), names with no letters or shorter than 2 characters (an item named "4"), Ski Hire listings that look like vehicles (car, van, SUV…), and listings whose owner is a different provider type. Review the list and delete test listings from the admin panel.
- To stop new ones: Ski Hire item names must now be at least 2 characters and contain letters.

## App checklist — Ski Hire

- [ ] Always send `startDateAndTime` and `endDateAndTime` for Ski Hire.
- [ ] Show the price from `/booking/intent` (`amount`, `priceUnit`, `rentalUnits`); don't calculate it in the app.
- [ ] Send the same dates and `bookingItems` to `/booking/intent` and `/booking/create`.
- [ ] Show the "not available for these dates" message from the API when a rental overlaps.
- [ ] Send phone numbers with country code; send nothing (not "N/A") when there is none.

## Server pricing for every category

`/booking/intent` now calculates the price for all five categories; `totalPrice` sent by the app is ignored. A modified app can no longer pay less.

| Category | Price | Needed in the body |
| --- | --- | --- |
| Ski Pass | pass `amount` × `personCount` (default 1) | `personCount` |
| Ski Hire | Σ item `price` × `quantity` × rental units (`priceUnit`) | `startDateAndTime`, `endDateAndTime`, `bookingItems` |
| Restaurant | Σ seat `price` × `quantity` + restaurant `serviceFee` | `bookingItems`, `slots` |
| Massage | `amount` of the chosen entry in `priceByDuration` (or the listing `amount` if it has none) | `duration`, exactly as listed (e.g. `"60 min"`; spaces and case don't matter) |
| Transport | listing `amount`, once per booking | `startDateAndTime`, `endDateAndTime` |

- A Massage `duration` that is not in the listing is rejected with the list of valid durations. This also stops wrong durations ("23 hr 19 min") and €0 massage bookings.
- A listing without a valid price (0 or missing) can't be booked.
- **To confirm with the business:** Transport is charged `amount` once; `insuranceFee` and `maintainCharge` are **not** added, and the length of the rental doesn't change the price. Restaurant `serviceFee` is added once as a flat amount. If either rule is different, it is a one-line change in `calculateServerPrice` (`booking.service.ts`).

## Stripe webhook (paid but app closed)

If the customer pays and the app closes before `/booking/create`, Stripe's `payment_intent.succeeded` webhook now creates the booking. If the booking is rejected at that point (for example, stock sold out), the payment is refunded.

How it works:

1. `/booking/intent` also saves the booking request (a "booking draft") with the PaymentIntent id.
2. Whoever comes first, the app (`/booking/create`) or the webhook, creates the booking. The draft is claimed atomically, so one payment can never create two bookings.
3. If the webhook was first, `/booking/create` returns the booking it created, with 200 (it waits up to 5 s if it is still being created). If that booking failed and was refunded, `/booking/create` returns 400 with the reason.

Setup, once per environment:

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
2. URL: `https://<your-backend>/api/v1/booking/webhook`. Event: `payment_intent.succeeded`.
3. Copy the signing secret (`whsec_...`) into `.env` as `STRIPE_WEBHOOK_SECRET`, then restart.
4. For local testing: `stripe listen --forward-to localhost:5000/api/v1/booking/webhook` and use the `whsec_...` it prints.

The webhook endpoint needs no login; every call is verified with the Stripe signature, and calls without a valid signature get 400.

## Error status codes

Errors thrown by the API now return their real HTTP status (400, 401, 403, 404, 409, ...) instead of 500. The body is unchanged in shape:

```json
{ "success": false, "message": "End date must be later than start date.", "error": { "name": "AppError", "code": 400, "message": "End date must be later than start date." } }
```

## Dates must include a timezone

`date`, `startDateAndTime` and `endDateAndTime` that contain a time must end with `Z` or an offset, e.g. `"2026-05-30T20:00:00+02:00"` or `"2026-05-30T18:00:00Z"`. A time without a timezone (`"2026-05-30T20:00"`) is rejected with 400: the server would read it as UTC and the booking could move to another day (restaurant on 30 May showing as 31 May). A date without a time (`"2026-05-30"`) is still accepted.

## Restaurant slots

New and edited restaurant slots are checked: the times must be readable (`"7:00 PM"` or `"19:00"`), the end must be after the start, and a slot can be at most 6 hours. A slot may cross midnight (`"10:30 PM"` – `"12:30 AM"`), but `"10:30 PM"` – `"12:30 PM"` (14 hours, a typo) is rejected. Existing broken slots must be corrected by the restaurant owner.

## Transport `personCount`

`personCount` (seats) on Transport listings is now a number in the database, so it is returned as `4`, not `"4"`. Old listings are read as numbers when loaded through the model; endpoints that use raw (lean) queries may still return the old string until the listing is saved again.

## Overtime in booking lists

The overtime rule (only for `Active`/`Pending` rentals that have not been handed over) now applies to every endpoint: `GET /booking/:id`, `GET /booking/my-booking` and `GET /booking/itinerary`. Completed bookings show no overtime.

## Data and account actions (not code)

| Item | Action | Who |
| --- | --- | --- |
| Owner phone "N/A" on existing providers | Run `npm run fix:phone-numbers` (dry run), then with `--apply` | Backend, on the production database |
| Test listings | `npm run report:suspicious-listings` lists them; delete from the admin panel | Admin |
| Stripe test secret key in the app's git history | Roll the key in Stripe Dashboard → Developers → API keys; put the new key only in the backend `.env` | Account owner |

## Reviews on listings with incomplete old data

Posting a review (`POST /ski-hire/review/:id`, and the same for Ski Pass, Transport, Restaurant and Massage) used to save and re-validate the **whole** listing. A listing with an old invalid field (for example a Ski Hire item without `productPhoto`) then made every review fail with 400 "Path `productPhoto` is required.", even though the review itself was valid.

Reviews now validate only what they change (the new review and `averageRating`). The same applies when stock is returned on hand-over, cancel and the Ski Hire job, so those no longer fail on such listings. New listings are still fully validated when they are created or edited.

## Booking lifecycle: approve, reject, hand-over, complete

### States

| State | `bookingStatus` | `isPermitted` | `isHandOver` | User label | Provider action |
| --- | --- | --- | --- | --- | --- |
| Paid, waiting for approval | `Active` | `false` | `false` | Awaiting approval | Approve / Reject |
| Approved | `Active` | `true` | `false` | Upcoming | Hand over / Reject |
| Handed over (rental running) | `Active` | `true` | `true` | In progress | Complete (items returned) |
| Completed | `Completed` | `true` | `true` | Completed, Give Review | — |
| Rejected by provider | `Cancelled` (`cancelledBy: provider`) | `false` or `true` | `false` | Cancelled, refunded | — |
| Not approved in time | `Cancelled` (`cancelledBy: system`) | `false` | `false` | Cancelled, refunded | — |
| Cancelled by customer | `Cancelled` (`cancelledBy: user`) | any | `false` | Cancelled | — |

Ski Pass is approved automatically at payment (`isPermitted: true`), so it starts as "Upcoming" and needs no Approve.

### Endpoints

All return `{ "code": 200, "message": "...", "data": <booking> }`. Errors return their real status (400, 403, 404, 409, 502).

| Action | Method + path | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| Approve | `PATCH /api/v1/booking/update-permit/:id` | Provider (owner) | `{ "isPermitted": true }` | `isPermitted: true`, `approvedAt`; **customer notified "Booking Approved"**. 409 if the booking is Cancelled/Completed |
| **Reject** (new) | `PATCH /api/v1/booking/reject/:id` | Provider (owner) / Admin | `{ "reason": "Fully booked" }` (optional) | `Cancelled`, `cancelledBy: provider`; **100% refund to the card** (Stripe), stock/slots back, provider payout reversed; customer notified. 409 if already handed over, completed or cancelled. 502 if the Stripe refund fails (booking stays as it was) |
| Reject (same, old endpoint) | `PATCH /api/v1/booking/update-status/:id` | Provider (owner) / Admin | `{ "bookingStatus": "Cancelled", "reason": "..." }` | Same as Reject |
| **Hand over** (new) | `PATCH /api/v1/booking/hand-over/:id` | Provider (owner) / Admin | none | `isHandOver: true`, `handedOverAt`; customer notified "Rental Started". 409 if not approved yet, already handed over, or not open |
| Complete (items returned) | `PATCH /api/v1/booking/complete/:id` | Provider (owner) / Admin | none | `Completed`, `isHandOver: true`, `returnedAt`; stock back (Ski Hire, Restaurant); late return recorded in `overTimeHours` / `overTimeCharge`; provider wallet credited; customer notified. 409 if Cancelled/Completed |
| Customer cancel | `PATCH /api/v1/booking/refund/:id` | User | `{ "userId": "<own id>", "reason": "..." }` | `Cancelled`; 90% to the customer's in-app wallet; stock/slots back. Both wallets must exist (404 otherwise). Unchanged behaviour |

### Automatic rules (server jobs, every 5 minutes)

| Rule | What happens |
| --- | --- |
| **Approval deadline** | Every new booking that needs approval gets `approvalDeadline` = 24 h after booking, or the start time if sooner. Not approved by then → `Cancelled` (`cancelledBy: system`), 100% refund, stock back, customer and provider notified |
| **Unapproved bookings never complete** | The completion jobs skip new bookings with `isPermitted: false`; they expire instead (rule above). Old bookings (before this change) keep the old behaviour |
| **Handed-over rentals stay open** | A Ski Hire / Transport booking that was handed over stays `Active` after its end time, with "Over Time" and `overTimeAmount` growing, until the provider presses Complete. Then the overtime is recorded on the booking (`overTimeHours`, `overTimeCharge`) and the customer is notified of the amount due |
| Approved but never handed over | Completed at the end time, as before (no-show) |
| **Provider payout** | The provider's wallet is credited when the booking becomes `Completed` (by Complete or by a job), not at payment. New bookings have `providerPayout: held` → `paid`; rejected/expired ones → `reversed` (nothing to take back). Old bookings were paid at payment and are not paid again |

> Overtime is **recorded and notified, not charged automatically**: the card can't be charged again without the customer, so the provider collects it (or a later "pay overtime" step can be added).
>
> To go back to paying providers at payment time, set `HOLD_PROVIDER_PAYOUT_UNTIL_COMPLETION = false` in `booking.service.ts`.

### Customer cancel with held payout

If the provider was not paid yet (`providerPayout: held`), a customer cancel no longer takes 90% back from the provider. The customer still gets 90% in the in-app wallet and the provider gets the remaining 10%, which is the same result as before for both sides.

## Restaurant slots and opening hours

New and edited slots must also lie inside the restaurant's opening hours (`openTime` – `closeTime`, both may cross midnight). With hours 10:00 AM – 4:30 PM, `"12:00 PM – 2:00 PM"` is accepted and `"8:00 AM – 10:30 PM"` is rejected (400). Existing slots are listed by `npm run report:suspicious-listings` ("ends before it starts" or "outside opening hours"); the owner must correct them.

## Provider name "N/A"

Some user records have `fullName: "N/A"` and the real name in a field called `" fullName"` (leading space). They were written outside this API. `npm run fix:owner-names` (dry run) shows them; `npm run fix:owner-names -- --apply` moves the real name into `fullName` and removes `" fullName"`. Booking responses then show the real name.

## Still to do outside the code

| Item | Who |
| --- | --- |
| Roll the leaked Stripe secret key; put the new `sk_test_` only in the server `.env`, and `pk_test_` in `STRIPE_PUBLISHABLE_KEY` | Stripe account owner |
| Run `npm run fix:owner-names -- --apply` and `npm run fix:phone-numbers -- --apply` on the database | Backend, after a dry run |
| Correct existing restaurant slots (e.g. Durbin) | Restaurant owner / admin |

## Editing a Ski Hire listing keeps booked stock

> **Update:** `PATCH` Ski Hire update used to set `availableQty` back to the full `quantity` on every edit, so equipment already booked could be booked again.

Now, for an item that already exists (matched by its `_id`):

```
new availableQty = old availableQty + (new quantity - old quantity)
```

kept between 0 and the new total. Example: total 10, 3 booked (available 7). Edit to 12 → available 9. Edit to 5 → available 2. Edit to 2 → available 0.

A new item (no `_id`) starts with `availableQty = quantity`. If `quantity` is not sent for an item, its old total is kept. **Send each existing item's `_id` when editing**; an item without `_id` is treated as new.

## Platform fee (profitCharge)

> **Update:** the fee was only taken when an admin approved a withdrawal, so the provider wallet always showed the full booking price.

The fee percentage is the admin wallet's `profitCharge` (set from the admin panel; currently 20%). It is now taken **when the provider earns the money**:

| When | Provider wallet gets | Saved on the booking |
| --- | --- | --- |
| Booking completed (payout released) | price − fee (€175 at 20% → €140) | `platformFee: 35`, `providerEarning: 140` |
| Customer cancels a held booking | 10% kept − fee (€17.50 → €14) | `platformFee`, `providerEarning` |
| Paid at payment (only if `HOLD_PROVIDER_PAYOUT_UNTIL_COMPLETION = false`) | price − fee | `platformFee`, `providerEarning` |
| Reject / expiry of an already-paid booking | `providerEarning` is taken back (not the full price) | |

**Withdrawals no longer take the fee again**: the admin pays out the full requested amount. Code: `src/utils/platformFee.ts` (`PLATFORM_FEE_ON_EARNING = true`). Setting it to `false` goes back to the old rule (fee only at withdrawal).

> Money already in provider wallets from before this change was credited without the fee, and is now withdrawn without it.

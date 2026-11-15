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
| User closes the app after paying, before step 7 | Money is taken but no booking exists. Not handled yet: needs a Stripe webhook (`STRIPE_WEBHOOK_SECRET` is already in config) |

Still open: for Ski Hire, Transport, Restaurant and Massage, `totalPrice` is still chosen by the app in step 1. The backend guarantees the charged amount equals the saved price, but does not yet compute those prices from the product's own rates.

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

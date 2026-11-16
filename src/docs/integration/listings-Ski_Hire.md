# Ski Hire listings API

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

## Objects

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

## GET `/` : browse (public)
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

## GET `/my` (alias `/my-all`)
Provider: own listings, active and inactive (deleted ones never). Admin: all listings, optional `owner=<userId>`.
Query: `search`, `category`, `status=active|inactive`, `sort`, `page`, `limit`. Response like browse; check `isActive` on each card.

## GET `/:id` (public)
Response 200: `data: <detail>`. Errors: 400 invalid id, 404 not found or deleted. Inactive listings are still returned (with `isActive:false`).

## GET `/:id/reviews` (public)
Query: `page`, `limit`.
```json
{ "success": true, "message": "Reviews fetched.",
  "data": [{ "id": "…", "rating": 5, "comment": "Great", "user": { "id": "…", "name": "Jane", "photo": "" }, "createdAt": "…" }],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "rating": { "average": 5, "count": 1 } }
```

## POST `/` (alias `/create`) : create
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

## PATCH `/:id` (alias `/update/:id`) : update
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

## PATCH `/:id/status`
Body `{ "isActive": false }`. Inactive listings are hidden from browse, still visible at `/:id` and in `/my`.
Response: `data: { "id": "…", "isActive": false }`. Errors: 400, 403, 404.

## DELETE `/:id` (alias `/delete/:id`)
Soft delete (owner or Admin). Response: `data: { "id": "…", "deleted": true }`.
Errors: 403, 404, **409** while the listing has Active/Pending bookings (finish/cancel them or set it inactive).

## POST `/:id/review` (alias `/review/:id`)
Customers only, after a **completed** booking of this listing; one review per customer.
```json
{ "rating": 5, "comment": "Great skis" }
```
Response **201**: `data: { "review": { "id", "rating", "comment", "createdAt" }, "rating": { "average": 4.7, "count": 3 } }`.
Errors: 400 (rating not 1-5 whole number, empty comment), 403 (not a customer / no completed booking), 404, 409 already reviewed.

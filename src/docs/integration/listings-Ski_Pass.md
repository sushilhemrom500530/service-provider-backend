# Ski Pass listings API

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

## Objects

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
  "maxPeoplePerBooking": 10,
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z"
}
```
- `maxPeoplePerBooking`: most people on one booking (10). The server refuses more with **400** "A ski pass booking is for up to 10 people. Make a second booking for more." Use it for the people picker instead of a fixed number.
- Reviews are never inside the detail; use `GET /:id/reviews`.

## GET `/` : browse (public)
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

## GET `/my` : my passes
Provider: own passes, active and inactive (deleted are hidden). Admin: all passes, or `?owner=<userId>`.
Query: `search`, `passType`, `status=active|inactive`, `sort`, `page`, `limit`. Response: cards + `meta`.
Errors: 401 no token, 403 customer.

## GET `/:id` : detail (public)
Returns the detail object. Errors: 400 invalid id, 404 not found or deleted.

## GET `/:id/reviews` (public)
Query: `page`, `limit`.
```json
{ "success": true, "message": "Reviews fetched successfully.",
  "data": [{ "id": "…", "rating": 5, "comment": "Great", "user": { "id": "…", "name": "Jane", "photo": "" }, "createdAt": "…" }],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "rating": { "average": 5, "count": 1 } }
```

## POST `/` (alias `/create`) : create
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

## PATCH `/:id` (alias `/update/:id`) : update
JSON or multipart. Send only the fields to change; the others are kept.
Fields: `title`, `passType`/`skiPassType`, `price`/`amount`, `services` (replaces the whole list, ≥ 1), `serviceArea`, `description`, `isActive` (boolean), file `file`/`thumbnail` (new thumbnail).
All other fields are ignored (`owner`, `averageRating`, `reviewCount`, `reviews`, `isDeleted`).
```json
PATCH /api/v1/ski-pass/665f…
{ "price": 55, "passType": "Premium" }
```
Response 200: `data: <detail>`. Errors: 400 validation / invalid id, 403 not the owner (or a customer), 404.

## PATCH `/:id/status`
Body `{ "isActive": false }`. Inactive passes are hidden from browse, still visible at `/:id` and in `/my`.
Response: `data: { "id": "…", "isActive": false }`. Errors: 400, 403, 404.

## DELETE `/:id` (alias `/delete/:id`)
Soft delete. Response: `data: { "id": "…", "deleted": true }`.
Errors: **409** if the pass has `Active`/`Pending` bookings (set it inactive instead), 403 not the owner, 404 not found or already deleted.

## POST `/:id/review` (alias `/review/:id`)
Body `{ "rating": 1-5 (integer), "comment": "string" }`. Only a customer with a **Completed** booking of this pass, once.
Response **201**: `data: { "review": { "id", "rating", "comment", "createdAt" }, "rating": { "average", "count" } }`.
Errors: 400 bad rating/comment, 403 not a customer or no completed booking, 404, 409 already reviewed.

## Stored ↔ API fields
| Stored (DB) | API |
|---|---|
| `_id` | `id` |
| `skiPassType` | `passType` (input accepts both) |
| `amount` | `price.amount` (input: `price` or `amount`), `price.unit = "per_person"` |
| `owner` (populated) | `provider { id, name, photo }` |
| `averageRating`, `reviewCount` | `rating { average, count }` |
| `title`, `thumbnail`, `serviceArea`, `description`, `services`, `isActive`, `createdAt`, `updatedAt` | same |
| `reviews`, `refunds`, `isDeleted`, `__v` | never returned |

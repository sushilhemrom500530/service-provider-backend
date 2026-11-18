# Transport listings API

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

## Objects

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
`price.amount` is the **all-inclusive** trip price, charged once per booking. There is no separate insurance or maintenance fee: providers include those costs in the price.

**Detail** = card fields plus:
```json
{
  "description": "Airport transfer",
  "seats": 7,
  "mileage": "15 km/l",
  "power": "190 hp",
  "extraChargePerHour": 25,
  "createdAt": "2026-11-16T10:00:00.000Z"
}
```
`seats` and `extraChargePerHour` may be `null` on very old listings.

## GET `/` — browse
Query (all optional): `search` (title), `category` (sub-category name or id), `serviceArea`, `minPrice`, `maxPrice`, `sort` = `price_asc | price_desc | rating | newest` (default newest), `page` (default 1), `limit` (default 10, max 50).
Only active, non-deleted listings.
```
GET /api/v1/transport?category=van&maxPrice=200&sort=price_asc&page=1&limit=10
```
```json
{ "success": true, "message": "Transport listings fetched.", "data": [ /* cards */ ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 } }
```

## GET `/my` — my listings
Provider: own listings, including inactive ones (deleted ones are hidden). Admin: all listings (optional `owner=<userId>`).
Query: `search`, `status=active|inactive`, `category`, `sort`, `page`, `limit`. Returns cards + `meta`.
Errors: 401 no token, 403 customer.

## GET `/:id` — detail
Returns the detail object. Inactive listings are still returned (`isActive: false`).
Errors: 400 invalid id, 404 not found or deleted.

## GET `/:id/reviews`
Query: `page`, `limit`. Newest first.
```json
{ "success": true, "message": "Reviews fetched.",
  "data": [{ "id": "...", "rating": 5, "comment": "Great", "user": { "id": "...", "name": "...", "photo": "..." }, "createdAt": "..." }],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "rating": { "average": 5, "count": 1 } }
```

## POST `/` — create (multipart/form-data)
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
| `description` | string | no | |

The owner is always the caller (any `owner` field is ignored). `insuranceFee` / `maintenanceFee` / `maintainCharge` no longer exist (17 Nov 2026). Older app versions that still send them get no error; the values are ignored and never stored. Stop sending them.
```
curl -X POST $BASE/api/v1/transport -H "Authorization: Bearer $T" \
  -F file=@van.png -F category=665a... -F title="Mercedes V-Class" -F serviceArea=Courchevel \
  -F amount=120 -F seats=7 -F mileage="15 km/l" -F power="190 hp" \
  -F extraChargePerHour=25 -F description="Airport transfer"
```
`201` → `{ "success": true, "message": "Transport created.", "data": { /* detail */ } }`
Errors: 400 validation (message like `"seats: seats must be at least 1"`, plus `errors[]`), 400 missing thumbnail, 400 category not a Transport sub-category, 401, 403 not a Transport provider.

## PATCH `/:id` — update (JSON or multipart)
Same fields as create, all optional (old names accepted); send only what changes. A new `file` replaces the thumbnail.
Ignored: `owner`, `averageRating`, `reviewCount`, `reviews`, `isDeleted`, `isActive` (use `/status`).
```json
PATCH /api/v1/transport/665f...
{ "amount": 140, "seats": 8 }
```
`200` → detail. Errors: 400 validation / bad id, 403 not owner or Admin, 404.

## PATCH `/:id/status`
Body `{ "isActive": false }` (boolean or `"true"`/`"false"`). Inactive listings disappear from browse.
`200` → `{ "data": { "id": "665f...", "isActive": false } }`. Errors: 400, 403, 404.

## DELETE `/:id`
Soft delete. `200` → `{ "data": { "id": "665f...", "deleted": true } }`.
Errors: 403 not owner or Admin, 404, **409** while the listing has Active/Pending bookings (finish/cancel them, or set it inactive).

## POST `/:id/review`
Body `{ "rating": 1-5 (integer), "comment": "string" }`.
`201` → `{ "data": { "review": { "id", "rating", "comment", "createdAt" }, "rating": { "average": 5, "count": 1 } } }`.
Errors: 400 bad rating/comment, 403 not a customer or no completed booking of this listing, 404, 409 already reviewed.

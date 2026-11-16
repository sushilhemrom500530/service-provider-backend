# Massage listings API

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

## Shapes

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

## GET `/` (browse, public)
Query (all optional): `search` (title), `category` (sub-category name or id), `serviceArea`, `minPrice`, `maxPrice` (on the starting price), `sort` = `price_asc | price_desc | rating | newest` (default newest), `page` (default 1), `limit` (default 10, max 50).
Only active, non-deleted listings.
```
GET /api/v1/massage?search=thai&sort=price_asc&page=1&limit=10
```
```json
{ "success": true, "message": "Massages fetched.", "data": [ <card> ],
  "meta": { "page": 1, "limit": 10, "total": 3, "totalPages": 1 } }
```

## GET `/my`
Query: `search`, `status` = `active | inactive`, `page`, `limit`. Provider: own listings incl. inactive (not deleted). Admin: all listings (optional `owner=<userId>`). Returns cards + `meta`. 401 no token, 403 customer.

## GET `/:id`
Detail. 400 invalid id, 404 unknown or deleted.

## GET `/:id/reviews`
Query `page`, `limit`.
```json
{ "success": true, "data": {
    "reviews": [{ "id": "…", "rating": 5, "comment": "Great", "user": { "id": "…", "name": "…", "photo": "…" }, "createdAt": "…" }],
    "rating": { "average": 5, "count": 1 } },
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 } }
```

## POST `/` (create): `multipart/form-data`
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

## PATCH `/:id` (update): multipart or JSON
Same fields as create, all optional. Only these fields can change; `owner`, `averageRating`, `reviewCount`, `reviews`, `isDeleted`, `isActive` are ignored (use `/status` for `isActive`).
- `durations`: the sent list **replaces** the whole list. Entries keep their `id` when you send it back (`id`/`_id`) or when the same duration is sent again.
- When `durations` is sent without `amount`, the fallback `amount` follows the new cheapest price.
- New thumbnail: file field `file` (or `thumbnail`).
```json
PATCH /api/v1/massage/6650…
{ "title": "Deep tissue 2", "durations": [{ "id": "6651…", "duration": "60 min", "price": 85 }] }
```
200 → detail. Errors: 400, 401, 403 (not owner/admin), 404.

## PATCH `/:id/status`
Body `{ "isActive": false }` (boolean or `"true"/"false"`). 200 → `{ "id": "…", "isActive": false }`. Inactive listings are hidden from browse but still in `/my` and `/:id`. Errors 400/403/404.

## DELETE `/:id`
Soft delete. 200 → `{ "id": "…", "deleted": true }`. 409 while the listing has Active/Pending bookings (finish/cancel them, or set it inactive). 403 not owner/admin, 404.

## POST `/:id/review`
Body `{ "rating": 1-5 (integer), "comment": "string" }`. Customer only, after a **Completed** booking of this listing; one review per customer.
201 → `{ "review": { "id", "rating", "comment", "createdAt" }, "rating": { "average", "count" } }`.
Errors: 400 bad rating/comment, 403 (not a customer, or no completed booking), 404, 409 already reviewed.

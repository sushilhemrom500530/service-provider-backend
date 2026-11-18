# Restaurant listings API

Base URL: `/api/v1/restaurant`. Auth header: `Authorization: Bearer <accessToken>`.

A restaurant listing has **seat types** (`VIP` and/or `Normal`, 1 or 2 of them, each type once), each with a price per seat and a seat count, plus **time slots** inside the opening hours. The card price is the **cheapest seat** (`per_seat`). A platform-wide **service fee** (set by Admin) is added to each booking. The service fee is **platform money**: the provider is paid on the seats only (minus the commission), the platform keeps the fee. A refund returns it to the customer pro rata (e.g. a 90 % refund returns 90 % of it).

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

## Objects

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

## GET `/` : browse (public)
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

## GET `/my` : my restaurants (Provider / Admin)
Own listings including inactive ones (not deleted). Admin sees all (optional `owner=<userId>`).
Query: `search`, `status=active|inactive`, `page`, `limit` (also the browse filters). Returns cards + `meta`.

## GET `/:id` : detail (public)
404 when deleted, 400 for a malformed id.

## GET `/:id/reviews` (public)
Query `page`, `limit`.
```json
{ "success": true, "message": "Reviews fetched.",
  "data": [ { "id": "…", "rating": 5, "comment": "Great", "user": { "id": "…", "name": "Anna", "photo": "" }, "createdAt": "…" } ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "rating": { "average": 5, "count": 1 } }
```

## POST `/` : create (Provider, `providerType = Restaurant`)
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

## PATCH `/:id` : update (owner or Admin)
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

## PATCH `/:id/status` (owner or Admin)
`{ "isActive": false }` → `{ "id": "665f…", "isActive": false }`. Inactive listings are hidden from browse.

## DELETE `/:id` (owner or Admin)
Soft delete → `{ "id": "665f…", "deleted": true }`. **409** while the restaurant has `Active`/`Pending` bookings.

## POST `/:id/review` (customer)
`{ "rating": 1-5 (int), "comment": "string" }` → **201**
```json
{ "review": { "id": "…", "rating": 4, "comment": "Great", "createdAt": "…" }, "rating": { "average": 4, "count": 1 } }
```
403 without a completed booking of this restaurant, 409 if already reviewed.

## Service fee
- `GET /service-fee` (alias `/view/service-fee`), any logged-in role → `{ "serviceFee": 5 }`
- `PATCH /service-fee` (alias `/service-fee/update`), Admin, body `{ "serviceFee": 5 }` (number ≥ 0) → `{ "serviceFee": 5, "updatedRestaurants": 12 }`. Applies to every restaurant and to new ones.

## Errors
| Code | When |
|---|---|
| 400 | validation (message + `errors[]`), bad JSON string in multipart, bad id, slot invalid/outside hours, missing photo, duplicate seat type, unknown seat/slot id |
| 401 | no/invalid token |
| 403 | wrong role/provider type, not the owner |
| 404 | restaurant not found or deleted |
| 409 | delete/remove seat/remove slot with open bookings; review duplicate; listing changed by a booking during the update (retry) |

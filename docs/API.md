# KaarigarLink API Contract

Base URL (local): `http://localhost:4000/api`
Base URL (deployed): `https://<render-service>.onrender.com/api` *(filled in after first deploy)*

Status legend: ✅ live · 🚧 planned (contract fixed, implementation pending)

## Conventions

**Auth:** send `Authorization: Bearer <token>` (token from register/login).

**Success response**
```json
{ "success": true, "message": "Human readable message", "data": { } }
```

**Error response**
```json
{ "success": false, "message": "Validation failed", "errors": [{ "field": "email", "message": "Invalid email address" }] }
```
`errors` is present only for validation errors.

| Status | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Validation failed or malformed JSON |
| 401 | Missing, invalid or expired token; wrong credentials |
| 403 | Authenticated but wrong role or not the owner |
| 404 | Resource or route not found |
| 409 | Conflict: duplicate (e.g. email already registered), not allowed in the current status, or modified concurrently ("... was modified, please retry") |
| 503 | Health check: database unreachable |

IDs are strings (cuid). Dates are ISO 8601 strings. Coordinates are decimal degrees; `latitude` and `longitude` must be sent together.

### Enums
| Enum | Values |
|---|---|
| Role | `BUYER` `WORKSHOP` `INSPECTOR` `ADMIN` (ADMIN cannot self-register) |
| ManufacturingProcess | `CNC_MACHINING` `LATHE_TURNING` `SHEET_METAL_FABRICATION` `LASER_CUTTING` `WELDING` `INJECTION_MOLDING` `CASTING` `FORGING` `THREE_D_PRINTING` `POWDER_COATING` |
| MachineType | `CNC_MILL` `CNC_LATHE` `MANUAL_LATHE` `LASER_CUTTER` `PRESS_BRAKE` `PUNCH_PRESS` `WELDING_STATION` `INJECTION_MOLDER` `CASTING_FURNACE` `FORGING_HAMMER` `THREE_D_PRINTER` `POWDER_COATING_BOOTH` `OTHER` |
| MachineStatus | `OPERATIONAL` `MAINTENANCE` `OFFLINE` |
| QuantityUnit | `UNITS` `KG` |
| VerificationStatus | `PENDING` `VERIFIED` `REJECTED` |
| JobStatus | `DRAFT` `OPEN` `MATCHED` `AWARDED` `IN_PROGRESS` `COMPLETED` `CANCELLED` |
| RequirementType | `MACHINE_TYPE` `TOLERANCE_MM` `PART_SIZE_MM` `CERTIFICATION` `OTHER` |
| InvitationStatus | `INVITED` `ACCEPTED` `DECLINED` `EXPIRED` |

---

## Health

### ✅ `GET /api/health`
Public. `200` when DB reachable, `503` otherwise.
```json
{ "success": true, "message": "Service healthy",
  "data": { "status": "ok", "database": "up", "uptimeSeconds": 42, "timestamp": "2026-11-18T10:00:00.000Z" } }
```

---

## Auth

### ✅ `POST /api/auth/register`
Public. Creates a user. For `role: "WORKSHOP"`, `workshop` is **required** and the workshop profile is created at the same time.

```json
{
  "name": "Ravi Patil",
  "email": "ravi@precision.in",
  "password": "Password123",
  "role": "WORKSHOP",
  "phone": "+91 98765 43210",
  "workshop": {
    "businessName": "Precision Works",
    "description": "5-axis CNC shop",
    "address": "MIDC Bhosari",
    "city": "Pune",
    "latitude": 18.6298,
    "longitude": 73.8478,
    "certifications": ["ISO_9001"]
  }
}
```
Rules: name 2–100 chars · valid email (stored lower-case) · password 8–72 chars · role ∈ BUYER/WORKSHOP/INSPECTOR · `workshop` only for WORKSHOP.

`201`
```json
{ "success": true, "message": "Registration successful",
  "data": {
    "token": "eyJhbGciOi...",
    "user": { "id": "cm...", "name": "Ravi Patil", "email": "ravi@precision.in", "role": "WORKSHOP",
              "phone": "+91 98765 43210", "createdAt": "...", "updatedAt": "...",
              "workshop": { "id": "cm...", "businessName": "Precision Works", "verificationStatus": "PENDING" } } } }
```
`user.workshop` is `null` for non-workshop users. Errors: `400` validation, `409` email exists.

### ✅ `POST /api/auth/login`
Public. Body `{ "email": "...", "password": "..." }` → `200` with the same `{ token, user }` shape. `401 "Invalid email or password"` for unknown email or wrong password.

### ✅ `GET /api/auth/me`
Any authenticated role → `200 { "data": { "user": { ... } } }`. `401` if the token is missing or invalid.

---

## Workshops ✅

All workshop endpoints require authentication. "owner / ADMIN" means the WORKSHOP user who owns that workshop, or any ADMIN; everyone else gets `403`.
A frontend workshop user gets their own workshop id from `GET /api/auth/me` → `data.user.workshop.id` or from `GET /api/workshops/me`.

| Method & path | Role | Purpose |
|---|---|---|
| ✅ `GET /api/workshops/me` | WORKSHOP | Own profile with machines, capabilities, capacities |
| ✅ `GET /api/workshops` | any auth | List. Query: `process`, `city`, `verificationStatus`, `page` (1), `limit` (20, max 100) |
| ✅ `POST /api/workshops` | WORKSHOP | Create profile (only if the user has none; registration already creates one) → `409` if exists |
| ✅ `GET /api/workshops/:id` | any auth | Full details |
| ✅ `PUT /api/workshops/:id` | owner / ADMIN | Partial update. `verificationStatus` is ADMIN-only |
| ✅ `GET /api/workshops/:id/machines` | any auth | List machines |
| ✅ `POST /api/workshops/:id/machines` | owner / ADMIN | Register machine |
| ✅ `PUT /api/workshops/:id/machines/:machineId` | owner / ADMIN | Partial update |
| ✅ `DELETE /api/workshops/:id/machines/:machineId` | owner / ADMIN | Remove |
| ✅ `GET /api/workshops/:id/capabilities` | any auth | List capabilities |
| ✅ `POST /api/workshops/:id/capabilities` | owner / ADMIN | Add (one per process → `409` on duplicate) |
| ✅ `PUT /api/workshops/:id/capabilities/:capabilityId` | owner / ADMIN | Update materials / specs / lead time |
| ✅ `DELETE /api/workshops/:id/capabilities/:capabilityId` | owner / ADMIN | Remove |
| ✅ `GET /api/workshops/:id/capacity` | any auth | List capacity windows (sorted by start) |
| ✅ `POST /api/workshops/:id/capacity` | owner / ADMIN | Add window (`409` if it overlaps another window of the same unit) |
| ✅ `PUT /api/workshops/:id/capacity/:capacityId` | owner / ADMIN | Update (e.g. `availableCapacity`) |
| ✅ `DELETE /api/workshops/:id/capacity/:capacityId` | owner / ADMIN | Remove |
| 🚧 `GET /api/workshops/invitations` | WORKSHOP | My job invitations (Day 3) |

**Workshop object** (`data.workshop`)
```json
{
  "id": "cm...", "userId": "cm...", "businessName": "Precision Works", "description": "5-axis CNC",
  "address": "MIDC Bhosari", "city": "Pune", "latitude": 18.6298, "longitude": 73.8478,
  "certifications": ["ISO_9001"], "rating": 4.6, "ratingCount": 12, "totalCompletedJobs": 30,
  "verificationStatus": "VERIFIED", "createdAt": "...", "updatedAt": "...",
  "user": { "id": "cm...", "name": "Ravi Patil" },
  "machines": [ /* Machine */ ], "capabilities": [ /* Capability */ ], "capacities": [ /* Capacity */ ]
}
```
`rating`, `ratingCount` and `totalCompletedJobs` are read-only here; Member 2's rating/order modules update them.

**PUT /api/workshops/:id** (any subset)
```json
{ "businessName": "...", "description": "...", "address": "...", "city": "...",
  "latitude": 18.6, "longitude": 73.8, "certifications": ["iso 9001"], "verificationStatus": "VERIFIED" }
```
Set `latitude` and `longitude` both to `null` to clear the location. Unknown fields → `400`.

**Re-verification:** when the **owner** of a `VERIFIED` workshop changes `businessName`, `address`, `city`, the coordinates or `certifications`, `verificationStatus` goes back to `PENDING` for admin review. Description-only edits, re-sending unchanged values, and admin edits keep the current status. A `REJECTED` workshop stays `REJECTED` when the owner edits it.

**Concurrent edits → `409`:** if the workshop changed between the server reading and writing it (e.g. an admin verified it while the owner was saving), nothing is saved and you get:
```json
{ "success": false, "message": "Workshop was modified, please retry" }
```
Frontend: re-fetch `GET /api/workshops/:id`, show the latest data, and let the user submit again.

**POST /machines** → `201 { data: { machine } }`
```json
{ "machineName": "Haas VF-2", "machineType": "CNC_MILL", "quantity": 2,
  "operationalStatus": "OPERATIONAL", "specifications": { "axes": 3, "bedSizeMm": [760, 406, 508] } }
```
Defaults: `quantity` 1, `operationalStatus` OPERATIONAL. Only OPERATIONAL machines count in matching.

**POST /capabilities** → `201 { data: { capability } }`
```json
{ "manufacturingProcess": "CNC_MACHINING", "supportedMaterials": ["Aluminium", "Mild Steel"],
  "specifications": { "minToleranceMm": 0.01, "maxPartSizeMm": 600 }, "leadTimeDays": 3 }
```
Materials are stored lower-case and de-duplicated, and common aliases are unified (`aluminum` → `aluminium`, `ss` → `stainless steel`, `ms` → `mild steel`). Certifications are stored upper-case (`iso 9001` → `ISO_9001`).
`specifications.minToleranceMm` (the tightest tolerance achievable) and `maxPartSizeMm` are read by the matching engine.

**POST /capacity** → `201 { data: { capacity } }`
```json
{ "availableCapacity": 1000, "capacityUnit": "UNITS", "startDate": "2026-11-20", "endDate": "2026-12-20" }
```
Meaning: *1000 units can be produced between these dates.* A date-only `endDate` includes that whole day. `endDate` must be on or after `startDate` and not in the past. On update, `availableCapacity: 0` means fully booked.

## Jobs ✅

All job endpoints require authentication.

| Method & path | Role | Purpose |
|---|---|---|
| ✅ `POST /api/jobs` | BUYER | Create a job with its requirements |
| ✅ `GET /api/jobs` | BUYER (own jobs only) / ADMIN (all) | List. Query: `status`, `page` (1), `limit` (20, max 100) |
| ✅ `GET /api/jobs/:id` | owning BUYER / ADMIN / invited WORKSHOP | Job details |
| ✅ `PUT /api/jobs/:id` | owning BUYER | Partial update and buyer status changes |
| 🚧 `DELETE /api/jobs/:id` | n/a | Not implemented. Cancel with `PUT { "status": "CANCELLED" }` |

**Access rules**
- Wrong role (e.g. a WORKSHOP calling `POST /api/jobs`) → `403`.
- A job the caller may not see (another buyer's job, a workshop that wasn't invited, an inspector) → `404 "Job not found"`. It's the same response as for a job that doesn't exist, so private jobs aren't revealed.
- Admins can view and list all jobs but cannot create or edit them.

### `POST /api/jobs`
```json
{
  "title": "500 aluminium brackets",
  "description": "Bracket per drawing BRK-101",
  "material": "Aluminium",
  "manufacturingProcess": "CNC_MACHINING",
  "quantity": 500,
  "quantityUnit": "UNITS",
  "deadline": "2026-12-20",
  "address": "Hinjewadi, Pune",
  "latitude": 18.59,
  "longitude": 73.74,
  "technicalSpecifications": { "drawing": "BRK-101 rev C", "finish": "anodised" },
  "status": "OPEN",
  "requirements": [
    { "requirementType": "MACHINE_TYPE", "requirementValue": "CNC_MILL" },
    { "requirementType": "TOLERANCE_MM", "requirementValue": "0.05" },
    { "requirementType": "PART_SIZE_MM", "requirementValue": 450 },
    { "requirementType": "CERTIFICATION", "requirementValue": "ISO 9001", "isMandatory": false },
    { "requirementType": "OTHER", "requirementValue": "Deburr all edges" }
  ]
}
```

| Field | Rules |
|---|---|
| `title` | required, 3–150 chars |
| `description` | optional, max 5000 |
| `material` | required, stored normalised (`Aluminum` → `aluminium`, same aliases as workshops) |
| `manufacturingProcess` | required, ManufacturingProcess enum |
| `quantity` | required, whole number, 1 – 10,000,000 (a JSON number, not a string) |
| `quantityUnit` | `UNITS` (default) or `KG` |
| `deadline` | required ISO date/datetime, **at least 24 h ahead** and **within 730 days**. A date-only value means the end of that day (UTC) |
| `address`, `latitude`, `longitude` | optional. Latitude and longitude must be sent together. Used for distance in matching |
| `technicalSpecifications` | optional free-form JSON object for people to read (not used for filtering) |
| `status` | optional, `OPEN` (default) or `DRAFT` |
| `requirements` | optional, max 20. See below |

There is **no budget field** (the schema has none). Unknown fields such as `budget`, `buyerId`, `matchedAt` → `400`. The buyer is always the authenticated user.

**Requirements.** The matching engine checks these, so values are validated per type:

| `requirementType` | `requirementValue` | Stored as | Limit |
|---|---|---|---|
| `MACHINE_TYPE` | a MachineType (case-insensitive) | `"CNC_MILL"` | several allowed, no duplicates |
| `TOLERANCE_MM` | positive number or numeric string (tightest tolerance needed) | `"0.05"` | one per job |
| `PART_SIZE_MM` | positive number or numeric string (largest dimension) | `"450"` | one per job |
| `CERTIFICATION` | certification code | `"ISO_9001"` | several allowed, no duplicates |
| `OTHER` | free text 1–500 chars (informational, never filters) | as sent, trimmed | several allowed, no duplicates |

`isMandatory` defaults to `true`. Mandatory requirements exclude workshops that don't meet them; optional ones only inform.

`201`
```json
{ "success": true, "message": "Job created",
  "data": { "job": {
    "id": "cm...", "buyerId": "cm...", "title": "500 aluminium brackets", "description": "Bracket per drawing BRK-101",
    "material": "aluminium", "manufacturingProcess": "CNC_MACHINING", "quantity": 500, "quantityUnit": "UNITS",
    "deadline": "2026-12-20T23:59:59.999Z", "address": "Hinjewadi, Pune", "latitude": 18.59, "longitude": 73.74,
    "technicalSpecifications": { "drawing": "BRK-101 rev C", "finish": "anodised" },
    "status": "OPEN", "matchedAt": null, "createdAt": "...", "updatedAt": "...",
    "buyer": { "id": "cm...", "name": "Asha Rao" },
    "requirements": [
      { "id": "cm...", "jobId": "cm...", "requirementType": "CERTIFICATION", "requirementValue": "ISO_9001", "isMandatory": false }
    ],
    "_count": { "invitations": 0 }
  } } }
```

**Validation error** (`400`), one entry per bad field. Requirement errors name the index:
```json
{ "success": false, "message": "Validation failed", "errors": [
  { "field": "quantity", "message": "quantity must be greater than 0" },
  { "field": "deadline", "message": "deadline must be at least 24 hours in the future" },
  { "field": "requirements.0.requirementValue", "message": "requirementValue must be one of: CNC_MILL, CNC_LATHE, ..." }
] }
```

### `GET /api/jobs`
`200 { data: { items: [Job], pagination: { page, limit, total, totalPages } } }`, newest first. Buyers get only their own jobs; admins get everyone's. Invalid `status` filter → `400`; WORKSHOP / INSPECTOR → `403`.

### `GET /api/jobs/:id`
`200 { data: { job } }` (same Job shape). `404` if the job doesn't exist or the caller may not see it.

### `PUT /api/jobs/:id`
Owning buyer only. Send any subset of the create fields. `description`, `address` and `technicalSpecifications` may be `null` to clear them, and `latitude`/`longitude` may both be `null`.
```json
{ "quantity": 750, "deadline": "2027-01-15",
  "requirements": [ { "requirementType": "PART_SIZE_MM", "requirementValue": 300 } ] }
```
- `requirements`, when sent, **replaces the whole list** (`[]` clears it). When it's left out, requirements are unchanged. The job and its requirements are saved in one transaction, so an invalid requirement means nothing is saved.
- `buyerId`, `matchedAt`, `id`, `createdAt` and other system fields → `400`.

**Status rules.** These follow the existing lifecycle:

| Current status | Buyer may edit details? | Buyer may set status to |
|---|---|---|
| `DRAFT` | yes | `OPEN`, `CANCELLED` |
| `OPEN` | yes | `DRAFT`, `CANCELLED` |
| `MATCHED` (set by matching) | no | `CANCELLED` |
| `AWARDED`, `IN_PROGRESS`, `COMPLETED` (Member 2) | no | n/a |
| `CANCELLED` | no | n/a |

**Cancelling a job.** Send `PUT /api/jobs/:id` with `{ "status": "CANCELLED" }`. There is no DELETE.
- Allowed from `DRAFT`, `OPEN` or `MATCHED`. Not allowed once `AWARDED` or later: that's order cancellation, which belongs to Member 2's module.
- In the same transaction, every invitation for the job that is still `INVITED` or `ACCEPTED` becomes `EXPIRED`. `DECLINED` invitations are left as they are.
- Cancelling is final: a `CANCELLED` job can't be reopened or edited (`409`). The job stays in the buyer's list with `status: "CANCELLED"`.
- Sending a job's current status again (e.g. `CANCELLED` on a cancelled job) changes nothing and returns `200`.

A buyer can never set `MATCHED`, `AWARDED`, `IN_PROGRESS` or `COMPLETED` (`400`). A disallowed transition or edit → `409`, e.g.:
```json
{ "success": false, "message": "Job details cannot be edited while status is MATCHED" }
{ "success": false, "message": "Cannot change job status from CANCELLED to OPEN" }
```

**Concurrent edits → `409 "Job was modified, please retry"`.** This happens when the job changed between the server reading and writing it (for example, matching ran at the same moment). Nothing is saved, so re-fetch the job and resubmit.

| Status | When |
|---|---|
| 200 / 201 | success |
| 400 | validation failed, unknown/system field, malformed JSON |
| 401 | no / invalid token |
| 403 | wrong role |
| 404 | job not found or not visible to you |
| 409 | status rule violated, or concurrent modification |

## Matching & invitations (🚧 Day 3)
| Method & path | Role | Purpose |
|---|---|---|
| `POST /api/jobs/:jobId/match` | owner BUYER / ADMIN | Run matching, create invitations |
| `GET /api/jobs/:jobId/matches` | owner BUYER / ADMIN | Ranked matches with score breakdown |
| `POST /api/invitations/:id/respond` | invited WORKSHOP | `{ "response": "ACCEPTED" \| "DECLINED", "note"?: "..." }` |

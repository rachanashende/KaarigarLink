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
| ✅ `GET /api/workshops/invitations` | WORKSHOP | My job invitations (see Invitations) |

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
- An invited WORKSHOP can view the job via `GET /api/jobs/:id`, but **without `_count`**, so it can't learn how many other workshops were invited. Buyers and admins still receive `_count.invitations`.

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
| `MATCHED` (set when the buyer sends invitations, M8; viewing matches does not set it) | no | `CANCELLED` |
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

**Concurrent edits → `409 "Job was modified, please retry"`.** This happens when the job changed between the server reading and writing it (for example, an invitation was sent at the same moment). Nothing is saved, so re-fetch the job and resubmit.

| Status | When |
|---|---|
| 200 / 201 | success |
| 400 | validation failed, unknown/system field, malformed JSON |
| 401 | no / invalid token |
| 403 | wrong role |
| 404 | job not found or not visible to you |
| 409 | status rule violated, or concurrent modification |

## Matching ✅

| Method & path | Role | Purpose |
|---|---|---|
| ✅ `GET /api/jobs/:id/matches` | owning BUYER / ADMIN | Evaluate every workshop for the job: ranked eligible ones plus excluded ones with reasons |

**No invitations, no job changes.** Matching is computed live on every call. It **never creates invitations** and **never changes the job** (status and details stay as they are). Inviting workshops is a separate buyer action (see Invitations below). Results are not stored, but they are deterministic: the same data gives the same ranking.
Its **only write is lazy expiry**: invitations of this job that are already expired (see Invitations → Expiry) are saved as `EXPIRED` before the `invitation` field is returned.

**Access:** WORKSHOP / INSPECTOR → `403`. Another buyer's job or an unknown id → `404 "Job not found"`.
**Job status:** only `OPEN` and `MATCHED` jobs can be matched. `DRAFT`, `CANCELLED`, `AWARDED`, `IN_PROGRESS` and `COMPLETED` → `409 "Matching is only available for OPEN or MATCHED jobs (this job is DRAFT)"`.

**Query (optional)**
| Param | Rules |
|---|---|
| `maxDistanceKm` | number > 0, ≤ 20000. Hard limit: farther workshops become excluded with a reason. Workshops with **no location are never excluded** by it; they get an explanation instead. Requires the job to have a location (otherwise `400`). Omit it to rank by distance without excluding anyone. |

Any other query parameter → `400`.

**Response** `200`, `message` is `"Matching completed"` or `"Matching completed: no eligible workshops"`
```json
{
  "success": true,
  "message": "Matching completed",
  "data": {
    "jobId": "seed-job-alu-brackets",
    "jobStatus": "OPEN",
    "evaluatedAt": "2026-11-20T09:30:00.000Z",
    "totalWorkshops": 12,
    "eligibleCount": 3,
    "excludedCount": 9,
    "scoring": { "weights": { "rating": 0.35, "capacityHeadroom": 0.25, "distance": 0.2, "deadlineSlack": 0.15, "experience": 0.05 },
                 "distanceZeroScoreKm": 500, "maxDistanceKm": null },
    "results": [
      {
        "jobId": "seed-job-alu-brackets",
        "workshopId": "seed-ws-precision-works",
        "businessName": "Precision Works",
        "city": "Pune",
        "verificationStatus": "VERIFIED",
        "rating": 4.8,
        "ratingCount": 25,
        "totalCompletedJobs": 40,
        "distanceKm": 12.3,
        "score": 90.8,
        "rank": 1,
        "scoreBreakdown": {
          "ratingScore": 96, "capacityHeadroomScore": 100, "distanceScore": 97.5,
          "deadlineSlackScore": 52.8, "experienceScore": 94.4,
          "weights": { "rating": 0.35, "capacityHeadroom": 0.25, "distance": 0.2, "deadlineSlack": 0.15, "experience": 0.05 },
          "effectiveWeights": { "rating": 0.35, "capacityHeadroom": 0.25, "distance": 0.2, "deadlineSlack": 0.15, "experience": 0.05 }
        },
        "availableCapacity": 1336,
        "estimatedCompletion": "2026-12-04T05:11:00.000Z",
        "explanations": [
          "Verified workshop", "Offers CNC_MACHINING", "Supports aluminium for CNC_MACHINING",
          "5 operational machines for CNC_MACHINING (CNC_MILL, CNC_LATHE)",
          "Has 3 operational CNC_MILL machines (required CNC_MILL)",
          "Achieves ±0.01 mm tolerance (required ±0.05 mm)", "Holds ISO_9001 certification",
          "About 1,336 UNITS free before the deadline (needs 500 UNITS)",
          "Estimated completion 2026-12-04 incl. 3-day lead time, 16.2 days before the 2026-12-20 deadline",
          "12.3 km from the job location", "Rated 4.8/5 from 25 reviews", "40 completed jobs on the platform"
        ],
        "eligibility": { "eligible": true, "reasons": [] },
        "invitation": null
      },
      {
        "jobId": "seed-job-alu-brackets",
        "workshopId": "seed-ws-nashik-small-batch",
        "businessName": "Nashik Small Batch",
        "city": "Nashik",
        "verificationStatus": "PENDING",
        "rating": 0,
        "ratingCount": 0,
        "totalCompletedJobs": 0,
        "distanceKm": 156.5,
        "score": null,
        "rank": null,
        "scoreBreakdown": null,
        "availableCapacity": 297,
        "estimatedCompletion": null,
        "explanations": [ "Offers CNC_MACHINING", "Supports aluminium for CNC_MACHINING", "..." ],
        "eligibility": { "eligible": false,
          "reasons": [ "Workshop is not yet verified (verification PENDING); only verified workshops are eligible",
                       "Insufficient capacity: about 297 UNITS free before the deadline, job needs 500 UNITS" ] },
        "invitation": null
      }
    ]
  }
}
```

**Result fields** (one entry per workshop on the platform)
| Field | Meaning |
|---|---|
| `jobId`, `workshopId`, `score`, `explanations`, `eligibility` | The fields the buyer frontend expects |
| `verificationStatus` | The workshop's **real** status. Only `VERIFIED` workshops are eligible; `PENDING` and `REJECTED` ones appear as excluded, with the reason |
| `score` | 0–100 for eligible workshops; **`null` for excluded ones** (they are never scored) |
| `rank` | 1-based position among eligible workshops; `null` when excluded |
| `scoreBreakdown` | The five factor scores (`ratingScore`, `capacityHeadroomScore`, `distanceScore`, `deadlineSlackScore`, `experienceScore`), the configured `weights` and the `effectiveWeights` actually applied; `null` when excluded. `distanceScore` is `null` when the distance is unknown |
| `rating`, `ratingCount`, `totalCompletedJobs` | Inputs to the rating and experience factors (maintained by Member 2's rating/order modules) |
| `distanceKm` | Straight-line km, or `null` if the job or the workshop has no location (this never excludes a workshop) |
| `availableCapacity` | Units the workshop can produce between now and the deadline |
| `estimatedCompletion` | When production plus lead time would finish; `null` if capacity is insufficient |
| `explanations` | What the workshop satisfies (present for excluded workshops too) |
| `eligibility.reasons` | Why it is excluded (every failed rule, not just the first); `[]` when eligible |
| `invitation` | `{ id, status }` if this workshop was already invited to the job, else `null`. Status is `INVITED`, `ACCEPTED`, `DECLINED` or `EXPIRED` (frontends map these to their own labels) |

**Order:** eligible workshops by `rank` (highest score first), then excluded workshops alphabetically by name.

### Eligibility rules (all mandatory, checked before any scoring)
1. **Verification:** only `VERIFIED` workshops are eligible. `PENDING` (not yet verified) and `REJECTED` → excluded.
2. **Capability:** has a capability for the job's `manufacturingProcess`.
3. **Material:** that capability supports the job's material (normalised, e.g. `aluminum` = `aluminium`).
4. **Machine:** at least one `OPERATIONAL` machine suited to the process:

   | Process | Machine types |
   |---|---|
   | CNC_MACHINING | CNC_MILL, CNC_LATHE |
   | LATHE_TURNING | CNC_LATHE, MANUAL_LATHE |
   | SHEET_METAL_FABRICATION | PRESS_BRAKE, PUNCH_PRESS, LASER_CUTTER |
   | LASER_CUTTING | LASER_CUTTER |
   | WELDING | WELDING_STATION |
   | INJECTION_MOLDING | INJECTION_MOLDER |
   | CASTING | CASTING_FURNACE |
   | FORGING | FORGING_HAMMER |
   | THREE_D_PRINTING | THREE_D_PRINTER |
   | POWDER_COATING | POWDER_COATING_BOOTH |
5. **Mandatory job requirements:**
   - `MACHINE_TYPE`: an operational machine of that type.
   - `TOLERANCE_MM`: capability `minToleranceMm` ≤ the value. If the capability doesn't specify it, the workshop is excluded.
   - `PART_SIZE_MM`: capability `maxPartSizeMm` ≥ the value. Missing → excluded.
   - `CERTIFICATION`: listed in the workshop's certifications.
   - `OTHER` never filters. Optional (`isMandatory: false`) requirements never exclude; they only add an explanation.
6. **Capacity:** capacity windows in the job's `quantityUnit` that overlap *now → deadline* are counted in proportion to the overlap (capacity is assumed spread evenly across each window). The total must be ≥ `quantity`.
7. **Deadline:** production at that rate from now, plus the capability's `leadTimeDays`, must finish on or before the deadline.
8. **Distance** (only when `maxDistanceKm` is given): a workshop farther than the limit is excluded.

**Missing coordinates never exclude a workshop.** If the job or the workshop has no (valid) location, the distance is unknown and is simply left out of the score (see below).

### Scoring (eligible workshops only)

Technical fit (rules 2–7) and verification (rule 1) are **eligibility filters, not ranking factors**. Verification earns no points: every eligible workshop is `VERIFIED`, so it would add the same amount to everyone.

Five factors, each normalised to **0–100**:

| Factor | Weight | Formula | Source fields |
|---|---|---|---|
| **Rating** | 35% | `rating / 5 × 100`. **No ratings yet** (`ratingCount = 0`) → neutral **60** (= 3/5), so new workshops aren't buried | `Workshop.rating`, `ratingCount` |
| **Capacity headroom** | 25% | `min(100, (available − quantity) / quantity × 100)`. Exactly enough → **0**, 1.5× → 50, **2× or more → 100** | capacity windows (pro-rated *now → deadline*), `Job.quantity` |
| **Distance** | 20% | `max(0, 100 × (1 − km / 500))`. 0 km → 100, ≥ 500 km → 0. **Unknown → omitted** (see below) | job and workshop coordinates (Haversine) |
| **Deadline slack** | 15% | `(deadline − estimatedCompletion) / (deadline − now) × 100`. Finishing exactly on the deadline → **0**; the more of the remaining time is left over, the higher | `estimatedCompletion` = production at the capacity rate + `Capability.leadTimeDays` |
| **Experience** | 5% | `min(100, ln(1 + jobs) / ln(1 + 50) × 100)`, a log scale with diminishing returns: 0 jobs → 0, 5 → 46, 10 → 61, **50+ → 100** | `Workshop.totalCompletedJobs` |

```
score = Σ effectiveWeight[f] × factorScore[f]      (rounded to 1 decimal, always 0–100)
```

**Missing values**
- **Distance unknown** (job or workshop has no valid coordinates): the distance factor is **omitted** and the other weights are re-normalised to 100%, i.e. each is divided by 0.8: rating 43.75%, headroom 31.25%, slack 18.75%, experience 6.25%. The workshop is **never excluded** for this. `scoreBreakdown.distanceScore` is `null` and `effectiveWeights.distance` is `0`.
- **No ratings yet:** neutral rating score 60 (not omitted).
- **Zero completed jobs:** a real value, so the experience score is 0.
- Capacity headroom and deadline slack always exist for eligible workshops (eligibility needs enough capacity and a completion date before the deadline).

**Worked example** (seed job `alu-brackets`, Precision Works): `0.35×96 + 0.25×100 + 0.20×97.5 + 0.15×52.8 + 0.05×94.4 = 90.8`.

**Tie-breaks** (always deterministic, independent of input order and server locale): higher `score`, then shorter `distanceKm` (unknown last), higher `rating`, more `ratingCount`, `businessName` (plain character order), then `workshopId`.

**Data caveat:** `rating`, `ratingCount` and `totalCompletedJobs` are written by Member 2's rating and order modules. Until those exist, only seed data has non-zero values, so for newly registered workshops these two factors are the same for everyone.

## Invitations ✅

Matching never invites anyone. The buyer picks an **eligible** workshop from the match results and invites it, **one workshop per request**. Accepting or declining **only changes the invitation**: it creates no quote or order and does not change the job status (quotes and orders belong to Member 2's modules).

| Method & path | Role | Purpose |
|---|---|---|
| ✅ `POST /api/jobs/:id/invitations` | owning BUYER | Invite one eligible workshop |
| ✅ `GET /api/jobs/:id/invitations` | owning BUYER / ADMIN | A job's invitations, with the matching snapshot |
| ✅ `GET /api/workshops/invitations` | WORKSHOP | Invitations received by my workshop |
| ✅ `POST /api/invitations/:id/respond` | invited WORKSHOP | Accept or decline |

**Status values and frontend labels.** The API always returns the enum value; frontends map it to their own labels:

| API `status` | Buyer frontend | Workshop frontend | Meaning |
|---|---|---|---|
| `INVITED` | Pending | New | Waiting for the workshop |
| `ACCEPTED` | Accepted | Accepted | Workshop wants to proceed (no quote/order is created) |
| `DECLINED` | Declined | Rejected | Workshop said no |
| `EXPIRED` | Expired | Expired | Response window passed, the job left `OPEN`/`MATCHED`, or the job was cancelled |

### Expiry
An **`INVITED`** invitation is `EXPIRED` when either of these is true:
1. **Time:** now ≥ `expiresAt`, where `expiresAt = min(createdAt + 7 days, job deadline)` (returned on every invitation).
2. **Job state:** the job is no longer `OPEN` or `MATCHED`, e.g. it was moved to `AWARDED`, `IN_PROGRESS` or `COMPLETED`. An outstanding invitation on such a job can't be answered.

`expiresAt` reflects rule 1 only, so a status can become `EXPIRED` before `expiresAt` because of rule 2 or a cancellation.

| Existing status | Time runs out | Job leaves `OPEN`/`MATCHED` (not cancelled) | Job cancelled |
|---|---|---|---|
| `INVITED` | → `EXPIRED` | → `EXPIRED` | → `EXPIRED` |
| `ACCEPTED` | kept | **kept** (Member 2's order workflow may need it) | → `EXPIRED` (unchanged from jobs) |
| `DECLINED` / `EXPIRED` | kept | kept | kept |

- Expired invitations can't be answered and **are never returned as `INVITED`**.
- **Lazy expiry:** expired invitations are saved as `EXPIRED` whenever invitations are listed, matches are viewed, an invite is attempted or a response is attempted. The same rule is applied when returning data, so every endpoint agrees even before the database row is updated. There is no background job.
- **For Member 2:** after moving a job to another lifecycle state, call the exported helper `expireOverdueInvitations({ jobId }, now, tx)` from `backend/src/services/invitationExpiry.ts`, ideally in the same transaction, so outstanding `INVITED` invitations are saved as `EXPIRED` immediately. It only ever changes `INVITED` rows.

### `POST /api/jobs/:id/invitations`
Owning BUYER only. Body (any other field → `400`):
```json
{ "workshopId": "seed-ws-precision-works" }
```
The server **re-runs matching** at request time and only invites the workshop if it is eligible right now. `PENDING`, `REJECTED` and otherwise excluded workshops can never be invited. The score, rank, distance, breakdown and explanations at that moment are stored with the invitation. The **first** invitation moves the job `OPEN → MATCHED` and sets `matchedAt`, which locks the job details (see the job status rules). Later invitations leave it `MATCHED` and **don't modify the job**.

**Concurrency safety**
- **Workshop:** inside the transaction, only the target workshop's row is locked (`SELECT … FOR UPDATE`) and rechecked: it must still be `VERIFIED` and unchanged since matching evaluated it. Otherwise the invite gets `409 "Workshop was modified, please retry"`. A verification change made at the same moment waits for the invite to finish, and is then applied normally.
- **Job, first invitation:** uses the job's strict "unchanged since read" check, because details can still change while the job is `OPEN`.
- **Job, later invitations:** use a shared lock that only checks the job is still `MATCHED`. Invitations for different workshops can therefore run in parallel, and a cancellation that lands at the same moment either refuses the invite or expires it.

`201` (new invitation):
```json
{ "success": true, "message": "Workshop invited",
  "data": {
    "created": true,
    "jobStatus": "MATCHED",
    "invitation": {
      "id": "cm…", "jobId": "seed-job-alu-brackets", "workshopId": "seed-ws-precision-works",
      "status": "INVITED", "matchScore": 90.8, "rank": 1, "distanceKm": 12.3,
      "scoreBreakdown": { "ratingScore": 96, "capacityHeadroomScore": 100, "distanceScore": 97.5,
                          "deadlineSlackScore": 52.8, "experienceScore": 94.4, "weights": { }, "effectiveWeights": { } },
      "matchReasons": [ "Verified workshop", "Offers CNC_MACHINING", "…" ],
      "responseNote": null, "respondedAt": null,
      "createdAt": "2026-11-20T10:00:00.000Z", "expiresAt": "2026-11-27T10:00:00.000Z" } } }
```

**Inviting a workshop that already has an invitation for this job:**

| Existing status | Result |
|---|---|
| `INVITED` / `ACCEPTED` | `200 "Workshop already invited"`, the existing invitation with `created: false`. Nothing changes |
| `DECLINED` | `409 "This workshop declined the invitation; re-invitation is not allowed"` |
| `EXPIRED` (including overdue) | `409 "The invitation to this workshop expired; re-invitation is not allowed"` |

The database allows only one invitation per job and workshop, so two simultaneous invites still produce one row.

| Error | When |
|---|---|
| `400` | missing or empty `workshopId`, unknown fields |
| `401` / `403` | no token / not a BUYER |
| `404 "Job not found"` | unknown job or another buyer's job |
| `404 "Workshop not found"` | unknown workshop |
| `409 "Invitations can only be sent for OPEN or MATCHED jobs (this job is DRAFT)"` | wrong job status |
| `409 "Workshop is not eligible for this job"` | `errors` lists the matcher's reasons, e.g. `["Workshop is not yet verified (verification PENDING); only verified workshops are eligible"]` |
| `409 "Workshop was modified, please retry"` | the target workshop changed (e.g. its verification) between matching and saving. Nothing is saved; retry |
| `409 "Job was modified, please retry"` | first invitation: the job was edited, cancelled or invited in parallel. Later invitations: the job left `MATCHED` (e.g. was cancelled). Nothing is saved; retry |

### `GET /api/jobs/:id/invitations`
Owning BUYER or ADMIN (another buyer → `404`, WORKSHOP/INSPECTOR → `403`). Optional `?status=INVITED|ACCEPTED|DECLINED|EXPIRED`. Ordered by `rank`, then `createdAt`.
```json
{ "data": { "jobId": "…", "jobStatus": "MATCHED", "items": [
  { "id": "…", "jobId": "…", "workshopId": "…", "status": "ACCEPTED", "matchScore": 90.8, "rank": 1,
    "distanceKm": 12.3, "scoreBreakdown": { }, "matchReasons": [ ], "responseNote": "Can start Monday",
    "respondedAt": "…", "createdAt": "…", "expiresAt": "…",
    "workshop": { "id": "…", "businessName": "Precision Works", "city": "Pune", "verificationStatus": "VERIFIED" } } ] } }
```

### `GET /api/workshops/invitations`
WORKSHOP only, and only invitations sent to the caller's own workshop. Query: `status`, `page` (1), `limit` (20, max 100). Newest first. **No `matchScore`, `rank`, `distanceKm`, `scoreBreakdown` or `matchReasons`**: workshops never see their own scores or how they compare with other workshops. The buyer is `{ id, name }` only, with no email.
```json
{ "data": {
  "items": [ {
    "id": "…", "jobId": "…", "workshopId": "…", "status": "INVITED",
    "responseNote": null, "respondedAt": null, "createdAt": "…", "expiresAt": "…",
    "job": { "id": "…", "title": "500 CNC-machined aluminium brackets", "description": "…",
             "material": "aluminium", "manufacturingProcess": "CNC_MACHINING", "quantity": 500,
             "quantityUnit": "UNITS", "deadline": "…", "address": "Hinjewadi Phase 1, Pune",
             "technicalSpecifications": { "drawing": "BRK-101 rev C" }, "status": "MATCHED",
             "requirements": [ { "requirementType": "MACHINE_TYPE", "requirementValue": "CNC_MILL", "isMandatory": true } ] },
    "buyer": { "id": "…", "name": "Asha Rao" } } ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } } }
```
Mapping for the workshop frontend: `receivedAt` = `createdAt`, `deliveryAddress` = `job.address`, `machines` = `MACHINE_TYPE` requirement values, `buyer` = `buyer.name`. There is **no `price`**: the schema has no budget field, and prices come from quotes, which belong to Member 2.

### `POST /api/invitations/:id/respond`
WORKSHOP only, and only the invited workshop (anyone else → `404 "Invitation not found"`).
```json
{ "response": "ACCEPTED", "note": "Can start Monday" }
```
`response` must be `ACCEPTED` or `DECLINED`. `note` is optional, up to 500 characters, and trimmed. `200 "Invitation accepted"` / `"Invitation declined"` returns `{ invitation }` in the workshop shape, with `status`, `respondedAt` and `responseNote` set.

| Error | When |
|---|---|
| `400` | invalid `response`, note too long, unknown fields |
| `401` / `403` | no token / not a WORKSHOP |
| `404 "Invitation not found"` | unknown id or another workshop's invitation |
| `409 "Invitation has already been accepted"` / `"…declined"` | already answered; responses are final |
| `409 "Invitation has expired"` | past `expiresAt` |
| `409 "Invitation has expired: the job is no longer open (AWARDED)"` | the job is `CANCELLED`, `AWARDED`, `IN_PROGRESS`, `COMPLETED` (status shown in brackets) |
| `409 "Invitation was modified, please retry"` | any other concurrent change |

The status check and the write happen in **one conditional update**, so simultaneous accept and decline, or a response racing expiry or cancellation, can never both succeed.

**Allowed status changes:** `INVITED → ACCEPTED | DECLINED` (by the workshop). `INVITED → EXPIRED` (time, job leaving `OPEN`/`MATCHED`, or cancellation). `ACCEPTED → EXPIRED` (job cancellation only). Nothing else; `DECLINED` and `EXPIRED` are final, and re-invitation is not allowed.

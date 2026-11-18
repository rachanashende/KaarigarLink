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
| 409 | Duplicate (e.g. email already registered) |
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

## Workshops (🚧 Day 2)
| Method & path | Role | Purpose |
|---|---|---|
| `GET /api/workshops/me` | WORKSHOP | Own profile with machines, capabilities, capacity |
| `GET /api/workshops/:id` | any auth | Workshop details |
| `PUT /api/workshops/:id` | owner / ADMIN | Update profile |
| `POST /api/workshops/:id/machines` | owner / ADMIN | Register machine |
| `PUT /api/workshops/:id/machines/:machineId` | owner / ADMIN | Update machine |
| `DELETE /api/workshops/:id/machines/:machineId` | owner / ADMIN | Remove machine |
| `POST /api/workshops/:id/capabilities` | owner / ADMIN | Add capability |
| `PUT /api/workshops/:id/capabilities/:capabilityId` | owner / ADMIN | Update capability |
| `POST /api/workshops/:id/capacity` | owner / ADMIN | Add capacity window |
| `PUT /api/workshops/:id/capacity/:capacityId` | owner / ADMIN | Update capacity window |
| `GET /api/workshops/invitations` | WORKSHOP | My job invitations |

## Jobs (🚧 Day 2)
| Method & path | Role | Purpose |
|---|---|---|
| `POST /api/jobs` | BUYER | Create job (with `requirements[]`) |
| `GET /api/jobs` | BUYER (own) / ADMIN (all) | List jobs |
| `GET /api/jobs/:id` | owner / ADMIN / invited WORKSHOP | Job details |
| `PUT /api/jobs/:id` | owner | Update (only while DRAFT/OPEN) |
| `DELETE /api/jobs/:id` | owner / ADMIN | Delete or cancel |

## Matching & invitations (🚧 Day 3)
| Method & path | Role | Purpose |
|---|---|---|
| `POST /api/jobs/:jobId/match` | owner BUYER / ADMIN | Run matching, create invitations |
| `GET /api/jobs/:jobId/matches` | owner BUYER / ADMIN | Ranked matches with score breakdown |
| `POST /api/invitations/:id/respond` | invited WORKSHOP | `{ "response": "ACCEPTED" \| "DECLINED", "note"?: "..." }` |

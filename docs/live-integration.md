# Frontend ↔ backend integration (M10)

The frontend (`frontend/`) has two service modes behind the same `DataService` and `AuthService` contracts (`frontend/src/services/contracts.ts`, `auth.ts`). Pages and components never call `fetch` directly; they use React Query hooks over these services.

| | Mock mode (default) | Live mode |
|---|---|---|
| Select with | `VITE_SERVICE_MODE=mock` (or unset) | `VITE_SERVICE_MODE=live` + `VITE_API_BASE_URL` |
| Data | In-browser fixtures (dev: saved in localStorage, resettable) | Express + Prisma + PostgreSQL backend |
| Sign-in | Demo role switcher, `DemoPass123!` | Backend JWT (`POST /api/auth/login`); registration page for buyer, workshop, inspector |
| Authorisation | Simulated by the mock store | Enforced by the backend from the JWT; the UI's actor ids are ignored by the server |
| Awarding, order lifecycle, milestones, payments, refunds, assignment, verification | Read-only / disabled (unchanged) | Available |
| Adapter | `services/adapters/mock*.ts` | `services/live/*.ts` |

## Running live mode locally

1. **Backend:** start PostgreSQL. In `backend/`: copy `.env.example` to `.env`, then run `npm run db:deploy`, `npm run db:seed` (optional demo data) and `npm run dev`. The API is at `http://localhost:4000/api`.
2. **Frontend:** in `frontend/`, copy `.env.example` to `.env.local`:
   ```
   VITE_SERVICE_MODE=live
   VITE_API_BASE_URL=http://localhost:4000/api
   ```
   Then run `npm run dev` and open `http://127.0.0.1:5173`. The backend's development CORS default already allows this origin. If `backend/.env` sets `CORS_ORIGINS`, that list replaces the default: include both `http://localhost:5173` and `http://127.0.0.1:5173`, otherwise sign-in fails with "Unable to reach the KaarigarLink server".
3. **Accounts:** seed users are `<name>@kaarigarlink.test` (for example `asha.rao@`, `admin@`, `priya.inspector@`), with the password you set in `SEED_DEFAULT_PASSWORD`. Admins can't self-register.
4. **Demo login shortcuts:** the sign-in page shows **Demo Buyer**, **Demo Workshop**, **Demo Inspector** and **Demo Admin**. In live mode one click signs in through the development-only `POST /api/auth/demo-login`, which uses the seeded account for that role and returns a normal session. Start the backend with `NODE_ENV=development` and `ENABLE_DEMO_LOGIN=true` in `backend/.env`, and browse from the same machine. Otherwise the buttons show "Demo login is disabled on this server". The frontend holds no passwords or tokens. See "Demo login" in [API.md](API.md) for the restrictions. **Before deploying, remove `ENABLE_DEMO_LOGIN` or set it to false.** `VITE_DEMO_LOGIN=false` hides the buttons. In mock mode the shortcuts sign in with one click as before.

## Architecture (`frontend/src/services/live/`)

| File | Responsibility |
|---|---|
| `http.ts` | Base URL, Bearer token, JSON bodies, the `{ success, message, data }` envelope, Zod validation of `data`, HTTP errors mapped to `ServiceError` (keeping the backend's message and first field error), `apiAll()` for paginated `{ items, pagination }` lists, session storage of the token |
| `auth.ts` | Login, register, `/auth/me` restore after refresh, logout, session-expiry notifications |
| `mappers.ts` | Backend record schemas and their mapping into the frontend domain model |
| `buyer.ts`, `workshop.ts`, `inspector.ts`, `admin.ts` | One adapter per role, implementing the existing service interfaces |

- **Sessions:** the JWT is kept in `sessionStorage`. It survives a refresh and is cleared on logout or when the tab closes.
- **Expired sessions:** any authenticated 401 clears the session. `AuthProvider` then empties the query cache and returns to the sign-in page with "Your session has expired".
- **Mutations:** each invalidates the affected React Query keys, so pages refresh without reloading.
- **Commands that exist only in live mode** are optional methods on the service interfaces (for example `buyer.awardQuote`, `buyer.completeOrder`, `workshop.startOrder`, `admin.assignInspector`). Their UI renders only when the method exists, so mock mode is unchanged.

## Workflows connected

| Role | Workflow | Backend |
|---|---|---|
| All | Sign in, register, restore session, sign out | `POST /auth/login`, `POST /auth/register`, `GET /auth/me` |
| Buyer | Dashboard, jobs list and detail, post a job | `GET /jobs`, `GET /jobs/:id`, `POST /jobs`, `GET /quotes/jobs/:id`, `GET /orders/mine` |
| Buyer | Matches and invitations | `GET /jobs/:id/matches` (OPEN/MATCHED jobs), `GET /jobs/:id/invitations` (afterwards), `POST /jobs/:id/invitations`, `GET /workshops/:id` |
| Buyer | Compare quotations, award | `GET /quotes/jobs/:id`, `POST /orders/award/:quoteId` |
| Buyer | Orders, milestones, QC outcomes, payments, rating | `GET /orders/mine`, `GET /orders/:id`, `GET /orders/:id/payments`, `POST /orders/:id/complete`, `POST /orders/:id/cancel`, `POST /milestones/:id/approve`, `POST /orders/:id/payments`, `POST /payments/:id/simulate`, `POST /orders/:id/rating` |
| Workshop | Workspace, profile, invitations, quotations | `GET /workshops/me`, `GET /workshops/invitations`, `GET /quotes/mine`, `POST /invitations/:id/respond`, `POST /quotes/invitations/:id`, `PATCH /quotes/:id`, `POST /quotes/:id/withdraw` |
| Workshop | Orders, production, milestones, refunds | `GET /orders/mine`, `GET /orders/:id`, `POST /orders/:id/start`, `POST /orders/:id/milestones`, `POST /milestones/:id/start`, `POST /milestones/:id/complete`, `POST /payments/:id/refund` |
| Inspector | Assigned inspections, order details, history, decisions | `GET /inspections/assigned`, `GET /orders/:id`, `GET /orders/:id/inspections`, `POST /orders/:id/inspections` (PASSED, FAILED, REWORK_REQUIRED with optional `milestoneId`) |
| Admin | Overview, users, workshops, jobs, orders, quality | `GET /admin/users`, `GET /admin/orders`, `GET /admin/quotes`, `GET /admin/invitations`, `GET /workshops` (+ `/:id`), `GET /jobs`, `GET /inspections` |
| Admin | Workshop verification | `PUT /workshops/:id` `{ verificationStatus }` |
| Admin | Inspector assignment, reassignment, history | `GET /inspections/inspectors`, `PUT` / `DELETE /orders/:id/inspector`, `GET /orders/:id/inspector-assignments` |

## How backend data is mapped

| Backend | Frontend |
|---|---|
| Role `BUYER` … `ADMIN` | `buyer` … `admin` |
| Job `DRAFT`, `OPEN`, `MATCHED`, `AWARDED`/`IN_PROGRESS`, `COMPLETED`, `CANCELLED` | Workflow summary `DRAFT`, `POSTED`, `QUOTING`, `AWARDED`, `CLOSED`, `CANCELLED`. The exact value is kept in `Job.backendStatus` and shown in job badges (Draft, Open, Invitations sent, Awarded, In production, Completed, Cancelled) |
| Job `manufacturingProcess` enum | "Manufacturing capability" text. Posting maps the text to the enum by name or keyword (e.g. "CNC turning" → `LATHE_TURNING`); unsupported text is a validation error listing the supported capabilities |
| Job fields with no column (specification text, unit text, requirement list, city/state, budget, file metadata) | Saved under `technicalSpecifications.kaarigarlink` and read back unchanged. Requirements that name a machine type (e.g. "CNC lathe") become mandatory `MACHINE_TYPE` requirements; other text becomes informational `OTHER` |
| Quote `totalPrice` + `estimatedDays` | `amount` + `estimatedDelivery` (= quote creation date + days, India time) |
| Quote `ACCEPTED` / `CANCELLED` | `AWARDED` / `CANCELLED` ("Cancelled (job cancelled)", not a rejection). `Quote.version` = `updatedAt` |
| Invitation `INVITED` | `PENDING` (`EXPIRED` added to the frontend union) |
| Order `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` | `AWARDED`, `IN_PRODUCTION` (or `ACCEPTED`/`REWORK` from the latest inspection), `CLOSED`, `CANCELLED`; the exact value is kept in `Order.backendStatus` |
| Milestone `APPROVED` / `COMPLETED` / `REWORK_REQUIRED` | Progress counts `COMPLETED`; labels use the exact `Milestone.stage`: "Approved", "Completed · awaiting buyer approval", "Rework required" |
| Inspection `PASSED` / `FAILED` / `REWORK_REQUIRED` | QC `ACCEPTED` / `FAILED` / `REWORK` (`FAILED` added to the frontend union and the inspector's decision options) |
| Payment `SUCCEEDED` / `FAILED` / `REFUNDED` | `SIMULATED_PAID` / `SIMULATED_FAILED` / `SIMULATED_REFUNDED` |

**QC findings (M11):** checklist results are stored as structured data (`Inspection.checklist`), with the free-text summary in `findings`. Inspections recorded before M11 are still read from their text format. Evidence files are stored as metadata (name, type, size) only.

## Backend additions made for M10

| Endpoint | Why |
|---|---|
| `POST /api/quotes/:quoteId/withdraw` | The workshop UI's existing "Withdraw quote" command had no backend equivalent |
| `GET /api/admin/users`, `/orders`, `/quotes`, `/invitations` (ADMIN, paginated, read-only) | The existing admin workspace shows platform-wide users, orders, quotations and invitations; the backend had no admin list for them |
| `GET /api/orders/:orderId` now also returns `buyer { id, name }` and `rating` | Workshop and inspector views show the buyer's name; the buyer's order view shows the submitted rating |
| M11: `PATCH /api/auth/me`, `GET/PUT/DELETE /api/orders/:orderId/inspection-draft`, `checklist` on inspections, `expectedUpdatedAt` on quote edit/withdraw, `GET /api/orders/mine?view=full`, `GET /api/admin/workshops` | See the M11 section below |

M10 needed no migration. M11 adds one (see the M11 section).

## M11: feature completeness and data fidelity

| Area | Behaviour |
|---|---|
| Profiles | Buyer **My profile** page and workshop **Settings** edit the account's name and phone (`PATCH /api/auth/me`). Workshop **Profile** edits business details and manages machinery, capabilities and capacity windows (`PUT /workshops/:id` and the `/machines`, `/capabilities`, `/capacity` sub-resources). It also shows verification status and a completeness checklist. Changing verified details returns a workshop to pending verification (backend rule) |
| QC drafts | **Save draft** stores a private server draft (`PUT /orders/:id/inspection-draft`), restored after a refresh or a new sign-in; **Delete draft** removes it. A draft is never an inspection and changes nothing on the order. Submitting an inspection records it with its structured checklist and deletes the draft in one transaction. Reassigned inspectors don't inherit drafts |
| Quote edits | The editor sends the version it loaded (`expectedUpdatedAt`). A stale edit or withdrawal gets `409`, nothing is overwritten, and the editor offers **Reload latest quote** |
| Status fidelity | Draft jobs, cancelled quotes, expired invitations, failed inspections, awaiting-approval and rework milestones, refunded payments and verification states each have their own label |
| Derived information | Buyer and admin activity feeds say they're derived from record dates, not an audit log. Matches on a closed job, and the admin "invitation match snapshots", say the scores were stored when each invitation was sent |
| Requests | The admin overview reads full workshop profiles from `GET /admin/workshops`; the buyer order list and the workshop workspace read `GET /orders/mine?view=full`. Both replace one request per record |

**Migration:** `20261122150000_add_structured_inspections` (additive): `Inspection.checklist` (JSONB, nullable) and the `InspectionDraft` table (unique per order and inspector, cascades with the order or user). Apply it with `npm run db:deploy` in `backend/`, and regenerate the Prisma client (`npx prisma generate`, with the backend dev server stopped on Windows) before running the backend.

## M12: documents, audit history, notifications, password change

| Area | Behaviour |
|---|---|
| Documents | Real files, stored by the backend (`FILE_STORAGE_DIR`, default `backend/storage/uploads`, git-ignored). The live adapter uploads with `apiUpload` (raw body) and downloads with `apiDownload` (token-authenticated blob, saved via the browser). The buyer uploads design files when posting a job and from the job page. Workshops see the files on invitations and orders. The inspector uploads evidence on the inspection page or straight from a checklist item, and that evidence is linked to the submitted inspection. Buyers, workshops, inspectors and admins can download according to the server's access rules |
| Audit history | The buyer's order activity, the order history panels (workshop, inspector, admin) and the admin dashboard's recent activity come from recorded audit events. Admins have an **Audit history** page with filters and pages. The buyer dashboard feed is still derived from record dates and says so |
| Notifications | A bell in the header shows the unread count (refreshed every minute), a list, mark-as-read and mark-all-read. Clicking a notification opens the related page |
| Accounts | Every role can edit name and phone and change the password: buyer **My profile**, workshop **Settings**, inspector and admin **My account**. A password change signs out other sessions; this session continues with the new token |

All four are optional services on `DataService` (`files`, `audit`, `notifications`, `account.changePassword`). Mock mode doesn't provide them, so it keeps its metadata-only attachments and has no bell or audit page.

## Known limitations

- **No password reset or email verification:** there is no email provider. A user who forgets their password can't recover the account in the app.
- **No virus scanning:** files are validated by extension, MIME type and (for common formats) magic bytes only.
- **Local storage only:** `StorageBackend` is the extension point for cloud storage.
- **Mock-mode design files** stay metadata only.
- **Gaps in the audit history:** it starts when the M12 migration is applied, so earlier actions have no events. Machine, capability and capacity edits, milestone edits and draft saves are not audited. Two events are written just after their operation instead of inside its transaction: invitation responses (a single conditional update) and workshop profile/verification updates (an optimistic update). A crash between the two steps could leave the change without its event.
- **Notifications** are in-app only (no email, SMS or push) and are polled, not pushed.
- **Admin matches** are invitation snapshots (labelled), not re-run matching.
- **Inspector workspace:** reads each assignment's order, inspections and draft separately.
- **Workshop locations:** no state/region field.
- **Payments and refunds** are simulated.

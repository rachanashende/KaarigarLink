# KaarigarLink

**A job-work marketplace for small manufacturers.**

KaarigarLink connects **buyers** who need parts made with **workshops** that have the right machines, materials, certifications and free capacity to make them. Independent **inspectors** verify quality and **admins** oversee the platform.

Small workshops are often invisible to the businesses that need them, and buyers have no reliable way to tell which shop can actually take on a job. KaarigarLink replaces phone calls and guesswork with a transparent flow: post a job, see ranked workshops with the reasons behind each ranking, compare quotations, award an order, follow production milestones, and rely on an independent quality check before the work is accepted.

The project supports **UN SDG 9** (industry, innovation and infrastructure), particularly target 9.3 on giving small-scale industrial enterprises access to markets.

---

## How it works

```text
Buyer posts job
      |
      v
Matching engine ranks workshops
      |
      v
Buyer invites workshops
      |
      v
Workshops accept or decline
      |
      v
Workshops submit quotations
      |
      v
Buyer compares and awards a quote
      |
      v
Workshop produces through milestones
      |
      v
Buyer approves milestones
      |
      v
Inspector records QC (pass / fail / rework)
      |
      v
Order completes
      |
      v
Payment (simulated)
      |
      v
Buyer rates workshop
```

1. **Post a job.** The buyer describes the part: manufacturing process, material, quantity, deadline, delivery location, and requirements such as machine type, tolerance, part size or certification.
2. **Match.** The matching engine evaluates every workshop. It first filters out workshops that cannot do the work, then ranks the rest. Every result comes with plain-language explanations, and excluded workshops list the reasons they were excluded.
3. **Invite and quote.** The buyer invites the workshops they want. Workshops accept or decline, and accepting workshops submit a quotation (price, delivery estimate, notes).
4. **Award.** The buyer compares quotes side by side and awards one. The chosen quote becomes an order; the other quotes are rejected.
5. **Produce.** The workshop breaks the order into sequential milestones. The buyer approves each one before the next can start.
6. **Inspect.** An inspector records a quality decision. A failed or rework decision sends the active milestone back to the workshop, and an order cannot complete until the latest inspection has passed.
7. **Close out.** The buyer records a simulated payment and rates the workshop, which feeds back into future matching.

## Who uses it

| Role | What they do |
|---|---|
| **Buyer** | Posts jobs, reviews ranked matches, invites workshops, compares quotes, awards orders, approves milestones, records payments and rates workshops |
| **Workshop** | Maintains a profile of machines, capabilities and capacity; responds to invitations; submits quotes; runs production milestones; handles rework |
| **Inspector** | Reviews assigned orders, saves inspection drafts, uploads evidence and records independent QC decisions with findings |
| **Admin** | Oversees users, workshops, jobs and orders; verifies workshops, assigns inspectors, manages refunds and reviews audit history |

---

## Features

### Smart workshop matching

Matching is computed live and is deterministic: the same data always gives the same ranking.

**Eligibility rules** (all mandatory, checked before scoring):

- The workshop is `VERIFIED`.
- It offers the job's manufacturing process and supports the material.
- It has an operational machine suited to the process (and any specific machine type the job requires).
- It meets mandatory requirements: tolerance, maximum part size and certifications.
- It has enough free capacity before the deadline.
- Its lead time plus production time still meets the deadline.
- Optionally, it is within a maximum distance.

**Ranking** uses a weighted five-factor score:

| Factor | Weight |
|---|---:|
| Workshop rating | 35% |
| Capacity headroom | 25% |
| Distance to the job | 20% |
| Deadline slack | 15% |
| Experience (completed jobs) | 5% |

Workshops with no location are never excluded for distance; the factor is simply left out of their score.

### Quotations and orders

- A workshop can quote only through its own accepted invitation, and only while the job is open and before its deadline.
- Quote editing and withdrawal support optimistic concurrency checks to prevent stale updates.
- Awarding a quote creates the order and the order's job state in a single transaction, and rejects competing quotes.
- Order lifecycle: `CONFIRMED → IN_PROGRESS → COMPLETED`, with cancellation allowed before completion.
- Every state change is race-safe: repeated or concurrent requests produce exactly one result.

### Milestones and quality control

- Milestones are numbered and strictly sequential, so only one is active at a time.
- Flow: `PENDING → IN_PROGRESS → COMPLETED → APPROVED`, with `REWORK_REQUIRED` set by a rework inspection.
- Inspections record `PASSED`, `FAILED` or `REWORK_REQUIRED` with written findings.
- Structured QC checklists and private inspector drafts are supported.
- Inspector assignments have an auditable history. Reassigned inspectors lose access to orders they are no longer assigned to.
- Completing an order requires the latest inspection to be `PASSED`.

### Payments and ratings

- Payments and refunds are **simulated only**: no gateway is involved and no money moves.
- A buyer creates a payment and simulates its outcome.
- Cumulative payments can never exceed the agreed price, and money uses exact decimal arithmetic.
- Successful payments on cancelled orders can be marked as refunded through the simulated refund workflow.
- Buyers can rate a completed order once. Ratings update the workshop's aggregate score, which influences future matching.

### Documents, audit history and notifications

- Buyers can upload job design documents and inspectors can upload inspection evidence.
- Documents are stored locally by default, with metadata and access permissions recorded in the database.
- Private documents are available only to authorized users through protected download endpoints.
- Submitted inspection evidence is immutable.
- Important business actions are recorded in an append-only audit history.
- Users receive in-app notifications for relevant workflow events and can mark notifications as read.

### Account security

- JWT authentication with bcrypt password hashing and role-based authorization on protected routes.
- Password changes invalidate previously issued tokens immediately through per-user token versioning.
- Ownership checks restrict users to their own jobs, quotes, orders, documents and notifications.
- Request validation rejects invalid or unexpected fields.
- Helmet security headers, configurable CORS and environment validation help protect the API.
- Database-level locking and transaction boundaries protect important state transitions.

---

## Tech stack

| Area | Technology |
|---|---|
| **Backend** | Node.js 22/24, Express, TypeScript, Zod, Helmet, CORS |
| **Database** | PostgreSQL 16 with Prisma ORM 6 (multi-file schema, SQL migrations) |
| **Auth** | JWT bearer tokens, bcryptjs |
| **Frontend** | React 19, Vite 7, TypeScript (strict), React Router 7 |
| **UI** | Tailwind CSS 4, shadcn/ui-style components, Radix primitives, Lucide icons |
| **Data and forms** | TanStack Query, React Hook Form, Zod |
| **Testing** | Vitest and Supertest (backend), Vitest and React Testing Library (frontend), Playwright (end-to-end) |

---

## Repository structure

```text
.
├── README.md
├── PRD.md
├── render.yaml
├── docs/
│   ├── API.md
│   ├── SEED_DATA.md
│   ├── frontend-overview.md
│   ├── contracts.md
│   ├── design-system.md
│   ├── feature-matrix.md
│   ├── live-integration.md
│   ├── testing.md
│   └── evidence/
├── backend/
│   ├── prisma/
│   │   ├── schema/
│   │   ├── migrations/
│   │   └── seed/
│   ├── scripts/
│   │   └── smoke.ts
│   ├── storage/
│   │   └── uploads/
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── validators/
│   │   ├── middleware/
│   │   └── utils/
│   └── tests/
│       ├── unit/
│       └── api/
└── frontend/
    ├── src/
    │   ├── app/
    │   ├── components/
    │   ├── features/
    │   │   ├── auth/
    │   │   ├── buyer/
    │   │   ├── workshop/
    │   │   ├── inspector/
    │   │   └── admin/
    │   └── services/
    └── e2e/
```

### Data model

`User` · `Workshop` · `Machine` · `Capability` · `WorkshopCapacity` · `Job` · `JobRequirement` · `JobInvitation` · `Quote` · `Order` · `Milestone` · `Inspection` · `InspectionDraft` · `Payment` · `Rating` · `Document` · `AuditEvent` · `Notification` · `InspectorAssignment`

---

## Getting started

### Prerequisites

- **Node.js 22 or 24** (the frontend needs 22.12 or newer)
- **PostgreSQL 16** running locally on port 5432
- Git

### 1. Backend

```bash
git clone https://github.com/rachanashende/KaarigarLink.git
cd KaarigarLink/backend

npm install
```

Then open <http://localhost:4000/api/health>. You should see `"database": "up"`. Run the tests with `npm test`.

## Environment variables

`backend/.env` (development) and `backend/.env.test` (API tests) are created from the templates and are **git-ignored. Never commit them.**

| Variable | Needed locally? | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **required** | — | `postgresql://postgres:<password>@localhost:5432/kaarigarlink_dev?schema=public` |
| `JWT_SECRET` | **required** | — | ≥ 16 chars. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SEED_DEFAULT_PASSWORD` | only for `npm run db:seed` | — | 8–72 chars. Password of every seed account; share it privately |
| `CORS_ORIGINS` | optional in development | `http://localhost:5173,http://127.0.0.1:5173` | see [Frontends and CORS](#frontends-and-cors). Required in production mode |
| `NODE_ENV` | optional | `development` | `production` only for a [local production-mode run](#local-production-mode-run) |
| `PORT` | optional | `4000` | |
| `JWT_EXPIRES_IN` | optional | `7d` | |
| `BCRYPT_SALT_ROUNDS` | optional | `10` | |
| `SMOKE_*` | only for `npm run smoke` | — | see [Smoke test](#smoke-test) |

`.env.test` **must point at a different database**, for example `kaarigarlink_test`: API tests wipe every table. The test runner refuses to start if `.env` and `.env.test` use the same database.

## Frontends and CORS

Browsers only let a frontend call the API if its exact origin is allowed. These are the frontends' actual local origins (Vite's default port is 5173):

| Frontend (branch) | Dev command | Origin |
|---|---|---|
| Workshop app (`feature/member-3-workshop-frontend`) | `vite` | `http://localhost:5173` |
| Buyer / inspector / admin app (`feature/luzain-frontend`) | `vite --host 127.0.0.1` | `http://127.0.0.1:5173` |

- The development default allows both. `localhost` and `127.0.0.1` are different origins to a browser, so both are listed.
- **Running both frontends at once:** Vite moves the second one to **port 5174**. Allow it in `backend/.env`:
  ```
  CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
  ```
- Rules for `CORS_ORIGINS`: comma-separated `scheme://host[:port]`, no path, no trailing slash. `*` is allowed in development only.
- The main frontend (`frontend/`) runs in **mock mode** by default and can run in **live mode** against this backend. See [docs/live-integration.md](docs/live-integration.md).

## Running the frontend against the backend (live mode)

1. Start PostgreSQL, then the backend: `cd backend`, `npm run db:deploy`, `npm run db:seed` (optional demo data), `npm run dev` (http://localhost:4000).
2. In `frontend/`, copy `.env.example` to `.env.local` and set `VITE_SERVICE_MODE=live` and `VITE_API_BASE_URL=http://localhost:4000/api`.
3. `npm run dev` in `frontend/` and open http://127.0.0.1:5173. Sign in with a backend account (seed accounts use `SEED_DEFAULT_PASSWORD`) or create one on the registration page.

Set `VITE_SERVICE_MODE=mock` (or remove it) to go back to the in-browser demo data.

**Document storage (M12):** uploaded design files and inspection evidence are written to `FILE_STORAGE_DIR` (default `backend/storage/uploads`, relative to `backend/`, git-ignored, never served statically) up to `MAX_UPLOAD_BYTES` (default 10 MB). See `backend/.env.example` and the Documents section of [docs/API.md](docs/API.md). Feature status: [docs/feature-matrix.md](docs/feature-matrix.md).

After pulling new migrations (for example M12's `20261122160000_add_documents_audit_notifications`), run `npm run db:deploy` in `backend/` and restart the backend so the regenerated Prisma client is used (stop the dev server first on Windows: `npx prisma generate` can't replace a locked query engine).

## Database setup

1. **PostgreSQL must be installed and running** locally (port 5432). Prisma does not install or start PostgreSQL.
2. **`DATABASE_URL` in `backend/.env` must point to the target database**: user, password, host, port and database name, e.g. `postgresql://postgres:<password>@localhost:5432/kaarigarlink_dev?schema=public`. `.env.test` points to a *separate* database (e.g. `kaarigarlink_test`).
3. **The target database must exist, or the user in `DATABASE_URL` must be allowed to create it.**
   - If the database doesn't exist yet and the user has permission to create databases, `npm run db:deploy` creates it first. The default `postgres` superuser has this permission.
   - With a restricted user, create the database beforehand, for example in pgAdmin or with `"C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres kaarigarlink_dev`.
4. **`npm run db:deploy` applies the existing Prisma migrations** in `prisma/migrations/` to that database, which creates the tables (or updates them to the latest migration).
   - It never creates new migrations and never drops data.
   - Run it again after pulling new migrations.

## Database migrations

```bash
cp .env.example .env
cp .env.test.example .env.test
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
Copy-Item .env.test.example .env.test
```

Edit both files and configure your PostgreSQL credentials, JWT secret and seed password.

**Important:** `.env.test` must point to a separate test database. API tests use this database and may clear its tables. Never point it at your development or production database.

Apply migrations and optionally load demo data:

```bash
npm run db:deploy
npm run db:seed
```

Start the backend:

```bash
npm run dev          # watch mode, http://localhost:4000
```

## Local production-mode run

Use this to check the compiled build exactly as it would run in production, on your machine against your local database:

```bash
npm run build        # prisma generate + compile to dist/
# bash
NODE_ENV=production CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 npm run start:prod
# PowerShell
$env:NODE_ENV="production"; $env:CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"; npm run start:prod
```

- `start:prod` runs `prisma migrate deploy` (never `migrate dev`), then `node dist/server.js`. `npm start` skips the migration step.
- In production mode `CORS_ORIGINS` is **required**. The server refuses to start without it, and `*` is rejected.
- `DATABASE_URL` and `JWT_SECRET` still come from `.env`, unless you set them in the shell.

## Tests, typecheck and build

The full testing guide, covering databases, test uploads, the migration drift check and the live-mode browser journeys, is in [docs/testing.md](docs/testing.md).

```bash
npm test             # full suite (unit + API)
npm run test:unit    # unit tests only - no database needed
npm run test:api     # API tests - need PostgreSQL + .env.test
npm run typecheck    # tsc --noEmit (src, tests, prisma, scripts)
npm run build        # production build to dist/
```

API tests use the database in `.env.test`. Migrations are applied to it automatically, and tables are truncated between test files.

## Prisma Studio

```bash
npm run db:studio    # browser UI for the database in .env
```

It uses `DATABASE_URL` from `.env` unless you override it in your shell, so check which database you're looking at.

## Smoke test

`npm run smoke` drives the real HTTP API of a running backend:

1. health check
2. buyer and workshop log in
3. buyer creates a job
4. buyer gets matches
5. buyer invites the workshop
6. workshop lists its invitations
7. workshop accepts
8. buyer sees `ACCEPTED`

> **It writes data** (one job and one invitation per run). Run it against a **local demo/test database**, not one whose data you want to keep clean. It never deletes anything. At the end it cancels the job it created; set `SMOKE_KEEP_JOB=true` to keep it.

| Variable | Required | Meaning |
|---|---|---|
| `SMOKE_BASE_URL` | yes | the running backend, e.g. `http://localhost:4000` |
| `SMOKE_BUYER_EMAIL` / `SMOKE_BUYER_PASSWORD` | yes | a BUYER account |
| `SMOKE_WORKSHOP_EMAIL` / `SMOKE_WORKSHOP_PASSWORD` | yes | a WORKSHOP account whose workshop is **VERIFIED**, has a capability, an operational machine and free capacity in the next 14 days |
| `SMOKE_CONFIRM_WRITES` | yes | must be `yes` |
| `SMOKE_KEEP_JOB` | no | `true` to keep the smoke job instead of cancelling it |
| `SMOKE_TIMEOUT_MS` | no | how long to wait for the health check (default 30000) |

**Recommended: run it against the test database.** It's already separate from your dev data, and `npm test` resets it anyway.

```bash
# Terminal 1 (backend/): seed the TEST database and serve it on port 4000
export DATABASE_URL="<DATABASE_URL from .env.test>"
SEED_DEFAULT_PASSWORD='<pw>' npm run db:seed
npm run dev
```

The API runs at `http://localhost:4000`.

Open `http://localhost:4000/api/health`. You should see `"database": "up"`.

### 2. Frontend

Open another terminal:

```bash
cd KaarigarLink/frontend
npm install
npm run dev
```

Vite displays the local frontend URL, normally `http://localhost:5173`.

The frontend defaults to mock mode:

```env
VITE_SERVICE_MODE=mock
```

To use the live backend, configure the frontend environment:

```env
VITE_SERVICE_MODE=live
VITE_API_BASE_URL=http://localhost:4000/api
```

Use the backend's matching CORS configuration to allow the frontend origin.

### Playwright browser setup

Install the Playwright engines with:

```bash
npx playwright install chromium firefox webkit
```

The default suite runs all three engines with two workers; use:

```bash
npm run test:e2e -- --project=chromium
```

for Chromium-only reproduction.

See [Phase 9D verification](docs/phase-9d-verification.md) for browser/accessibility coverage and remaining limits.

Playwright starts an isolated development server on port 4175 for the existing persistent mock workflow tests. It does not reuse another development server; Firefox and WebKit each run one worker to limit browser/diagnostic contention on Windows.

On Windows with script execution restrictions, use `npm.cmd` and `npx.cmd`.

The Playwright test toolchain is pinned to `@playwright/test@1.64.1` because the 1.65.x Firefox ARIA-reflection regression crashes otherwise valid axe/label queries. Keep its matching browser binaries installed; the minimal compatibility regression guards future upgrades. See the [Firefox follow-up](docs/phase-9d-verification.md) for the reproduction, upstream issue and actual checks.

### Demo accounts

The frontend currently runs in **mock mode** (`VITE_SERVICE_MODE=mock`) by default with a coherent in-browser demo dataset.

Choose a role on the login page or sign in with a mock demo account (all use password `DemoPass123!`):

| Role | Email |
|---|---|
| Buyer | `buyer@kaarigarlink.example` |
| Workshop | `workshop@kaarigarlink.example` |
| Inspector | `inspector@kaarigarlink.example` |
| Admin | `admin@kaarigarlink.example` |

Demo data persists in the browser during development and can be reset from the buyer, inspector or admin dashboards.

These mock accounts are separate from the backend seed accounts described below.

---

## Environment variables (backend)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | none | e.g. `postgresql://postgres:<password>@localhost:5432/kaarigarlink_dev?schema=public` |
| `JWT_SECRET` | yes | none | At least 16 characters |
| `SEED_DEFAULT_PASSWORD` | for seeding | none | 8–72 characters; the password of every seed account |
| `CORS_ORIGINS` | configuration-dependent | local origins | Comma-separated allowed origins, e.g. `http://localhost:5173,http://127.0.0.1:5173` |
| `PORT` | no | `4000` | |
| `JWT_EXPIRES_IN` | no | `7d` | |
| `BCRYPT_SALT_ROUNDS` | no | `10` | |

`.env` files are git-ignored. Never commit them.

---

## Demo data

`npm run db:seed` creates **18 accounts, 12 workshops and 11 jobs** designed to exercise every matching scenario: fully eligible workshops, missing capabilities or certifications, insufficient capacity, deadlines that are too tight, unverified or rejected workshops, workshops without coordinates, and jobs with zero to four eligible matches.

- Seed accounts use the `@kaarigarlink.test` domain, for example `asha.rao@kaarigarlink.test` (buyer), `precision-works@kaarigarlink.test` (workshop), `priya.inspector@kaarigarlink.test` (inspector) and `admin@kaarigarlink.test` (admin).
- The seed is repeatable, runs in one transaction, never touches real data, never rewrites order history, and refuses to run in production mode.
- Dates are relative to the day you seed, so re-seed before a demo.

See [docs/SEED_DATA.md](docs/SEED_DATA.md) for the full dataset and expected matches.

---

## API overview

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, profile and password updates |
| Workshops | Profile, machines, capabilities, capacity and ratings |
| Jobs | Create, list, view, update, publish and cancel jobs |
| Matching | `GET /jobs/:id/matches` |
| Invitations | Create invitations, list invitations and respond |
| Quotes | Create, edit, withdraw and list quotations |
| Orders | Award quotes, view orders, start, complete and cancel orders |
| Milestones | Create, edit, start, complete and approve milestones |
| Inspections | Submit and view inspections, manage inspector assignments and inspection drafts |
| Payments | Create and simulate payments; view payments and simulate refunds |
| Ratings | Submit ratings and view workshop ratings |
| Documents | Upload, list, download and delete authorized documents |
| Audit | View administrative audit records and order history |
| Notifications | List notifications, view unread counts and mark notifications as read |
| Admin | Administrative workshop, user, order and inspection oversight |

Full request and response details, validation rules and error cases are in [docs/API.md](docs/API.md).

---

## Frontend routes

| Route | Description |
|---|---|
| `/` | Public marketplace entry page for anonymous visitors; authenticated visitors are redirected to their role dashboard |
| `/foundation` | Foundation and component specimen page |
| `/login` | Sign in or choose a demo role |
| `/buyer/dashboard` | Active jobs, quotes, orders and deadlines |
| `/buyer/jobs`, `/buyer/jobs/new`, `/buyer/jobs/:id` | Job list, posting form and job brief |
| `/buyer/jobs/:id/matches` | Ranked workshops with score explanations and invitations |
| `/buyer/jobs/:id/quotes` | Side-by-side quote comparison |
| `/buyer/orders`, `/buyer/orders/:id` | Order tracking: milestones, QC status, rework and reviews |
| `/workshop/*` | Dashboard, invitations, quotations, orders, profile, settings and onboarding |
| `/inspector/*` | Dashboard, assigned inspections, QC checklist and decisions, rework and history |
| `/admin/*` | Dashboard, users, workshops, jobs, orders, audit history and quality oversight |

The interface is responsive, keyboard accessible, and uses status text and icons alongside color.

---

## Testing

### Backend

Run from `backend/`:

```bash
npm test
npm run test:unit
npm run test:api
npm run typecheck
npm run build
```

- `npm test` runs the full backend suite.
- `npm run test:unit` runs unit tests without a database.
- `npm run test:api` runs API tests and requires PostgreSQL and `.env.test`.

The API suite covers authentication, jobs, matching, invitations, quotes, orders, milestones, inspections, payments, ratings, documents, audit history, notifications and concurrency-sensitive workflows.

### Frontend

Run from `frontend/`:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

### Live end-to-end tests

The live Playwright suite exercises the frontend against a real backend and an isolated seeded PostgreSQL E2E database.

Use the live Playwright configuration and its corresponding script/configuration documented in [docs/testing.md](docs/testing.md). Keep the E2E database separate from the development and test databases.

### Smoke test

`npm run smoke` (in `backend/`) drives a running API through the core flow: buyer and workshop log in, the buyer posts a job, gets matches, invites the workshop, the workshop accepts, and the buyer sees the accepted invitation.

It writes data, so run it against a local test database; see the variables it needs in `backend/.env.example`.

---

## Database commands

Run from `backend/`:

```bash
npm run db:deploy
npm run db:migrate -- --name <change>
npm run db:reset
npm run db:studio
```

- `db:deploy` applies existing migrations.
- `db:migrate` creates and applies a new migration.
- `db:reset` drops and recreates the database schema. **This destroys data.**
- `db:studio` opens Prisma Studio.

Do not run database reset commands against a database containing data you need to preserve.

---

## Status and scope

### Current implementation status

- The backend supports authentication, workshops, jobs, matching, invitations, quotations, orders, milestones, quality control, simulated payments and refunds, ratings, document storage, audit history and in-app notifications.
- The frontend supports all four roles and offers both mock mode and live backend integration.
- Live workflows include buyer, workshop, inspector and admin operations, with role-based authorization.
- Payments and refunds remain simulated; no real payment gateway is configured.
- Documents use local storage by default. Cloud storage is not configured.
- Email verification, password reset and external transactional email integrations remain future integration work.
- The application is currently intended to run locally. External deployment is deferred.

### Earlier frontend implementation phases

#### Phase 8B.3 command compatibility

Buyer award, order creation, production/rework/QC submission, workshop payment/closure, profile/settings/onboarding writes were initially disabled pending compatible contracts. This was the scope of that earlier phase, not the current application state.

See the [command compatibility matrix](docs/phase-8b3-contract-matrix.md) and [verification report](docs/phase-8b3-verification.md) for its original scope, tests and limits.

## Phase 9A shared visual system

The dedicated design/phase-9a-ampliflow branch introduced verified Ampliflow-inspired typography/color and shared shell/component styling, preserving all four-role workflows.

Exact source values, app adaptations, fonts/licenses and motion rules are documented in [the Phase 9A specification](docs/phase-9a-design-specification.md).

The `/foundation` route includes an isolated component specimen section; it performs no business mutation.

See [Phase 9A verification](docs/phase-9a-verification.md) for visual evidence and the original phase's scope.

## Phase 9A.5 public entry

Anonymous visitors see the public marketplace homepage at `/`. Its capability categories, five-stage workflow, participant sections and independent-quality explanation describe the existing demo without publishing private records or promising disabled transactions.

Navigation anchors work on desktop and in the keyboard-accessible mobile dialog. All entry CTAs use `/login`; choose an existing demo role there.

Authenticated `/` and `/login` visits still redirect to the current role dashboard. Existing protected routes, deep links, sessions and business permissions are preserved.

The page reuses Phase 9A fonts, tokens, components and reduced-motion-aware transitions, with no new dependency or business contract.

See [Phase 9A.5 verification](docs/phase-9a5-verification.md) for responsive evidence, checker limitations and the original phase's scope.

## Phase 9D browser and accessibility verification

The frontend branch includes Playwright browser and accessibility verification. Its browser setup, coverage, compatibility notes and remaining limitations are documented in [Phase 9D verification](docs/phase-9d-verification.md).


# KaarigarLink

**A job-work marketplace for small manufacturers.** KaarigarLink connects **buyers** who need parts made with **workshops** that have the right machines, materials, certifications and free capacity to make them. Independent **inspectors** verify quality and **admins** oversee the platform.

Small workshops are often invisible to the businesses that need them, and buyers have no reliable way to tell which shop can actually take on a job. KaarigarLink replaces phone calls and guesswork with a transparent flow: post a job, see ranked workshops with the reasons behind each ranking, compare quotations, award an order, follow production milestones, and rely on an independent quality check before the work is accepted. The project supports **UN SDG 9** (industry, innovation and infrastructure), particularly target 9.3 on giving small-scale industrial enterprises access to markets.

---

## How it works

```
Buyer posts job ──▶ Matching engine ranks workshops ──▶ Buyer invites workshops
                                                              │
                                              Workshops accept or decline
                                                              ▼
Buyer approves milestones ◀── Workshop produces ◀── Buyer awards a quote ◀── Workshops quote
        │
        ▼
Inspector records QC (pass / fail / rework) ──▶ Order completes ──▶ Payment (simulated) ──▶ Buyer rates workshop
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
| **Buyer** | Posts jobs, reviews ranked matches, invites workshops, compares quotes, awards orders, approves milestones, records payments, rates workshops |
| **Workshop** | Maintains a profile of machines, capabilities and capacity; responds to invitations; submits quotes; runs production milestones; handles rework |
| **Inspector** | Reviews orders in production and records independent QC decisions with findings |
| **Admin** | Read-only oversight of users, workshops, jobs, orders and quality records |

---

## Features

### Smart workshop matching
Matching is computed live and is deterministic: the same data always gives the same ranking.

**Eligibility rules** (all mandatory, checked before scoring):
- the workshop is `VERIFIED`
- it offers the job's manufacturing process and supports the material
- it has an operational machine suited to the process (and any specific machine type the job requires)
- it meets mandatory requirements: tolerance, maximum part size, certifications
- it has enough free capacity before the deadline
- its lead time plus production time still meets the deadline
- optionally, it is within a maximum distance

**Ranking** uses a weighted five-factor score:

| Factor | Weight |
|---|---|
| Workshop rating | 35% |
| Capacity headroom | 25% |
| Distance to the job | 20% |
| Deadline slack | 15% |
| Experience (completed jobs) | 5% |

Workshops with no location are never excluded for distance; the factor is simply left out of their score.

### Quotations and orders
- A workshop can quote only through its own accepted invitation, and only while the job is open and before its deadline.
- Awarding a quote creates the order and the order's job state in a single transaction, and rejects competing quotes.
- Order lifecycle: `CONFIRMED → IN_PROGRESS → COMPLETED`, with cancellation allowed before completion.
- Every state change is race-safe: repeated or concurrent requests produce exactly one result.

### Milestones and quality control
- Milestones are numbered and strictly sequential, so only one is active at a time.
- Flow: `PENDING → IN_PROGRESS → COMPLETED → APPROVED`, with `REWORK_REQUIRED` set by a rework inspection.
- Inspections record `PASSED`, `FAILED` or `REWORK_REQUIRED` with written findings. Completing an order requires the latest inspection to be `PASSED`.

### Payments and ratings
- Payments are **simulated only**: no gateway is involved and no money moves. A buyer creates a payment and simulates its outcome. Cumulative payments can never exceed the agreed price, and money uses exact decimal arithmetic.
- Buyers can rate a completed order once. Ratings update the workshop's aggregate score, which influences future matching.

### Security and reliability
- JWT authentication with bcrypt password hashing and role-based authorization on every protected route
- Strict request validation (zod) that rejects unknown fields
- Ownership checks: users can only see and act on their own jobs, quotes, orders and payments
- Helmet security headers, configurable CORS, and environment validation that fails fast on bad configuration
- Database-level locking on every transition, covered by dedicated concurrency tests

---

## Tech stack

| Area | Technology |
|---|---|
| **Backend** | Node.js 22/24, Express 5, TypeScript 5.9, zod, helmet, CORS |
| **Database** | PostgreSQL 16 with Prisma ORM 6 (multi-file schema, SQL migrations) |
| **Auth** | JWT bearer tokens, bcryptjs |
| **Frontend** | React 19, Vite 7, TypeScript (strict), React Router 7 |
| **UI** | Tailwind CSS 4, shadcn/ui-style components, Radix primitives, Lucide icons |
| **Data and forms** | TanStack Query, React Hook Form, zod |
| **Testing** | Vitest and Supertest (backend), Vitest and React Testing Library (frontend), Playwright (end-to-end) |

---

## Repository structure

```
.
├── README.md
├── PRD.md                      Product requirements for the frontend
├── render.yaml                 Optional hosting blueprint (not used for local runs)
├── docs/
│   ├── API.md                  Full API contract: endpoints, request/response shapes, errors
│   ├── SEED_DATA.md            Demo accounts, workshops, jobs and expected matches
│   ├── frontend-overview.md    Frontend walkthrough, routes and demo flows
│   ├── contracts.md            Shared frontend data contracts
│   ├── design-system.md        Palette, typography and component patterns
│   └── evidence/               Screenshots of the application
├── backend/
│   ├── prisma/
│   │   ├── schema/             base.prisma, core.prisma, orders.prisma
│   │   ├── migrations/         SQL migrations
│   │   └── seed/               Deterministic demo dataset and seeder
│   ├── scripts/smoke.ts        End-to-end smoke test against a running API
│   ├── src/
│   │   ├── routes/ controllers/ services/ validators/ middleware/ utils/
│   │   └── services/matching/  Matching engine (pure functions)
│   └── tests/                  unit/ and api/ suites
└── frontend/
    ├── src/
    │   ├── app/                Router, providers, app shell
    │   ├── components/         Shared UI: tables, badges, dialogs, forms
    │   ├── features/           auth, buyer, workshop, inspector, admin
    │   └── services/           Typed service contracts, mock adapters, fixtures
    └── e2e/                    Playwright specs
```

### Data model

`User` · `Workshop` · `Machine` · `Capability` · `WorkshopCapacity` · `Job` · `JobRequirement` · `JobInvitation` · `Quote` · `Order` · `Milestone` · `Inspection` · `Payment` · `Rating`

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

npm install                      # also runs `prisma generate`
cp .env.example .env
cp .env.test.example .env.test
# Edit both files: set your Postgres password, a JWT_SECRET and a SEED_DEFAULT_PASSWORD.
# .env.test must point at a DIFFERENT database (API tests wipe every table).

npm run db:deploy                # apply migrations
npm run db:seed                  # optional: load demo accounts and data
npm run dev                      # http://localhost:4000
```

Open <http://localhost:4000/api/health>. You should see `"database": "up"`.

### 2. Frontend

```bash
cd frontend
npm ci
npm run dev                      # http://127.0.0.1:5173
```

The frontend currently runs in **mock mode** (`VITE_SERVICE_MODE=mock`) with a coherent in-browser demo dataset, so every role's screens can be explored without the backend. Choose a role on the login page, or sign in with a demo account (all use password `DemoPass123!`):

| Role | Email |
|---|---|
| Buyer | `buyer@kaarigarlink.example` |
| Workshop | `workshop@kaarigarlink.example` |
| Inspector | `inspector@kaarigarlink.example` |
| Admin | `admin@kaarigarlink.example` |

Demo data persists in the browser during development and can be reset from the buyer, inspector or admin dashboards.

---

## Environment variables (backend)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | none | e.g. `postgresql://postgres:<password>@localhost:5432/kaarigarlink_dev?schema=public` |
| `JWT_SECRET` | yes | none | At least 16 characters |
| `SEED_DEFAULT_PASSWORD` | for seeding | none | 8–72 characters; the password of every seed account |
| `CORS_ORIGINS` | production only | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated origins; `*` is rejected in production |
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

Base URL: `http://localhost:4000/api`. Authenticate with `Authorization: Bearer <token>`. Every response uses a consistent envelope: `{ success, message, data }`, or `{ success: false, message, errors? }` on failure.

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Workshops | Profile, machines, capabilities and capacity; `GET /workshops/:id/ratings` |
| Jobs | `POST /jobs`, `GET /jobs`, `GET /jobs/:id`, `PUT /jobs/:id` |
| Matching | `GET /jobs/:id/matches` |
| Invitations | `POST /jobs/:id/invitations`, `GET /jobs/:id/invitations`, `GET /workshops/invitations`, `POST /invitations/:id/respond` |
| Quotes | `POST /quotes/invitations/:invitationId`, `PATCH /quotes/:quoteId`, `GET /quotes/jobs/:jobId`, `GET /quotes/mine` |
| Orders | `POST /orders/award/:quoteId`, `GET /orders/mine`, `GET /orders/:orderId`, `POST /orders/:orderId/start`, `/complete`, `/cancel` |
| Milestones | Create, edit, start, complete and approve |
| Inspections | `POST` and `GET /orders/:orderId/inspections` |
| Payments (simulated) | `POST /orders/:orderId/payments`, `POST /payments/:paymentId/simulate`, `GET /orders/:orderId/payments` |
| Ratings | `POST /orders/:orderId/rating` |

Full request and response details, validation rules and error cases are in [docs/API.md](docs/API.md).

---

## Frontend routes

| Route | Description |
|---|---|
| `/login` | Sign in or choose a demo role |
| `/buyer/dashboard` | Active jobs, quotes, orders and deadlines |
| `/buyer/jobs`, `/buyer/jobs/new`, `/buyer/jobs/:id` | Job list, posting form and job brief |
| `/buyer/jobs/:id/matches` | Ranked workshops with score explanations and invitations |
| `/buyer/jobs/:id/quotes` | Side-by-side quote comparison |
| `/buyer/orders`, `/buyer/orders/:id` | Order tracking: milestones, QC status, rework and reviews |
| `/workshop/*` | Dashboard, invitations, quotations, orders, profile, settings and onboarding |
| `/inspector/*` | Dashboard, assigned inspections, QC checklist and decision, rework and history |
| `/admin/*` | Dashboard, users, workshops, jobs, orders and quality oversight |

The interface is responsive, keyboard accessible, and uses status text and icons alongside color.

---

## Testing

**Backend** (from `backend/`)

```bash
npm test             # full suite
npm run test:unit    # unit tests, no database needed
npm run test:api     # API tests, need PostgreSQL and .env.test
npm run typecheck
npm run build
```

The API suite covers authentication, jobs, matching, invitations, quotes, orders, milestones, inspections, payments and ratings, with dedicated concurrency tests for every state transition.

**Frontend** (from `frontend/`)

```bash
npm run typecheck
npm run lint
npm run test         # unit and component tests
npm run test:e2e     # Playwright end-to-end tests
npm run build
```

**Smoke test.** `npm run smoke` (in `backend/`) drives a running API through the core flow: buyer and workshop log in, the buyer posts a job, gets matches, invites the workshop, the workshop accepts, and the buyer sees the accepted invitation. It writes data, so run it against a local test database; see the variables it needs in `backend/.env.example`.

---

## Database commands (from `backend/`)

```bash
npm run db:deploy                       # apply existing migrations
npm run db:migrate -- --name <change>   # create and apply a new migration
npm run db:reset                        # drop, recreate and re-apply (destroys data)
npm run db:studio                       # browse the database in Prisma Studio
```

---

## Status and scope

- The backend API is complete for the full flow: authentication, workshops, jobs, matching, invitations, quotations, orders, milestones, quality control, simulated payments and ratings.
- The frontend covers all four roles on a stateful mock data layer. Connecting it to the live API is the next step; the service layer is typed so the mock adapters can be swapped for real requests without rewriting screens.
- Payments are simulated and no external payment, mapping or paid AI services are used.
- The project is run locally. `render.yaml` is included for possible future hosting.

# KaarigarLink

A manufacturing marketplace that connects **buyers** who need parts made with **workshops** that have the machines, capabilities and free capacity to make them. **Inspectors** verify quality and **admins** run the platform.

A buyer posts a job (process, material, quantity, deadline, location, requirements). The backend's matching engine filters every workshop on technical fit, verification, capacity and deadline feasibility, ranks the eligible ones, and the buyer invites the workshops they want. Workshops accept or decline.

This repository currently contains the **backend** (`backend/`). The frontends are developed on separate branches. **The project runs locally only**: external hosting is postponed until the team decides on it (see [Hosting status](#hosting-status)).

---

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js **22 or 24** (both verified; `engines: >=22 <25`) |
| API | Express 5, TypeScript 5.9, zod validation, helmet, CORS |
| Database | PostgreSQL 16 (local), Prisma ORM 6 (multi-file schema) |
| Auth | JWT (`Authorization: Bearer <token>`), bcryptjs password hashing |
| Tests | Vitest + Supertest (unit tests, and API tests against a local test database) |

## Repository structure

```
.
├── README.md
├── render.yaml                 Kept for possible future hosting - not used (see Hosting status)
├── docs/
│   ├── API.md                  API contract: every endpoint, request/response, errors
│   └── SEED_DATA.md            Demo accounts, workshops, jobs and expected matches
└── backend/
    ├── prisma/
    │   ├── schema/             base.prisma, core.prisma (Member 1), orders.prisma (Member 2)
    │   ├── migrations/         SQL migrations
    │   ├── seed.ts             `npm run db:seed` entry point
    │   └── seed/               deterministic demo dataset + seeder
    ├── scripts/smoke.ts        end-to-end smoke test against a running backend
    ├── src/
    │   ├── app.ts / server.ts  Express app / HTTP server
    │   ├── config/env.ts       environment validation (fails fast on bad config)
    │   ├── routes/ controllers/ services/ validators/ middleware/ utils/
    │   └── services/matching/  matching engine (pure functions)
    ├── tests/unit/             no database needed
    ├── tests/api/              need the local PostgreSQL test database
    ├── .env.example            template for backend/.env
    └── .env.test.example       template for backend/.env.test
```

## Prerequisites

- **Node.js 22 or 24** with npm (`node -v`).
- **PostgreSQL 16** running locally on port 5432, and the password of the `postgres` user.
  - On Windows the service is called `postgresql-x64-16`. `psql` is often not on PATH; it lives in `C:\Program Files\PostgreSQL\16\bin`. You usually don't need it (see [Database setup](#database-setup)).
- Git.

## Quick start

From a fresh clone:

```bash
git clone <repo-url> KaarigarLink
cd KaarigarLink
git checkout backend
cd backend

npm install                     # also runs `prisma generate`
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
cp .env.test.example .env.test  # PowerShell: Copy-Item .env.test.example .env.test
# edit both files: set your postgres password, a JWT_SECRET and SEED_DEFAULT_PASSWORD (see below)

npm run db:deploy               # applies the existing migrations to DATABASE_URL (see Database setup)
npm run db:seed                 # optional: demo accounts and data
npm run dev                     # http://localhost:4000
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
- Neither frontend calls the backend yet. Both still run on mock data.

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
npm run db:deploy                       # apply existing migrations (fresh clone, or after pulling new ones)
npm run db:migrate -- --name <change>   # create + apply a NEW migration after editing the schema
npm run db:reset                        # drop, re-create and re-apply the dev database (destroys its data)
```

- `db:deploy` never creates migrations. `db:migrate` asks for a name and writes a new folder in `prisma/migrations/`.
- The schema is split into `prisma/schema/*.prisma`. **Member 2 owns `orders.prisma`.** When a new model references a core model, its back-relation goes in `core.prisma`.
- **Pull the latest `backend` branch before creating a migration** so migration folders stay linear.

## Seed data

```bash
npm run db:seed
```

This creates 18 accounts (`@kaarigarlink.test`), 12 workshops and 11 jobs covering every matching scenario. See [docs/SEED_DATA.md](docs/SEED_DATA.md) for the accounts, the data and the expected matches. All accounts log in with `SEED_DEFAULT_PASSWORD`, for example `asha.rao@kaarigarlink.test` (buyer), `precision-works@kaarigarlink.test` (workshop) or `admin@kaarigarlink.test`.

Safety:
- **Never runs automatically.** The server doesn't seed on start.
- **Repeatable.** Records have fixed `seed-…` IDs, so re-running resets them with no duplicates. It also **deletes invitations on seed jobs**.
- **Never touches real data.** It only writes `seed-` records, and aborts with no changes if a real account already uses a seed email.
- **Refuses `NODE_ENV=production`.** Seed in development mode.
- **Dates are relative to the day you seed.** Re-seed before a demo so deadlines and capacity windows are fresh.

## Running the backend

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

# Terminal 2 (backend/)
SMOKE_BASE_URL=http://localhost:4000 SMOKE_CONFIRM_WRITES=yes \
SMOKE_BUYER_EMAIL=asha.rao@kaarigarlink.test SMOKE_BUYER_PASSWORD='<pw>' \
SMOKE_WORKSHOP_EMAIL=precision-works@kaarigarlink.test SMOKE_WORKSHOP_PASSWORD='<pw>' \
npm run smoke
```

```powershell
# Terminal 1 (backend/)
$env:DATABASE_URL="<DATABASE_URL from .env.test>"; $env:SEED_DEFAULT_PASSWORD="<pw>"
npm run db:seed; npm run dev

# Terminal 2 (backend/)
$env:SMOKE_BASE_URL="http://localhost:4000"; $env:SMOKE_CONFIRM_WRITES="yes"
$env:SMOKE_BUYER_EMAIL="asha.rao@kaarigarlink.test"; $env:SMOKE_BUYER_PASSWORD="<pw>"
$env:SMOKE_WORKSHOP_EMAIL="precision-works@kaarigarlink.test"; $env:SMOKE_WORKSHOP_PASSWORD="<pw>"
npm run smoke
```

The smoke test also works against a [local production-mode run](#local-production-mode-run). It exits with `0` on success. On failure it exits with `1` and prints the failed step, the HTTP status and the server's message. Credentials are never printed.

## Hosting status

**Not hosted.** KaarigarLink is run and demonstrated locally. External hosting is postponed until the team decides on it. `render.yaml` is kept unchanged from an earlier milestone for possible future use. Don't deploy it until hosting is agreed.

## Current backend milestone status

| Milestone | Status | Commit |
|---|---|---|
| M0–M2: scaffold, schema, migrations, JWT auth and roles | ✅ | `b598ee4` |
| M4: workshops, machines, capabilities, capacity (+ verification fixes) | ✅ | `f8bed92`, `0cf3acc`, `fb29be0` |
| M5: buyer job posting and status rules | ✅ | `be5cf4d`, `5d6f1a6` |
| M6: deterministic seed dataset | ✅ | `8f84db3` |
| M7: matching engine and five-factor ranking | ✅ | `be2653f` |
| M8: workshop invitations (invite, list, accept/decline, expiry) | ✅ | `2322200` |
| M9: local development & integration readiness (README, smoke test, env/CORS checks) | 🚧 in review | — |

**Ownership:**
- **Member 1** (backend core): foundation, auth, workshops, jobs, matching and invitations.
- **Member 2:** quotations, orders, milestones, quality control, payments, ratings, and the related admin workflows. None of this is implemented yet.
- **Integration contract:**
  - Accepting an invitation creates no order.
  - When Member 2 moves a job outside `OPEN`/`MATCHED`, it should call `expireOverdueInvitations({ jobId }, now, tx)` from `backend/src/services/invitationExpiry.ts`.

API details: [docs/API.md](docs/API.md) · Seed data: [docs/SEED_DATA.md](docs/SEED_DATA.md)

# Testing KaarigarLink

Four layers, from fastest to most complete. Every command runs locally; no external service or API key is needed.

| Layer | Where | Command | Needs |
|---|---|---|---|
| Backend unit and API tests | `backend/tests` | `npm test` (in `backend/`) | PostgreSQL and `backend/.env.test` |
| Frontend unit and component tests | `frontend/src/**/*.test.ts(x)` | `npm test` (in `frontend/`) | nothing |
| Browser tests, mock mode | `frontend/e2e/*.spec.ts` | `npm run test:e2e` | a Playwright browser |
| Browser tests, live mode | `frontend/e2e/live/*.live.spec.ts` | `npm run test:e2e:live` | a running backend on a **disposable** seeded database |

Also run `npm run typecheck` in both packages, `npm run lint` and `npm run build` in `frontend/`, and `npx prisma validate` in `backend/`.

## Databases: keep them apart

| Database | Used by | Notes |
|---|---|---|
| `kaarigarlink_dev` (`backend/.env`) | `npm run dev`, manual use | Never used by automated tests |
| `kaarigarlink_test` (`backend/.env.test`) | backend API tests | **Every table is truncated.** The test runner refuses to start when `.env.test` names the same database (same port and database name) as `.env` |
| a disposable database, e.g. `kaarigarlink_e2e` | live browser tests | The journeys write jobs, orders, payments and users. Create it, migrate and seed it for the run |
| a disposable shadow database | `prisma migrate diff` | Prisma resets it. Never point `--shadow-database-url` at the dev or test database |

## Uploaded files during tests

API tests write uploads to `backend/storage/test-uploads` (set in `backend/vitest.config.mts`); the test run removes that folder, and only that folder, when it finishes. Development uploads (`backend/storage/uploads` by default) are never touched. Both folders are git-ignored.

For live browser tests, start the backend with `FILE_STORAGE_DIR` pointing at a throwaway folder.

## Migration drift check

The M11 and M12 migrations were hand-written. After any schema or migration change, replay the migrations into an empty shadow database and compare them with the schema (from `backend/`):

```sh
# create an empty database first, e.g. kaarigarlink_shadow
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema \
  --shadow-database-url "postgresql://USER:PASSWORD@localhost:5432/kaarigarlink_shadow" \
  --script
```

The expected output is `-- This is an empty migration.` Prisma does not model triggers, so the `AuditEvent` append-only trigger is covered by the API tests instead (`tests/api/m12.test.ts`).

## Live browser tests

1. Create, migrate and seed a disposable database (from `backend/`, with `DATABASE_URL` pointing at it and a `SEED_DEFAULT_PASSWORD` of your choice):

   ```sh
   npx prisma migrate deploy
   npx prisma db seed
   ```

2. Start the backend against it on port 4100, allowing the test frontend's origin:

   ```sh
   PORT=4100 CORS_ORIGINS=http://127.0.0.1:5174 FILE_STORAGE_DIR=/tmp/kl-e2e-uploads npm run dev
   ```

3. Run the journeys (from `frontend/`). Playwright starts a live-mode Vite server on port 5174:

   ```sh
   E2E_API_URL=http://127.0.0.1:4100/api E2E_PASSWORD=<SEED_DEFAULT_PASSWORD> npm run test:e2e:live
   ```

   Set `E2E_BROWSER_CHANNEL=chrome` to use an installed Chrome instead of Playwright's bundled Chromium, and `E2E_WEB_PORT` to run the frontend on another port (allow that origin in the backend's `CORS_ORIGINS`).

The journeys can be rerun against the same database: each run uses new job titles and accounts.

### What the live journeys cover

- **Access:**
  - every role signs in through the form, the session survives a reload, and a wrong password is refused;
  - the backend returns 401 or 403 for direct calls without a token or with the wrong role.
- **Main order, end to end:**
  1. The buyer edits their profile, posts a job with a real design file, downloads it, and invites a workshop from the matches.
  2. The workshop sees the file, accepts the invitation, then submits and edits a quote.
  3. The buyer compares quotations and awards one.
  4. The admin verifies a workshop, assigns the inspector and filters the audit history.
  5. The workshop starts production and plans and completes a milestone.
  6. The inspector saves, restores and deletes a private draft, uploads evidence and requests rework.
  7. The workshop sees the rework decision and the evidence, then restarts and completes the milestone.
  8. The admin reassigns the order to a second inspector: the replaced inspector is refused directly by the API, the assignment history is kept, and the order is reassigned back.
  9. The inspector records a PASSED inspection.
  10. The buyer approves the milestone, pays (simulated), completes the order, rates the workshop, reads the audit-based order activity and opens the notifications.
- **Other flows:**
  - publishing a draft job and cancelling an open job;
  - a stale quote edit returning 409, and withdrawing a quote;
  - cancelling a paid order, with the workshop recording the refund;
  - changing a password, after which the old password and old tokens stop working;
  - editing the workshop profile, machinery, capabilities and capacity.
- **Admin and notifications:**
  - the admin's bell matches the admin's own unread count. Admins receive no notifications by design; they follow activity in the audit history;
  - assigning notifies the new inspector, and reassigning also notifies the replaced inspector. Verifying a workshop notifies its owner. None of these notify the admin, buyer or workshop;
  - a recipient's bell shows the unread count and the list; opening an item marks it read and follows its link; Mark all read clears the count;
  - nobody, the admin included, can read or mark another user's notifications (404), and unauthenticated calls get 401.

Not covered by browser tests: a FAILED inspection decision, which is covered by the backend API tests; email, SMS and push notifications, which do not exist; and real payments, which are simulated by design.

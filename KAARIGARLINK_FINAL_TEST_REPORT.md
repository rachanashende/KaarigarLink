# KaarigarLink: final test report

**Date:** 2026-11-22
**Scope:** fixes for the 8 bugs in the browser test report, plus automated verification of everything that run left unverified (marked NOT RUN or BLOCKED there).
**Method:** automated only. Backend tests run against an isolated test database, browser tests run against a disposable seeded database, and the development database was not touched. Payments stay simulated, and no external services are used.

## 1. Summary

- **All 8 reported bugs are fixed**, each with a regression test. Four of them also have a browser screenshot of the corrected screen.
- **Two more defects were found and fixed:**
  - a NUL byte in a request caused a server error (500), and outside production the response included internal details;
  - two admin audit-history filter changes made in quick succession could lose one change.
- **Every planned check ran and passed:**
  - backend typecheck and 743 tests;
  - schema validation and the migration check (no drift);
  - frontend typecheck, lint, 417 tests and the production build;
  - 54 mock-mode and 35 live-mode browser tests.
- **Local MVP completion criteria: met**, with the limitations in section 6.

## 2. The eight reported bugs

| Bug | Cause (reproduced) | Resolution | Evidence |
|---|---|---|---|
| **BUG-01** Job page said order awarding was unavailable | Leftover text from before awarding was built (`JobDetailPage.tsx`) | Live mode now explains the real steps: invite workshops, compare quotations, then award one, which creates the order. The demo workspace text says awarding isn't available there, which is true. | Browser test `BUG-01/05 …`; `docs/evidence/m13-browser-fixes/bug-01-05-job-detail.png` |
| **BUG-02** Workshop saw `SIMULATED_PAID` for ₹5,000 of ₹18,000 | The workshop view listed raw payment statuses with no totals | The workshop view now computes the payment summary with the same rules the server uses for the buyer, and both views show the same status label (Unpaid, Payment pending, Partly paid, Paid in full, Refund due, Refunded). The workshop sees: "Partly paid · Agreed ₹18,000.00 · Paid ₹5,000.00 · Pending ₹0.00 · Remaining ₹13,000.00". | `paymentSummary.test.ts` (6 tests, including the exact report case and agreement with the server's summary); browser test `BUG-02/06 …`; `bug-02-workshop-payments.png`, `bug-02-06-buyer-payments.png` |
| **BUG-03** "Job has no location, so distance is not scored" | Jobs are scored by distance only when they have map coordinates. The job form records city and state as text and nothing converts them to coordinates, so distance was never scored. | Coordinates are never guessed, so distance stays unscored without them. The explanation now says exactly why: "Distance not scored: the job has no map coordinates (a delivery city and state are not converted to coordinates)". There's a similar message for workshops without coordinates. | Engine unit tests; API test in `security.test.ts`; browser test `BUG-03/04 …`; `bug-03-04-matches.png` |
| **BUG-04** "Aluminium 6061" matched no aluminium workshop | Materials were compared as exact strings | Matching now accepts a material when it is a supported material followed by a grade or form (a number, or a word such as sheet, bar or rod). Accepted: `aluminium 6061`, `aluminium 6061-T6`, `SS 304`, `mild steel sheet`. Rejected: different materials such as `stainless steel` vs `mild steel` or `steel`, `aluminium bronze`, or a missing word boundary. The match reason says why, for example "(aluminium 6061 is a grade or form of aluminium)". The job form adds a hint and suggestions of the base materials workshops list. | `materialMatch.test.ts` (28 tests: variants, grades, aliases, unsupported materials, eligibility); API and browser tests; `bug-03-04-matches.png` |
| **BUG-05** "Pune, Maharashtra, Pune, Maharashtra" | Live jobs store "City, State" as the address, and the page appended city and state again | The location is shown once; a different street address is still followed by city and state | Browser test `BUG-01/05 …`; `bug-01-05-job-detail.png` |
| **BUG-06** "Payment created as PENDING" stayed after Mark paid | The message was only ever set on creation | The message now describes the latest action ("Payment marked as paid (simulated)." or the failed equivalent) and is cleared when a new action starts | Browser test `BUG-02/06 …`; `bug-02-06-buyer-payments.png` |
| **BUG-07** Contradictory evidence text | Text from the demo mode ("metadata-only references") was also shown in live mode | Live mode now says once that files are stored on the server and that evidence attached to a submitted inspection can't be deleted. The demo text is unchanged. | Browser test `evidence is immutable …`; `bug-07-inspection-evidence.png` |
| **BUG-08** "Job created: Not recorded" on the workshop invitation | The backend's workshop invitation response didn't include the job's creation date | The response now includes it. The change is additive, so nothing else is affected. | API regression test in `security.test.ts`; browser test `declines an invitation …`; `bug-08-invitation.png` |

### Two more defects found and fixed during this work

| Defect | Fix | Test |
|---|---|---|
| A NUL byte in an ID, query or JSON body (e.g. `/api/orders/%00`) caused a **500** error from the database. Outside production the response included a stack trace. | A new middleware, `rejectNulBytes`, returns a clean `400 "Request contains an invalid character"` before any database query runs | `security.test.ts` → *NUL bytes* (path, query, body, login; nothing is written) |
| Admin audit history: two filter changes made before the page re-renders kept only the second change. For example, clearing "Order ID" and then typing an Action left the old order filter in place, so the search showed nothing. | Pending filter changes now accumulate until the next render | `AdminAuditPage.test.tsx`. It fails on the old code and passes on the fix; this was checked by temporarily restoring the old code. |

## 3. Results for the cases left unverified by the browser report

These are the cases the browser report marked NOT RUN or BLOCKED. Every result here comes from an automated test that actually ran in this session. "Live" means a real browser (Chrome) driving the real frontend against the real backend and PostgreSQL.

### Workflow from rework to completion, plus reassignment
| Case | Result | Test |
|---|---|---|
| Workshop performs requested rework (restart and complete the milestone) | PASS | live `journey` → *workshop: sees the rework decision … restarts and completes the milestone* |
| Inspector reopens the assigned inspection and submits PASSED with a structured checklist | PASS | live `journey` → *inspector: records a PASSED inspection* |
| Completion blocked before a PASSED inspection (409) | PASS | live `remaining` → *PASSED -> complete -> rate …* |
| Buyer approves the milestone and completes the order | PASS | live `journey`; live `remaining` |
| Buyer submits a rating | PASS | live `journey`; live `remaining` |
| Duplicate rating prevented (no form after reload; API 409) | PASS | live `remaining` |
| Notifications and order history reviewed | PASS | live `journey` (activity from audit history, notification bell), live `admin-notifications` |
| Final order status after refresh and after signing in again (buyer and workshop) | PASS | live `remaining` |
| Inspector reassignment: the replaced inspector gets 404 for the order, its documents, history and draft, and can't submit; the new inspector gets access; the assignment history keeps the ended assignment | PASS | live `journey` → *admin: reassignment …*; API `inspectorAssignment.test.ts`, `m12Access.test.ts` |

### Buyer
| Case | Result | Test |
|---|---|---|
| Profile edit persists after reload and after signing in again | PASS | live `remaining` |
| Publish a draft job; cancel an open job | PASS | live `flows` |
| A job can't be cancelled after award (API 409; Cancel button gone) | PASS | live `remaining` |
| Negative or zero payment refused (UI message; API 400; nothing recorded) | PASS | live `remaining` |
| Cancel a paid order; refund due shown; workshop records the refund; buyer sees it | PASS | live `flows` |
| Notifications: unread count, open one, mark all read | PASS | live `admin-notifications` |
| Change password; old password and old tokens stop working at once | PASS | live `flows`; API `tokenVersion.test.ts` (including the same-second case) |
| Boundary values on job fields | PASS (API) | `jobs.test.ts`, `job.validator.test.ts` |

### Workshop
| Case | Result | Test |
|---|---|---|
| Profile, machinery, capabilities and capacity: edit, save, remove | PASS | live `flows` |
| Decline an invitation (UI); buyer sees it declined; it can't be reopened (409) | PASS | live `remaining` |
| Edit a quote | PASS | live `journey` |
| Withdraw a quote | PASS | live `flows` |
| Stale quote edit returns 409 | PASS | live `flows`; API `m11.test.ts` |
| Prohibited milestone transitions refused (complete a pending milestone: 409; approve before completion: 409; buyer starts one: 403) | PASS | live `remaining`; API `milestones.test.ts` |
| Order documents and evidence visible; download | PASS | live `journey` |
| Records a refund on a cancelled order | PASS | live `flows` |
| Blocked from other roles' actions | PASS | API `security.test.ts` |

### Inspector
| Case | Result | Test |
|---|---|---|
| Draft is private, saved, restored after reload and deleted | PASS | live `journey`; API `m11.test.ts` |
| Evidence can't be changed once submitted (API delete returns 409; no Delete button) | PASS | live `remaining`; API `m12.test.ts` |
| PASSED / FAILED / REWORK_REQUIRED decisions | PASS | live `journey` (REWORK_REQUIRED, PASSED); API `inspections.test.ts`, `rework.test.ts` (FAILED) |
| A reassigned draft doesn't transfer | PASS | API `inspectorAssignment.test.ts` |
| An unassigned inspector is denied | PASS | API `security.test.ts` |

### Admin
| Case | Result | Test |
|---|---|---|
| Verify a workshop and return it to pending; the owner is notified | PASS | live `journey`, live `admin-notifications` |
| Assign, reassign and unassign an inspector; the new and the replaced inspector are notified, the admin is not | PASS | live `admin-notifications`; API `m12Access.test.ts` |
| Audit history filters, including clear-filters | PASS | live `journey`; `AdminAuditPage.test.tsx` |
| Admin bell shows only the admin's own notifications (admins receive none by design) | PASS | live `admin-notifications` |
| Admin directory lists: pagination without overlap, totals, limits, unknown query keys rejected, no password hashes exposed (the lists take only page and limit; there are no filters) | PASS (API) | `adminLists.test.ts` (new, 8 tests) |

### Uploads and documents (BLOCKED in the browser run, now covered)
| Case | Result | Test |
|---|---|---|
| Valid PDF and PNG upload through the UI file picker, with correct name, type and size; the storage location is never exposed | PASS | live `remaining` |
| The downloaded file is byte-identical to the upload | PASS | live `remaining` (PNG) |
| Unsupported extension (`.exe`) refused with a message | PASS | live `remaining`; API `m12.test.ts` |
| Wrong MIME type / spoofed contents refused | PASS | live `remaining`; API `m12.test.ts` |
| Oversized file (over 10 MB) refused: "larger than the server allows" | PASS | live `remaining`; API `m12Access.test.ts` (413) |
| Another buyer or an uninvited workshop can't list, download or delete; a signed-out user gets 401 | PASS | live `remaining`; API `security.test.ts` |
| Evidence can't be changed once its inspection is submitted | PASS | live `remaining` |
| Test uploads are isolated from development uploads | PASS | API runs write to `backend/storage/test-uploads` and remove only that folder afterwards |

## 4. Backend security results (`backend/tests/api/security.test.ts`, 30 tests, plus the existing suites)

| Check | Result |
|---|---|
| 17 representative endpoints reject unauthenticated calls (401); forged, malformed and `alg: none` tokens rejected | PASS |
| A buyer is refused every admin endpoint (403), including inspector assignment and workshop verification | PASS |
| A workshop can't create jobs, pay, inspect or complete orders | PASS |
| A different workshop can't read or change another workshop's order, documents, history, payments, milestones, profile, invitations or quotes (404) | PASS |
| An unassigned inspector can't read the order, draft, documents or history, upload or inspect (404) | PASS |
| Another buyer, and the admin, can't read or mark someone else's notifications; another buyer can't see the order, payments, history or documents, pay or cancel | PASS |
| Unknown IDs, odd IDs and SQL-like IDs return 400/404, never 500; no stack traces or internal details in responses | PASS |
| Malformed JSON → 400; wrong types, unknown fields and negative or zero amounts → 400; bodies over 1 MB → 413 | PASS |
| NUL bytes in a path, query or body → 400 (was 500) | PASS (fixed) |
| A password change invalidates every earlier token immediately, including one issued in the same second | PASS (`tokenVersion.test.ts`) |
| Demo login is unavailable unless `NODE_ENV=development` **and** `ENABLE_DEMO_LOGIN=true`; with it set to true in production the backend refuses to start; allowlisted roles only; local requests only | PASS (`demoLogin.test.ts` API and unit, 21 tests) |
| Audit history is append-only (the database blocks edits and deletes) | PASS (`m12.test.ts`) |

## 5. Full suite results (this session, after all fixes)

| Check | Result |
|---|---|
| Prisma schema validation | valid |
| Migration drift check (all migrations replayed into a throwaway database, compared with the schema) | no drift ("empty migration") |
| Backend typecheck | pass |
| Backend tests (unit + API, isolated test database) | **743 passed / 47 files** |
| Frontend typecheck | pass |
| Frontend lint (`--max-warnings 0`) | pass |
| Frontend unit/component tests | **417 passed / 31 files** |
| Frontend production build | pass |
| Mock-mode browser tests (Chrome, 2 workers) | **54 passed** |
| Live-mode browser tests (Chrome, real backend, disposable database) | **35 passed** (access 3, admin notifications 4, flows 5, journey 10, remaining 13) |
| `git diff --check` | no whitespace errors |
| Secrets in the frontend build | none found: no seed password, no JWT secret, nothing token-shaped |

The mock-mode browser suite passes with 2 workers. With the default of 7 workers on this machine, some tests intermittently hit time limits, which earlier runs traced to machine load, not the app.

## 6. Known limitations

- **Distance isn't scored for jobs posted through the form**: it records city and state, not map coordinates, and coordinates are never guessed. The match explanation now says so. Turning addresses into coordinates would need an external service, which is out of scope for this milestone.
- **Stored materials are lowercased** (existing normalisation), so "Aluminium 6061" displays as "aluminium 6061".
- **Admins receive no in-app notifications** by design; they follow activity in the audit history.
- **Notifications** are in-app only. There's no password reset or email verification.
- **Payments are simulated.**
- **Uploads** are checked for extension, MIME type and file signature, with no virus scanning; storage is on the local disk.
- **Live-mode browser tests** use a desktop viewport. Mobile and keyboard checks run in the mock-mode suite.

## 7. Tests that couldn't run, and why

- **No new manual (human-driven) browser pass was made.** Everything above is automated.
- **The development database was deliberately not used**, so the AUTOTEST jobs and order from the browser report remain untouched and unverified by these runs. Equivalent records were created in the disposable e2e database.
- **Expired or invalid sessions and simulated 500 or slow responses** are covered by unit tests (the live HTTP client tests) and the mock-mode browser suite, not by tampering with a live session.

## 8. Local MVP completion

**Met.** Everything the browser report marked NOT RUN or BLOCKED is now covered by an automated test that ran and passed, all 8 reported bugs and the 2 additional defects are fixed with regression tests, and every suite passes.

Manual setup still needed for a local demo (these are environment settings, not code):

1. In `backend/.env`, set `SEED_DEFAULT_PASSWORD`, then run `npm run db:deploy` and `npm run db:seed` in `backend/`. This also applies the token-version migration.
2. For one-click demo login, add `ENABLE_DEMO_LOGIN=true` to `backend/.env` (development only). Remove it before deploying.
3. If you browse at `http://127.0.0.1:5173`, add that origin to `CORS_ORIGINS`.
4. Close the leftover local servers from earlier automated sessions (ports 4100, 4101, 5173, 5174) before running `npm run dev`.

## Files changed in this round

- **Backend source:**
  - `src/utils/normalize.ts` (material matching)
  - `src/services/matching/matchEngine.ts` (material grades, distance wording)
  - `src/services/invitation.service.ts` (job `createdAt`)
  - `src/middleware/rejectNulBytes.ts` (new)
  - `src/app.ts`
- **Backend tests:**
  - `tests/unit/materialMatch.test.ts` (new)
  - `tests/api/security.test.ts` (new)
  - `tests/api/adminLists.test.ts` (new)
  - `tests/unit/matching.engine.test.ts` (updated wording)
- **Frontend source:**
  - `src/services/orders.ts` (payment summary and label)
  - `src/features/workshop/WorkshopRecords.tsx`
  - `src/features/buyer/OrderActions.tsx`
  - `src/features/buyer/JobDetailPage.tsx`
  - `src/features/buyer/PostJobPage.tsx`
  - `src/features/inspector/InspectionDetailPage.tsx`
  - `src/features/admin/AdminAuditPage.tsx`
- **Frontend tests:**
  - `src/services/paymentSummary.test.ts` (new)
  - `src/features/admin/AdminAuditPage.test.tsx` (new)
  - `e2e/live/remaining.live.spec.ts` (new)
- **Evidence:** `docs/evidence/m13-browser-fixes/*.png` (6 screenshots)
- **This report:** `KAARIGARLINK_FINAL_TEST_REPORT.md`

No migrations, no database resets and no changes to `.env` files or `desktop.ini`. Nothing was staged, committed, pushed or merged.

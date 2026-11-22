# Phase 8B.3 verification - safe workshop workflows

Date: 19 November 2026 (Asia/Calcutta).
Branch: integration/workshop-frontend.
Starting and final HEAD: 0a2384bb81bfae385acc0d3d6f7e1da4f4d5ed0b.
Starting working tree was clean. No commit, push, merge, PR, fetch or history rewrite was performed.

## Outcome and contract review

Only local mock invitation responses and canonical quotation commands are enabled. Existing authentication, role guards, shell, shared services/store/query cache, design tokens and legacy Member 3 source are retained. There is no new backend adapter, endpoint, package, second store or standalone provider.

The [compatibility matrix](phase-8b3-contract-matrix.md) was produced before implementation. Sources reviewed read-only include shared domain/services, handoff, Phase 8B.2 ownership mappings, docs/API.md, backend/src/routes/index.ts, workshop.routes.ts, validators/workshop.validator.ts, prisma/schema/orders.prisma, tests/api/workshops.test.ts and workshopConcurrency.test.ts. The current backend mounts no invitation/quote/order workflow endpoint. Planned API invitation statuses differ from canonical frontend mock statuses. Existing backend workshop CRUD does not by itself provide a safe frontend revision/verification/unit mapping.

## Exact enabled commands

| WorkshopService method | Required inputs | Local behavior |
| --- | --- | --- |
| respondToInvitation | Canonical actor ID, invitation ID, strict {response: ACCEPTED or DECLINED} | Owned PENDING invitation on open/unexpired/unawarded job -> terminal response. No quote, award or order created. |
| submitQuote | Actor ID, invitation ID, strict {amount, estimatedDelivery, notes} | Accepted owned invitation -> one SUBMITTED canonical Quote for the job/workshop pair. Different duplicate conflicts; exact submitted retry returns existing record. |
| editQuote | Actor ID, quote ID, strict {expected, changes} with the three quote terms | Only owned SUBMITTED quote with accepted invitation/open job. Expected values detect conflicting stale edits. Exact completed retry has no extra effect. |
| withdrawQuote | Actor ID, quote ID, strict {expected} terms | Same guards, SUBMITTED -> WITHDRAWN. Exact retry is a no-op; resubmission is unavailable. |

Amount is finite, positive, at most INR 1 billion, with at most two decimal places. Estimated delivery is an ISO date between today (India) and the job deadline. Notes are trimmed and bounded at 4000 characters. Required fields and unknown fields are checked at the service boundary; injected IDs/statuses/duration/cost fields are rejected. The canonical Quote has no production-duration or cost-breakdown fields, so those inputs are explicitly unavailable instead of being discarded or guessed.

UI confirmation precedes every command. Forms show field errors, pending controls, service failure messages and success feedback. Cancel preserves canonical state. Role changes still clear the existing query cache; successful/failed mutations invalidate shared reads. Quote terms and status appear in the existing Buyer comparison and Admin overview.

## Commands still disabled

Buyer award and order creation remain disabled pending approved atomic award/order contracts. Workshop production, milestone completion, rework and QC submission require a role/action transition table and a QC-round/reinspection contract. A status union is insufficient authorization.

Workshops cannot make inspector decisions, mark payment Paid, close orders or change another workshop's records. Production lifecycle, submitted QC and payment simulation remain distinct. Profile/machinery/capacity writes need structured canonical mapping, revision checks and verification-reset semantics before adapting existing backend CRUD. Settings and onboarding have no safe shared write contract. No incompatible standalone handler was activated.

## Ownership, atomicity and idempotency

- Every command resolves canonical User.id -> Workshop.ownerId -> Workshop.id and independently checks workshop role, exact record ownership and job/buyer references. Ambiguous profiles/IDs/pairs fail; missing and foreign record IDs are masked alike.
- Current state is checked again inside the existing synchronous clone -> validate/update -> persist -> publish transaction. No await occurs within a mutation. Validation or storage failure publishes neither business changes nor audit effects.
- No command changes Job.status, orders, milestones, inspection decisions, payments or profiles. Audit events use the existing Job entity vocabulary and canonical actor/job IDs.
- Exact repeated commands avoid duplicate quote/invitation/audit effects. Expected quote terms prevent conflicting stale edits/withdrawals within one store instance.
- Limitation: value comparisons do not detect ABA history. Separate tabs/processes are not serialized by this mock architecture; server revisions, authorization and transactions are required before live writes. No cross-tab guarantee is claimed.
- Browser localStorage is developer-controlled mock data, not a security boundary. Production authorization must be server enforced.

## Persistence and shared contracts

The existing kaarigarlink.demo-data.v1 key now writes a strict v3 envelope containing explicitly projected canonical quote fields and invitations. v1/v2 restoration is retained; reads do not migrate/write. Existing QC persistence/reset remains shared.

Restoration checks quote IDs, job/workshop pair uniqueness, references, supported changed-record states, accepted invitation and open job relationship, and immutable historical awarded/rejected seed quotes. Malformed data warns, uses the original canonical seed and blocks commands until the existing shared reset. Storage failure leaves the previous memory and persisted state intact.

WorkshopService has four additive command methods. Invitation/quotation read projections add action availability/reasons. No shared domain entity, status union, fixture, toolchain, route or authentication contract changed. Identity, attachments, order/payment snapshots and standalone workshop keys are not added to persistence. Production builds retain the existing memory-only mock policy.

## Cross-role verification

| Flow | Actual result |
| --- | --- |
| New Buyer job -> supplied match -> invitation -> workshop quote | Service integration passes with an explicit test-only MatchResult. Newly posted jobs have no automatic supplied matches; the production UI path remains blocked at matching until the real source is integrated. No matching engine/backdoor was added. |
| Buyer invitation -> addressed workshop | Existing Chromium and service cases pass; canonical job-1 eligible Deccan match is used in browser workflows. Foreign workshop records remain unavailable. |
| Workshop accept/decline -> Buyer matching | Both terminal responses pass in Chromium and services, including reload; acceptance does not create orders/quotes. |
| Submit/edit/withdraw -> Buyer comparison/Admin | Same Quote collection; Buyer browser comparison updates and service Admin snapshots agree. Reload preserves terms/withdrawal. Buyer award execution remains disabled. |
| Assigned workshop -> own order | Existing ownership/detail tests pass; foreign/missing IDs remain masked. The new workshop quote flow still shows no assigned order. |
| Workshop production -> Inspector QC | Blocked, not claimed as a successful flow: no approved production/rework/QC-round command exists. Tests verify no enabled command can change these collections. |
| Inspector decision -> Buyer and Workshop | Existing inspector and shared-workshop service/browser cases pass; private drafts/evidence remain excluded, submitted findings visible, lifecycle/payment unchanged. |
| Payment | No workshop payment command; existing separation and no-write assertions pass. |
| Shared reset/recovery | v1/v2/v3 migration, malformed data, reset, ownership and storage rollback pass. Existing all-role browser reset/recovery cases remain. |

## Actual checks

| Command | Result |
| --- | --- |
| npm.cmd run typecheck | PASS, exit 0, strict settings retained |
| npm.cmd run lint | PASS, exit 0, zero warnings |
| npm.cmd test -- --maxWorkers=2 | PASS, exit 0; 25 files / 367 tests, 58.58 seconds |
| npm.cmd run build | PASS, exit 0; TypeScript + Vite 7.3.8, 1,824 modules; Vite 5.55 seconds |
| CI=1 npm.cmd run test:e2e -- --workers=2 --output=C:/Users/Luzain Sara/AppData/Local/Temp/kaarigarlink-phase8b3-full | PASS, exit 0; all 53 Chromium tests, 3.1 minutes |
| Focused final workflow rerun after strengthening persisted QC assertion | PASS, exit 0; 3/3 Chromium workflows, 29.1 seconds |
| git diff --check and protected source/history comparison | PASS |

All 315 baseline unit/component cases and all 50 baseline Chromium cases are retained. Added 49 command/persistence service cases, three workflow component cases and three browser cases. Existing expectations were updated only where supported new behavior changed the service surface, persistence envelope or enabled controls; exclusion, role, storage and unsupported-action assertions remain. No test was deleted, skipped or weakened. Tests fix the demo workflow calendar to 19 November 2026 rather than relying on host dates for expiring fixture jobs.

Focused checks initially found test assumptions about native dialog cancellation, optional labels, pending wording, Testing Library options and an existing empty-state title. Those tests were corrected. Final review changed the new browser invariant from an absent qcUpdates property to the actual inspectionUpdates property and reran that affected suite. Browser runners print the existing NO_COLOR/FORCE_COLOR environment warning; it is not a test failure. Backend tests were inspected, not executed or altered.

## Reviewed screenshots

Five curated screenshots from the passing full Chromium run were inspected visually and retained; previous evidence was not overwritten:

- [Quotation editor, desktop 1440](evidence/phase-8b3-quotation-1440.png)
- [Quotation editor, mobile 390](evidence/phase-8b3-quotation-390.png)
- [Confirmation, desktop 1440](evidence/phase-8b3-confirmation-1440.png)
- [Confirmation, mobile 390](evidence/phase-8b3-confirmation-390.png)
- [Quotation edit in scrollable history, mobile 390](evidence/phase-8b3-edit-390.png)

Forms, date input, error semantics, touch targets and confirmation controls are readable. Mobile table history uses the existing contained horizontal scroll; edit controls remain reachable. Browser assertions check no page overflow, real native Escape, restored trigger focus and modal Tab/Shift+Tab containment. No visual system redesign was performed. Raw traces/screenshots/reports were written to temporary output directories rather than added to Git.

## Changed-file manifest

Modified:
- README.md
- docs/contracts.md
- docs/member-3-handoff.md
- frontend/src/features/workshop/README.md
- frontend/src/features/workshop/WorkshopPage.tsx
- frontend/src/features/workshop/WorkshopRecords.tsx
- frontend/src/features/workshop/Workshop.test.tsx
- frontend/src/features/workshop/WorkshopShared.test.tsx
- frontend/src/services/workshop.ts
- frontend/src/services/adapters/mockWorkshop.ts
- frontend/src/services/mock/persistence.ts
- frontend/src/services/workshop.test.ts
- frontend/src/services/orders.test.ts
- frontend/src/services/inspections.test.ts
- frontend/e2e/workshop.spec.ts
- frontend/e2e/workshop-shared.spec.ts

Created:
- docs/phase-8b3-contract-matrix.md
- docs/phase-8b3-verification.md
- frontend/src/services/workshopCommands.ts
- frontend/src/services/adapters/mockWorkshopAccess.ts
- frontend/src/services/adapters/mockWorkshopCommands.ts
- frontend/src/services/mock/quotePersistence.ts
- frontend/src/services/workshopCommands.test.ts
- frontend/src/features/workshop/WorkshopActions.tsx
- frontend/src/features/workshop/WorkshopActions.test.tsx
- frontend/e2e/workshop-workflows.spec.ts
- The five evidence PNGs linked above.

The ownership guard was extracted unchanged so reads and commands share the same rules. Buyer, Inspector and Admin application implementations were not modified.

## Backend/history/Git protection

Backend tree before/after: aa99d866532a2f424545e4e07451e72932996467 (equal). git diff HEAD -- backend is empty; no untracked backend paths exist. No backend file was edited.

Shared toolchain/configuration, package lockfile, canonical domain types, app/router/providers/auth and Member 3 standalone pages/context source compare unchanged with HEAD. Both original contributor commits d4d32f802fabb754157acf1c0a8ddf7178a38531 and 4b10f9cd9304381f7125dc3eb329588868c17945 remain ancestors of HEAD; merge db19cde is preserved.

Final status: 16 tracked modifications, 15 new files (including five curated screenshots), zero staged files, no deleted files. Only frontend and documentation paths changed. No generated cache/build output/local environment/credential file is staged. HEAD and remote branches were not changed. Work is intentionally uncommitted for Phase 8B.3 review.

## Remaining integration work

Agree backend request/response/error schemas, enum translations, ownership enforcement, idempotency/revision semantics and transactions with the responsible members before live integration. Approve buyer award/order creation before activating order progression. Agree workshop production/rework/QC-round actions, profile verification/revision mappings and authorized payment behavior. Supply matching results for newly posted jobs. Keep current disabled controls until those contracts and cross-role tests are ready.

No backend suite, live API, real payment or multi-tab transaction was tested; none is claimed. Stop after this phase for review.

## Exact final Git status

```text
 M README.md
 M docs/contracts.md
 M docs/member-3-handoff.md
 M frontend/e2e/workshop-shared.spec.ts
 M frontend/e2e/workshop.spec.ts
 M frontend/src/features/workshop/README.md
 M frontend/src/features/workshop/Workshop.test.tsx
 M frontend/src/features/workshop/WorkshopPage.tsx
 M frontend/src/features/workshop/WorkshopRecords.tsx
 M frontend/src/features/workshop/WorkshopShared.test.tsx
 M frontend/src/services/adapters/mockWorkshop.ts
 M frontend/src/services/inspections.test.ts
 M frontend/src/services/mock/persistence.ts
 M frontend/src/services/orders.test.ts
 M frontend/src/services/workshop.test.ts
 M frontend/src/services/workshop.ts
?? docs/evidence/phase-8b3-confirmation-1440.png
?? docs/evidence/phase-8b3-confirmation-390.png
?? docs/evidence/phase-8b3-edit-390.png
?? docs/evidence/phase-8b3-quotation-1440.png
?? docs/evidence/phase-8b3-quotation-390.png
?? docs/phase-8b3-contract-matrix.md
?? docs/phase-8b3-verification.md
?? frontend/e2e/workshop-workflows.spec.ts
?? frontend/src/features/workshop/WorkshopActions.test.tsx
?? frontend/src/features/workshop/WorkshopActions.tsx
?? frontend/src/services/adapters/mockWorkshopAccess.ts
?? frontend/src/services/adapters/mockWorkshopCommands.ts
?? frontend/src/services/mock/quotePersistence.ts
?? frontend/src/services/workshopCommands.test.ts
?? frontend/src/services/workshopCommands.ts
```

The index is empty (git diff --cached --stat produced no output).

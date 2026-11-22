# Phase 5 verification — inspector QC and rework

Date: 19 November 2026 (Asia/Calcutta). Member 4 frontend scope only.

## Outcome and boundaries

Implemented inspector dashboard, assigned inspection management/detail, structured human QC checklists, saved drafts, confirmed mock acceptance/rework, read-only rework follow-up and immutable submitted history. Buyer tracking reflects submitted QC outcomes.

No backend endpoint, approved production transition, award execution, payment/admin feature or workshop operation was added. Member 3's feature directory remains absent and untouched. Order production status, milestones, jobs, quotations, payment and closure state are preserved by QC commands.

Before editing, read the attached Phase 5 request, PRD.md, README, Phase 4 verification/contracts, award proposal, Member 3 handoff and existing contracts/design-system docs. Inspected actual types/store/persistence/services, routing/authentication, components and tests. No separate architecture file, backend implementation or recorded QC approval was found. Reused installed frontend-design/taste guidance for the existing operational visual system; marketing hero/effect gates remain outside scope.

## Routes

| Route | Behavior |
| --- | --- |
| /inspector/dashboard | Derived totals/pending/accepted/rework/overdue, attention queue, upcoming dates, recent decisions/rework/activity |
| /inspector/inspections | Assigned-only search/status/deadline sorting and detail links |
| /inspector/inspections/:id | Order/job/buyer/workshop, requirements, production/QC/rework distinction, checklist, drafts, decisions and full history |
| /inspector/rework | Search/filter, requested date/reason, deadline/overdue, current pending follow-up and related assignment |
| /inspector/history | Submitted decisions, inspector/date/findings/rework reason, search/filter and decision-date sorting |

All routes are lazy-loaded centrally under existing session/inspector guards. Shell changes are inspector navigation and breadcrumbs only. Existing Buyer/Workshop/Admin behavior is preserved.

Only assigned inspections are returned. Missing/unassigned detail/write IDs share NOT_FOUND. Unknown actors get UNAUTHORIZED, wrong roles FORBIDDEN and incomplete joins SERVER. No inspector UI uses unrestricted list(). Actual backend authorization is still required.

## Functional behavior

- Metrics derive from scoped data. Overdue means an unresolved pending inspection deadline or rework follow-up deadline before today in India; accepted assignments are excluded.
- Supplied checks match drawing dimensions, material, finish and quantity. No unsupported functional test or physical platform verification is implied.
- Findings support pass/fail/not-applicable/unrecorded, per-check notes/evidence metadata and an overall summary.
- Save draft persists partial checklist findings/summary without issuing QC. Proposed rework reason/action/deadline are explicitly not draft fields.
- Required checks must be recorded. Failure/NA need documented notes; recorded evidence-required checks need metadata. Acceptance rejects failures; rework requires a documented failure, reason/action and a future deadline.
- Confirmation summarizes the exact decision, pass/fail counts, summary and rework terms. Duplicate UI submits are locked; service ownership/state/validation checks run atomically again.
- Decisions append identity/timestamp/findings/history and audit activity. Draft is removed; separate order.qcStatus updates. Order.status never advances.
- Submitted assignments cannot be overwritten, reopened or automatically reinspected. Rework execution remains Member 3 work; follow-up scheduling is explicitly pending backend support.
- History sorts submitted dates and preserves earlier records. Missing dates stay unknown.
- Deadline sorting uses inspection date, or the rework date on rework cases; both dates are displayed in the assignment table.
- Buyer responses strip draft findings and show submitted QC notes/rework deadline/date only. Query caches refresh after decisions; existing auth clears identity-specific caches.

## Contracts, seeds and persistence

See [phase-5-qc-contracts.md](phase-5-qc-contracts.md) for exact provisional rules and remaining approvals.

DataService adds InspectorService listInspections/getInspection/saveDraft/submitDecision. Concrete future adapters must supply that namespace. Inspection gains optional dueOn/assignedAt/updatedAt/checklist/draft/history; supporting check/finding/decision types are added. Existing fields, state unions and Collections arrays remain. No Job/Quote/Order/Review field was removed or reinterpreted.

Mock eligibility is assigned PENDING/no prior decision, supplied checklist and an undecided QC_PENDING order. A final QC summary blocks stale pending assignments. QC-only transitions are provisional PENDING → ACCEPTED/REWORK. No production state machine is selected.

Seed now has five assignments: one pending, two accepted and two rework. inspection-overdue/order-production adds a historical 16 November rework request due 18 November; production remains IN_PRODUCTION, separate QC is REWORK. Earlier inspection IDs and the 26 November rework deadline remain. Six orders, ten jobs, ten quotes, seven users and all milestone data are retained. Fixed dates naturally become overdue as calendar time passes.

The existing key kaarigarlink.demo-data.v1 now writes envelope version 2 and accepts version 1. Buyer data survives migration; QC updates/drafts/history restore through the same store. Canonical ownership/checklists stay seed-owned; restore validates references, history prefixes and assignment/actor consistency.

Credentials, tokens, file contents and attachment/evidence metadata are excluded. Draft evidence must be reattached after reload. Submitted history remains an attestation even if session-only metadata is unavailable later. No second storage system or API-error mock fallback exists.

Invalid saved data warns and blocks writes until reset; failed saves roll back the whole commit. Reset on Inspector dashboard or Buyer orders restores all-role business/QC seed state and retains login. Development persistence only; built demos/default isolated tests stay memory-only. One active tab is supported.

## Files created

Paths relative to frontend:
- src/services/inspections.ts, inspections.test.ts.
- src/services/adapters/mockInspections.ts.
- src/services/mock/inspectionFixtures.ts, qcPersistence.ts.
- src/components/FormField.tsx, DemoDataNotice.tsx.
- src/features/inspector/InspectorDashboard.tsx, InspectionsPage.tsx, InspectionDetailPage.tsx.
- src/features/inspector/InspectionTable.tsx, QCChecklist.tsx, InspectionHistory.tsx.
- src/features/inspector/model.ts, queries.ts, model.test.ts, Inspector.test.tsx, README.md.
- e2e/inspector.spec.ts.

Root: docs/phase-5-qc-contracts.md, docs/phase-5-verification.md and eleven PNG evidence captures.

## Files modified

- frontend/src/types/index.ts: optional inspection fields/supporting types.
- frontend/src/services/contracts.ts, adapters/mock.ts: inspector namespace composition.
- frontend/src/services/adapters/mockOrders.ts: exclude draft findings from buyer responses.
- frontend/src/services/mock/fixtures.ts, orderFixtures.ts, persistence.ts: coherent QC seeds and versioned updates.
- frontend/src/app/router.tsx, AppShell.tsx: inspector lazy routes/navigation/breadcrumbs.
- frontend/src/features/buyer/OrderDetailPage.tsx: submitted decision date and accurate QC copy.
- frontend/src/features/buyer/JobField.tsx, DemoDataNotice.tsx: compatibility exports to shared implementations.
- frontend/src/services/orders.test.ts: allowlist expectation includes inspectionUpdates.
- frontend/vite.config.ts: small React-runtime chunk split.
- README.md, docs/contracts.md, docs/design-system.md, docs/member-3-handoff.md.

No dependency/lockfile, style/token, workshop feature file or backend changed. FormField and DemoDataNotice were shared once rather than duplicated per role; old buyer imports remain compatible. One documented Fast Refresh lint exception permits the existing component/constant compatibility export.

## Actual checks

Commands executed in frontend using npm.cmd; Vite/browser tooling used the same approved filesystem access as previous phases. Heavy build/browser suites ran sequentially.

| Check | Actual result |
| --- | --- |
| npm.cmd run typecheck | PASS, exit 0; also executed by production build |
| npm.cmd run lint | PASS, zero warnings, exit 0 |
| npm.cmd run test -- --maxWorkers=2 | PASS, 17 files / 199 tests, final deterministic-date run 40.59s, exit 0 |
| npm.cmd run build | PASS, 1808 modules, Vite 7.29s, no warnings, exit 0 |
| npm.cmd run test:e2e -- --workers=2 | PASS, all 32 Chromium tests, 1.9 minutes, exit 0 |
| npm.cmd run test:e2e -- e2e/inspector.spec.ts --workers=2 | PASS, all six inspector tests after the final display clarification and fixed test calendar, 1.0 minute, exit 0 (earlier run 48.1s) |
| Production preview smoke via installed Vite preview + Playwright | PASS, inspector login/dashboard/lazy detail/history sorting, no page errors, exit 0; server/browser closed |

All previous 150 unit/component and 26 browser tests remain; 49 unit/component and six browser tests added. No tests were skipped/deleted. One existing persistence-envelope assertion now includes the new allowlisted QC field.

Coverage: derived statistics/overdue boundaries, search/filter/sort/history, assignment/role/missing restrictions on reads/writes, required checks, metadata limits, partial drafts and buyer isolation, acceptance/rework validation, duplicate/concurrent and stale/final-QC conflicts, immutable history, buyer QC integration, save rollback, v1 migration/v2 restoration, corrupted history, reset, loading/error/empty states, reloads, responsive layouts and keyboard navigation.

Earlier corrections:
- Initial typecheck caught nullable user access inside navigation, an unused type import and two new RTL calls using Playwright-only exact options. Corrected before final checks.
- Initial lint caught the unused import and component/constant compatibility export; preserved the old buyer import path with a narrowly documented Fast Refresh exception.
- First full unit run passed all 199. After final history sorting/QC conflict guard, another full run passed all 199. No unit assertion was removed.
- First full Chromium run passed all 32 (1.5m); second full run passed all 32 (1.9m). Screenshot review prompted a final deadline-column clarification, followed by passing targeted inspector checks/captures below.
- Inspector overdue assertions use a fixed 19 November 2026 calendar in tests so they remain deterministic as real dates advance; application dates remain live. No failed browser run is concealed. Non-failing NO_COLOR/FORCE_COLOR environment notices remain.

## Bundle inspection and performance

Used installed Vite/Rollup's generateBundle module data without writing output to inspect entry composition. Largest pre-minification rendered source contributions included react-dom 653,699 bytes, Zod 243,055, react-hook-form 120,895, query-core 105,950 and tailwind-merge 102,703. These are module source contributions, not transfer sizes.

Inspector dashboard/list/detail load lazily; list/rework/history reuse one feature module. A small manualChunks rule groups only React/React DOM/scheduler as react-runtime, leaving feature and validation code in their existing architecture. No dependency, visualizer or optimization infrastructure was added; the warning threshold was not raised.

The Phase 4 505.56 kB main chunk becomes about 293 kB plus a 222 kB stable runtime chunk. This improves chunk/cache separation and removes the per-chunk advisory; it does not claim lower total initial JavaScript or a measured network speedup. Final sizes: main 292.61 kB / gzip 91.84; React runtime 222.24 kB / gzip 69.18; InspectorDashboard 5.06 kB, InspectionsPage 6.21 kB, InspectionDetailPage 14.70 kB; CSS 29.29 kB / gzip 6.48. The built preview smoke confirmed the runtime split and lazy routes function in production, with no business-persistence key created.

## Screenshots and accessibility

Reviewed desktop/mobile layout evidence for typography, alignment, card wrapping, form controls, draft wording, internal table overflow, states and confirmation readability. Final evidence links:
- [Dashboard desktop](evidence/phase-5-dashboard-1440.png), [mobile](evidence/phase-5-dashboard-390.png).
- [Inspections desktop](evidence/phase-5-inspections-1440.png), [mobile](evidence/phase-5-inspections-390.png).
- [Checklist/detail desktop](evidence/phase-5-checklist-1440.png), [mobile](evidence/phase-5-checklist-390.png).
- [Rework desktop](evidence/phase-5-rework-1440.png), [mobile](evidence/phase-5-rework-390.png).
- [History desktop](evidence/phase-5-history-1440.png), [mobile](evidence/phase-5-history-390.png).
- [Decision confirmation](evidence/phase-5-decision-confirmation.png).

Chromium checks cover 1440/1024/768/390/320px across all five inspector views, document overflow, mobile navigation, keyboard table scrolling, validation-summary focus, confirmation Tab/Shift+Tab/Escape and trigger-focus return. No page errors were recorded by responsive checks. Native labels/selects/textarea/file inputs and shared focus/reduced-motion patterns remain.

## Remaining dependencies and next phase

Member 2 must approve actual QC APIs, eligibility, concurrency/idempotency, evidence/upload policy, checklist/NA rules, history immutability, assignment/reinspection/rework rounds and order/QC synchronization. Member 1 confirms authentication/identity and shared resource fields. No approval or backend integration is claimed.

Known limits: synthetic demo records, one active tab, client-side filters without pagination (five assignments), explicit draft saving only, rework proposal fields not draft-persisted, no attachment content handling or metadata persistence, no reinspection scheduling, no workshop corrective-work execution, no decision edit/delete. No payments/admin or award execution.

Member 3 can consume the additive inspection contracts and existing provider, but must coordinate approved workshop/reinspection commands and persistence extensions. Her directory/routes/identity and milestone responsibilities remain intact.

Not performed: cross-browser/assistive-technology/full accessibility or security audit, deployment, backend integration or Git commits (no Git metadata). Recommended next phase: Phase 6 admin MVP after Member 4 review and separate authorization; keep backend QC/award sign-off tracked. Stop at Phase 5.

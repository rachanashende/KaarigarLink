# Phase 4 verification — buyer orders, tracking and reviews

Date: 18 November 2026. Member 4 frontend scope only.

## Outcome

Phase 4 implements owned order listing, full order details, milestone progress/timeline, read-only QC/rework visibility and a confirmed mock-only review workflow. Award review remains available with execution disabled. No award, cancellation, production, QC, payment or admin transition is implemented.

Read the attached Phase 4 request, all of PRD.md, README, Phase 3 report, award proposal, contracts, service/store/router architecture and Member 3 handoff before editing. Reused frontend-design/taste guidance for typography, alignment, restrained data layouts and browser review; marketing hero/effect gates do not apply to these operational screens.

## Routes and behavior

- /buyer/orders: owned order/job/workshop search, status filter, creation/delivery sorting, INR value, expected delivery, status and derived progress.
- /buyer/orders/:id: commercial overview, related job and workshop, awarded quote terms, quantity/material/requirements, creation and delivery dates, milestone timeline, QC/rework, review and chronological activity.
- /buyer/orders/:id/review: dedicated review view using the same owned detail query and review component.

All routes use the existing session/role shell and lazy loading. Buyer navigation/breadcrumbs/dashboard gain links; the shell is not redesigned. The Phase 0 foundation preview also loads lazily. Tokens, shared UI, authentication, dependencies and workshop placeholder behavior are preserved.

Missing/private orders share NOT_FOUND. Lists check both order and job ownership; joined quote must reference the same job/workshop. Missing joins surface SERVER. Wrong role gives FORBIDDEN and unknown actor UNAUTHORIZED at the service boundary. Client guards and actor IDs are demo checks, not backend security.

Progress is completed count / milestone count rounded to a percentage; no milestones means unknown. In-progress tasks receive no invented partial percentage. Delays use planned dates versus today in India; cancelled orders identify unfinished tasks as inactive history. Completion is independent of QC/delivery/payment.

Order.qcStatus supplies the current QC summary. Inspector records show notes and applicable rework deadlines read-only. Current Inspection lacks timestamps/history ordering; the UI explicitly discloses this rather than fabricating a latest record.

## Shared contracts and mock-only assumptions

See [phase-4-contracts.md](phase-4-contracts.md) for signatures/policy/dependencies.

BuyerService adds listOrders/getOrder/submitReview. BuyerOrderData joins existing entities, inspections/activity/review and explicit review availability. DataService adds an optional demo description/warning/reset capability.

Only optional entity fields were added: Order.createdAt, Milestone.description and Milestone.notes. Existing Job, Quote and Review shapes, identifiers and state unions remain intact. No HTTP endpoint or transition graph is approved.

Review policy is explicitly provisional and labelled in the UI: CLOSED only; once per order; integer rating 1–5; trimmed written feedback 10–2000 characters. PAID alone does not qualify. Confirmation precedes an atomic review/audit append; duplicate and ineligible attempts conflict. Errors preserve feedback. Fast duplicate submission is locked. Reviews do not alter any lifecycle or workshop aggregate rating.

Member 2 must approve review/closure rules, milestone weighting, commercial snapshots, QC history/date semantics and API contracts. Member 1 confirms authentication and shared Job/Quote representation. No team message or approval is claimed. Award proposal remains pending; its truncated example response was repaired without approving it.

## Seed and persistence

Original four jobs/matches/quotes and workshop demo identity remain. Six separate historical job/awarded-quote/order snapshots cover IN_PRODUCTION, QC_PENDING, REWORK, CLOSED, CANCELLED and PAID. Total: ten jobs, ten quotes, six orders, twenty-four milestones and four inspections. Embedded/collection milestones agree. Duplicate additional workshop user entries were removed; seven unique synthetic users remain.

Development mock services use versioned localStorage key kaarigarlink.demo-data.v1. Only jobs (all attachment metadata stripped), invitations, reviews and audit events are persisted. Identity, passwords/tokens, attachment contents/metadata, workshop profiles and immutable order/QC snapshots are excluded. Built production demos and isolated default test factories remain memory-only.

Restore uses strict validation and reference/duplicate checks. Invalid saved data visibly warns on the orders list, shows the recovery seed and blocks mutations until reset. A failed save leaves memory unchanged; a failed reset surfaces an error. No silent fallback from a real API exists.

Reset: Buyer → Manufacturing orders → Reset demo data → confirm. This removes only the demo key, restores all-role seed state and invalidates shared queries; login remains active. One active tab is supported; cross-tab write/cache synchronization is not implemented. Member 3 must coordinate a versioned persistence extension for her future mutable collections.

## Files created

Paths relative to frontend:
- src/services/orders.ts, orders.test.ts.
- src/services/adapters/mockOrders.ts.
- src/services/mock/orderFixtures.ts, persistence.ts.
- src/features/buyer/orderModel.ts, orderModel.test.ts.
- src/features/buyer/OrderBadge.tsx, OrderProgress.tsx, MilestoneTimeline.tsx.
- src/features/buyer/OrdersListPage.tsx, OrderDetailPage.tsx, OrderReview.tsx, DemoDataNotice.tsx, Orders.test.tsx.
- e2e/orders.spec.ts.

Root documentation: docs/phase-4-contracts.md, docs/phase-4-verification.md. Six screenshot files are recorded below after review.

## Files modified

- frontend/src/types/index.ts: additive optional display fields.
- frontend/src/services/jobs.ts, contracts.ts, index.ts: order service composition, optional demo API and development-only persistence.
- frontend/src/services/adapters/mock.ts; src/services/mock/store.ts, fixtures.ts: same-store order adapter, atomic persistent commits/reset and coherent seeds.
- frontend/src/app/router.tsx, AppShell.tsx: guarded lazy routes/navigation/breadcrumbs; lazy foundation preview.
- frontend/src/features/buyer/queries.ts, BuyerDashboard.tsx, JobsListPage.tsx, PostJobPage.tsx: order queries/entry link and accurate persistence copy.
- frontend/src/features/buyer/Buyer.test.tsx, model.test.ts, Marketplace.test.tsx; frontend/src/services/marketplace.test.ts; frontend/e2e/buyer.spec.ts: populated-seed expectations and existing-flow assertions retained.
- README.md, frontend/src/features/buyer/README.md, docs/contracts.md, docs/design-system.md, docs/member-3-handoff.md, docs/order-awarding-api-proposal.md.

No backend, workshop feature file, dependency/lockfile, token/style file or shared UI primitive changed. Workshop feature directory remains absent. No Git metadata/commit or deployment.

## Actual checks

Commands run from frontend with npm.cmd, heavy suites sequentially. Vite/esbuild/browser processes required the same approved filesystem access as earlier phases.

| Command | Actual result |
| --- | --- |
| npm.cmd run typecheck | PASS, exit 0; also rerun by final build |
| npm.cmd run lint | PASS, zero warnings, exit 0 |
| npm.cmd run test -- --maxWorkers=2 | PASS, 14 files / 150 tests, 34.48s, exit 0 |
| npm.cmd run build | PASS, 1794 modules, Vite 5.15s, exit 0; bundle advisory below |
| npm.cmd run test:e2e -- --workers=2 | PASS, all 26 Chromium tests, 1.1 minutes, exit 0 |

Production main JavaScript: 505.56 kB / gzip 158.68 kB. OrdersListPage 5.44 kB, OrderDetailPage 12.13 kB, CSS 28.31 kB / gzip 6.36 kB. Vite emits its non-failing >500 kB chunk advisory; the warning was not suppressed. NO_COLOR/FORCE_COLOR browser environment notices are non-failing.

All previous 110 unit/component and 21 browser tests remain; 40 unit/component and five browser tests were added. Counts/assertions were updated for six extra historical jobs/orders, including comparisons that verify award review leaves seeded orders unchanged.

Coverage includes joins/ownership/missing resources, search/filter/sort, lifecycle snapshots, progress/delay calculations, QC/rework, validation/eligibility/duplicates/concurrent review calls, save rollback, corrupt restore, explicit reset, loading/empty/error states, reload persistence, attachment exclusion, roles, responsive layouts and keyboard interaction.

### Earlier failures and corrections

- Initial typecheck found exact-optional parsed Zod fields; optional budget/createdAt are now omitted when absent.
- Initial lint rejected a ref write captured by the render-time form-handler factory; removed the unnecessary reset.
- First unit run: 125 passed / 25 failed. Three earlier tests assumed orders empty; they now assert unchanged seeded orders. One new modal focus assertion relied on jsdom native autofocus, which its modal polyfill does not implement; real keyboard focus is tested in Chromium. Twenty-one failures came from Node 26's unavailable global localStorage in a shared beforeEach.
- Second unit run: 129 passed / 21 storage-setup failures. Third: 149 passed / one storage-failure spy using Node's Storage prototype. Persistence unit tests now inject the working test Storage implementation and spy on its actual prototype. Real localStorage reload behavior is separately exercised in Chromium. Final full unit run: 150 passed.
- Initial production build passed with the chunk advisory. Lazy-loading the existing foundation preview reduced main JS from 507.82 to 505.56 kB; the advisory remains.
- First browser run: 24 passed / two assertions read the preceding render during route/filter transitions. Added visible result/heading waits without removing assertions; final full run passed all 26 tests.
- An initial npm typecheck invocation from repository root failed ENOENT (package.json lives under frontend); corrected working directory and subsequent commands passed.

## Screenshots reviewed

Reviewed actual final captures for alignment, card spacing, typography, timeline continuity, wrapping, field labels and table overflow:
- [Orders desktop](evidence/phase-4-orders-1440.png)
- [Orders mobile](evidence/phase-4-orders-390.png)
- [Rework tracking desktop](evidence/phase-4-rework-1440.png)
- [Rework tracking mobile](evidence/phase-4-rework-390.png)
- [Review desktop](evidence/phase-4-review-1440.png)
- [Review mobile](evidence/phase-4-review-390.png)

The table deliberately scrolls within its labelled region on mobile; the document does not overflow. Browser assertions cover 1440, 1024, 768, 390 and 320px, including keyboard table scrolling, mobile menu navigation, modal Tab/Escape/focus return and review validation focus. No page errors were observed by the responsive tests.

## Integration impact, limitations and next phase

Member 3's workshop directory/routes/identity are untouched. She can consume shared order/milestone types and the existing provider, keeping embedded/collection milestone writes atomic when approved. Persistence is intentionally allowlisted; her future changes require an explicit version bump/extension.

Remaining limits: synthetic historical state, no successful award action, no backend/JWT integration, provisional review policy, no cancellation/payment/QC mutation, no cross-tab conflict protocol, client-side filtering, no inspection-history timestamps, no review editing/aggregate rating updates. Attachment metadata disappears on reload by design. Real authorization is still required.

Cross-browser, screen-reader, full accessibility/security audit, deployment and live backend integration were not performed. The bundle advisory remains visible.

Recommended next step: review Phase 4 and obtain Member 1/2 contract decisions; then separately authorize Phase 5 inspector work. Stop after Phase 4 for Member 4 approval.

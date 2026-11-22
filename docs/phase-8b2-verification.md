# Phase 8B.2 verification - shared workshop data and ownership

Date: 19 November 2026 (Asia/Calcutta).
Branch: integration/workshop-frontend.
HEAD remains db19cde5515f278b21c5bfde3fc297349cee0738 with uncommitted Phase 8B.1 and 8B.2 work.

## Outcome

Workshop routes now display actual owner-scoped canonical shared records. The existing session, role guards, shell, providers, mock store, fixtures, persistence and reset are reused. No duplicate business dataset, standalone session or browser persistence mechanism was introduced.

No workshop business transition is implemented or enabled. No dependency/toolchain change, UI redesign, backend change, commit, push or merge occurred. Phase 8B.1 route/guard/compiler fixes, legacy source and evidence were preserved and extended.

## Selectors and ownership

DataService adds workshop.getWorkspace(actorId), getInvitation(actorId, invitationId), getOrder(actorId, orderId), composed in createMockService over the same MockStore as Buyer/Inspector/Admin.

Ownership is exact User.id -> Workshop.ownerId -> canonical Workshop.id -> invitation/quote/order workshopId. Role/identity and joins are checked at the service boundary. Names, email patterns, array order and standalone browser identities are never used for ownership.

Missing profile returns profile:null and no workshop records; the UI shows onboarding/profile required. Multiple owner mappings -> CONFLICT. Duplicate IDs/inconsistent owned references -> SERVER. Missing and foreign detail IDs -> the same NOT_FOUND message. Responses are detached and explicitly projected. Private QC drafts, evidence/attachment metadata, unknown secret fields and buyer private contacts are excluded.

The workspace is the aggregate selector for profile/capacity, metrics, invitations/jobs/quotes, assigned orders/milestones/submitted QC/rework and payment simulation records. UI details select only from this authorized aggregate; direct detail methods independently enforce ownership.

Shared entity/enums are unchanged. Workshop read projections and the required service namespace are additive. See [read contracts and explicit domain mappings](phase-8b2-workshop-contracts.md).

## Screens

| Route | Shared read behavior |
| --- | --- |
| /workshop and /workshop/dashboard | Canonical profile name and source-derived invitation, submitted quote, active order, pending inspection, rework and closed order counts; own invitation/order summaries |
| /workshop/invitations | Search/status filter over addressed invitations and actual job/buyer details; own canonical quotation history |
| /workshop/invitations/:invitationId | Canonical invitation ID, real job brief/budget/deadline and same-workshop/same-job quotations |
| /workshop/orders | Search/status filter over assigned orders, separate lifecycle/QC/payment simulation and actual milestone completion |
| /workshop/orders/:orderId | Matching order/job/buyer/quote terms, milestone plan, submitted QC findings/decisions and rework terms |
| /workshop/profile | Own canonical capabilities, machines, supplied rating and dated capacity slots per unit |
| /workshop/settings | Supported own account/profile information; unsupported preferences labelled accurately |
| /workshop/onboarding | Existing profile linkage or profile-required state; no registration/draft write |

The invitation route parameter was renamed from jobId to invitationId to match the actual canonical identifier; URL shape did not change. Existing Buyer/Inspector/Admin route declarations remain intact.

Useful Member 3 composition is retained in shared metric cards, invitation/order tables and filters, detail briefs, production/QC sections and profile/capacity views. Active reads live under features/workshop. Standalone pages/providers/handlers remain inactive reference source because their contracts and workflow assumptions are incompatible. No standalone type is cast into a shared entity.

## State distinctions and disabled actions

Invitation response is not award; quotation is not order; production completion is not QC acceptance; QC acceptance is not payment completion. Historical AWARDED quotes and orders are existing snapshots, not products of a new award command.

All workshop accept/decline, quote submit/edit/withdraw, order progression, QC/payment, profile/settings and onboarding writes remain disabled. Existing buyer award remains disabled. The workshop namespace has only three read methods and no mutation capability.

Order.status is labelled lifecycle, Order.qcStatus is a separate QC summary, and PaymentRecord.simulationStatus is explicitly labelled payment simulation. A PAID lifecycle order with no PaymentRecord shows no supplied payment record. Capacity utilization, unsupported dates/ratings/contacts, offered values and operational percentages are not invented.

## Persistence, reset and malformed records

No persistence code, schema, key, envelope version or production fixture changed. Reads never commit to storage. Existing buyer invitations and submitted inspector QC restore through kaarigarlink.demo-data.v1 envelope v2 with existing v1 support. QC drafts are not exposed.

Existing reset controls on Buyer orders, Inspector dashboard and Admin dashboard restore the same canonical seed for all roles and invalidate shared queries. Workshop query keys include actor ID; identity changes use existing query-cache clearing. No standalone storage key is read, written, imported or cleared.

Malformed saved data follows the existing visible warning/seed recovery and blocks writes until shared reset. Workshop reads show safe canonical seed data with that warning. Broken owned references fail explicitly instead of producing mixed or fabricated data. Existing single-browser-tab synchronization limits remain.

## Actual verification

| Command/check | Result |
| --- | --- |
| npm.cmd run typecheck | PASS, exit 0; strict settings unchanged |
| npm.cmd run lint | PASS, exit 0; zero warnings |
| npm.cmd test -- --maxWorkers=2 | PASS, exit 0; 23 files / 315 tests; final run 55.33 seconds |
| npm.cmd run build | PASS, exit 0; Vite 7.3.8, 1,819 modules; final Vite build 4.68 seconds, no warnings |
| npm.cmd run test:e2e -- --workers=2 --output=<new absolute temporary path> | PASS, exit 0; all 50 Chromium tests, 2.8 minutes; original 45 plus five new cases |
| Focused corrected detail/mobile browser cases | PASS; 2/2, 26.7 seconds |
| Protected files/history/backend and staged diff | PASS; backend and protected files unchanged, all pre-existing paths retained, branch references/history unchanged and zero staged files |

The 276-case unit baseline is retained, with 26 new service cases and 13 new shared-data UI cases. All original Phase 0-6 tests are unchanged. The Phase 8B.1 legacy-name assertion now checks the exact standalone names: the valid canonical profile Sahyadri Precision Works contains the substring Precision Works, so the prior substring assertion would incorrectly reject legitimate shared data. Its exclusion intent and all 40 routing/role/storage cases remain.

Service/UI coverage includes all four workshop owners, identity independent of labels/order, cross-workshop details, missing/ambiguous mappings, broken references, invitation/job and quote/order joins, source-derived metrics, detached projections, no mutation methods, draft/attachment privacy, separate QC/payment/lifecycle presentation, persistence/reload/reset, malformed storage, disabled actions, supported profile/capacity/account data, loading/error/retry and private record masking.

Five new Chromium cases extend the 45-case baseline. They verify buyer -> addressed workshop invitation persistence and isolation, Admin reset -> all-role seed consistency, Inspector draft exclusion then submitted QC visibility without lifecycle/payment changes, malformed storage recovery through existing controls, and all eight workshop screens at desktop/mobile widths. Existing baseline cases still cover all roles, mobile/keyboard navigation, guarded routes and legacy storage isolation.

Build sizes: main 301.61 kB / gzip 93.95 kB; lazy WorkshopPage 15.37 kB / gzip 4.57 kB; React runtime unchanged 222.24 kB / gzip 69.18 kB; CSS 31.10 kB / gzip 6.77 kB. No chunk warning.

Initial findings were corrected rather than hidden: new view optional-status props and an unused import; a new test using matches instead of the existing results property; a loading assertion that observed shared session restoration before workspace loading; and a Chromium locator that matched both invitation-list and quote job titles before the detail render. First full Chromium run: 49 passed / one new locator failure. The corrected test waits for the detail heading and asserts the actual job definition field. Screenshot review identified an overly narrow mobile search input; filters now stack on mobile with a >300px input-width assertion at 390px.

No tests were deleted/skipped, strictness weakened, domain casts introduced or assertions relaxed to bypass an application failure. Browser NO_COLOR/FORCE_COLOR notices were benign.

## Desktop/mobile review

All 16 captures from the passing final-layout focused gallery were opened and reviewed. Shared shell/tokens, data layout, disabled controls, text wrapping, capacity, milestone/QC details and mobile filters were checked. Tables retain labelled, keyboard-focusable internal horizontal scrolling. The full baseline also exercises widths 320/390/768/1024/1440. This is not a final premium redesign or a full accessibility audit.

- [phase-8b2-dashboard-1440](evidence/phase-8b2-dashboard-1440.png)
- [phase-8b2-dashboard-390](evidence/phase-8b2-dashboard-390.png)
- [phase-8b2-invitation-detail-1440](evidence/phase-8b2-invitation-detail-1440.png)
- [phase-8b2-invitation-detail-390](evidence/phase-8b2-invitation-detail-390.png)
- [phase-8b2-invitations-1440](evidence/phase-8b2-invitations-1440.png)
- [phase-8b2-invitations-390](evidence/phase-8b2-invitations-390.png)
- [phase-8b2-onboarding-1440](evidence/phase-8b2-onboarding-1440.png)
- [phase-8b2-onboarding-390](evidence/phase-8b2-onboarding-390.png)
- [phase-8b2-order-detail-1440](evidence/phase-8b2-order-detail-1440.png)
- [phase-8b2-order-detail-390](evidence/phase-8b2-order-detail-390.png)
- [phase-8b2-orders-1440](evidence/phase-8b2-orders-1440.png)
- [phase-8b2-orders-390](evidence/phase-8b2-orders-390.png)
- [phase-8b2-profile-1440](evidence/phase-8b2-profile-1440.png)
- [phase-8b2-profile-390](evidence/phase-8b2-profile-390.png)
- [phase-8b2-settings-1440](evidence/phase-8b2-settings-1440.png)
- [phase-8b2-settings-390](evidence/phase-8b2-settings-390.png)

Final full browser artifacts:
C:/Users/Luzain Sara/AppData/Local/Temp/kaarigarlink-phase8b2-final-82756ffa8b084f0d9e7651b3dd6a811a

Reviewed/preserved gallery source:
C:/Users/Luzain Sara/AppData/Local/Temp/kaarigarlink-phase8b2-focused-f2f01473adde4efea95067b63ae7f772

Historical Phase 8B.1 evidence remains unchanged.

## Files and Git status

Changed from the preserved Phase 8B.1 working baseline (9 files):

```text
README.md
docs/contracts.md
docs/member-3-handoff.md
frontend/src/app/router.tsx
frontend/src/services/contracts.ts
frontend/src/services/adapters/mock.ts
frontend/src/features/workshop/README.md
frontend/src/features/workshop/Workshop.test.tsx
frontend/src/features/workshop/WorkshopPage.tsx
```

Added in this phase (25 files, including 16 reviewed captures):

```text
docs/phase-8b2-verification.md
docs/phase-8b2-workshop-contracts.md
docs/evidence/phase-8b2-dashboard-1440.png
docs/evidence/phase-8b2-dashboard-390.png
docs/evidence/phase-8b2-invitation-detail-1440.png
docs/evidence/phase-8b2-invitation-detail-390.png
docs/evidence/phase-8b2-invitations-1440.png
docs/evidence/phase-8b2-invitations-390.png
docs/evidence/phase-8b2-onboarding-1440.png
docs/evidence/phase-8b2-onboarding-390.png
docs/evidence/phase-8b2-order-detail-1440.png
docs/evidence/phase-8b2-order-detail-390.png
docs/evidence/phase-8b2-orders-1440.png
docs/evidence/phase-8b2-orders-390.png
docs/evidence/phase-8b2-profile-1440.png
docs/evidence/phase-8b2-profile-390.png
docs/evidence/phase-8b2-settings-1440.png
docs/evidence/phase-8b2-settings-390.png
frontend/e2e/workshop-shared.spec.ts
frontend/src/features/workshop/queries.ts
frontend/src/features/workshop/WorkshopRecords.tsx
frontend/src/features/workshop/WorkshopShared.test.tsx
frontend/src/services/workshop.test.ts
frontend/src/services/workshop.ts
frontend/src/services/adapters/mockWorkshop.ts
```

Cumulative status includes preserved Phase 8B.1 changes: 19 modified tracked files and 34 untracked files; zero staged.

```text
 M README.md
 M docs/contracts.md
 M docs/member-3-handoff.md
 M frontend/src/App.tsx
 M frontend/src/app/AppShell.tsx
 M frontend/src/app/roles.ts
 M frontend/src/app/router.tsx
 M frontend/src/components/auth/RequireAuth.tsx
 M frontend/src/components/layout/AppShell.tsx
 M frontend/src/components/quotes/QuoteHistory.tsx
 M frontend/src/components/quotes/QuoteSubmissionForm.tsx
 M frontend/src/pages/auth/LoginPage.tsx
 M frontend/src/pages/auth/WorkshopOnboardingPage.tsx
 M frontend/src/pages/workshop/DashboardPage.tsx
 M frontend/src/pages/workshop/InvitationsPage.tsx
 M frontend/src/pages/workshop/OrdersPage.tsx
 M frontend/src/routes/AppRoutes.tsx
 M frontend/src/services/adapters/mock.ts
 M frontend/src/services/contracts.ts
?? docs/evidence/phase-8b1-dashboard-1440.png
?? docs/evidence/phase-8b1-dashboard-390.png
?? docs/evidence/phase-8b1-invitations-1440.png
?? docs/evidence/phase-8b1-invitations-390.png
?? docs/evidence/phase-8b2-dashboard-1440.png
?? docs/evidence/phase-8b2-dashboard-390.png
?? docs/evidence/phase-8b2-invitation-detail-1440.png
?? docs/evidence/phase-8b2-invitation-detail-390.png
?? docs/evidence/phase-8b2-invitations-1440.png
?? docs/evidence/phase-8b2-invitations-390.png
?? docs/evidence/phase-8b2-onboarding-1440.png
?? docs/evidence/phase-8b2-onboarding-390.png
?? docs/evidence/phase-8b2-order-detail-1440.png
?? docs/evidence/phase-8b2-order-detail-390.png
?? docs/evidence/phase-8b2-orders-1440.png
?? docs/evidence/phase-8b2-orders-390.png
?? docs/evidence/phase-8b2-profile-1440.png
?? docs/evidence/phase-8b2-profile-390.png
?? docs/evidence/phase-8b2-settings-1440.png
?? docs/evidence/phase-8b2-settings-390.png
?? docs/phase-8b1-verification.md
?? docs/phase-8b2-verification.md
?? docs/phase-8b2-workshop-contracts.md
?? frontend/e2e/workshop-shared.spec.ts
?? frontend/e2e/workshop.spec.ts
?? frontend/src/features/workshop/README.md
?? frontend/src/features/workshop/Workshop.test.tsx
?? frontend/src/features/workshop/WorkshopPage.tsx
?? frontend/src/features/workshop/WorkshopRecords.tsx
?? frontend/src/features/workshop/WorkshopShared.test.tsx
?? frontend/src/features/workshop/queries.ts
?? frontend/src/services/adapters/mockWorkshop.ts
?? frontend/src/services/workshop.test.ts
?? frontend/src/services/workshop.ts
```

No staging, commit, push, merge, reset or branch change occurred. Existing uncommitted Phase 8B.1 work remains present. Some of its workshop files were deliberately extended with shared reads; unrelated earlier compiler/navigation fixes remain unchanged.

Backend tree recorded before and after:
aa99d866532a2f424545e4e07451e72932996467

## Remaining Phase 8B.3 work

Agree and implement separately approved workshop business commands, trust-boundary validation, ownership on writes, concurrency/idempotency, quotation fields and production/QC/payment synchronization, plus cross-role command tests. Profile/onboarding/settings writes and any legacy-data migration require explicit compatible contracts. Keep buyer award disabled until its contract is approved.

Live backend integration/authorization, backend tests, cross-browser and assistive-technology audits, production security and final premium redesign are outside this phase. Mock actor-ID checks do not replace server authorization. No further phase is started; stop for review.

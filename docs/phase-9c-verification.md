# Phase 9C verification

## Scope and protected baseline

UI/UX work on the canonical Workshop, Inspector and Admin modules only. Buyer retains its verified header API, selectors and appearance through a shared WorkspaceHeader composition. Public landing page, services, domain contracts, mock store/fixtures, authentication, guards, router, dependencies and backend are unchanged.

Branch: `design/phase-9a-ampliflow`. Starting HEAD: `2d4fea58e5b965244640929be78d188785879de6`.
Backend tree: `aa99d866532a2f424545e4e07451e72932996467`.
Both original contributor commits (`d4d32f8`, `4b10f9c`) remain ancestors. No Git history operations, staging or commits are part of this phase.

## Route inventory

All existing routes remain registered in the canonical router and protected by the existing role guards.

| Workspace | Routes reviewed and captured |
| --- | --- |
| Workshop | `/workshop/dashboard`, `/workshop/invitations`, `/workshop/invitations/:invitationId`, `/workshop/orders`, `/workshop/orders/:orderId`, `/workshop/profile`, `/workshop/settings`, `/workshop/onboarding` |
| Inspector | `/inspector/dashboard`, `/inspector/inspections`, `/inspector/inspections/:inspectionId` in pending, rework and accepted states, `/inspector/rework`, `/inspector/history` |
| Admin | `/admin/dashboard`, list/detail pairs under `/admin/users`, `/admin/workshops`, `/admin/jobs`, `/admin/orders`, `/admin/quality` |

Workshop's existing `/workshop` alias remains unchanged. Dynamic records outside the authenticated owner's scope retain existing unavailable/access-restricted handling.

## Components and presentation

- New shared `WorkspaceHeader` promotes the existing Buyer header composition, reusing `PageHeader` and `SectionLabel`.
- New scoped `workspace.css` uses existing Inter/Geist Mono, cobalt, ink, slate and semantic tokens. No fonts, dependencies or token definitions changed.
- Reused StatCard, DataTable, StatusBadge, Button, Card, FilterPanel, form controls, feedback states, dialogs, shell/sidebar and canonical navigation.
- Workshop: owner-scoped response/quote counts, opportunity queue from service permission flags, QC attention links, dated submitted inspection activity, capability in briefs/tables, machinery/capacity sections and a compact workflow boundary. Existing quotation form gains hierarchy only.
- Inspector: linked priorities, native context/checklist/history anchors, separated proposed outcome, readable corrective actions and explicit immutable history.
- Admin: factual oversight statement, structured detail surfaces, searchable/sortable directories, expandable compact user/workshop cards and related record links. The complete tables remain available. Current bounded demo directories do not need extra pagination; no fake or disabled pagination was added.
- Mobile shell shows the role name without the redundant “workspace” suffix below 640px to keep navigation/avatar/logout on one row.

## Verification results

Added 9 unit/component cases and 33 Chromium cases without changing baseline tests.

| Command | Actual final result |
| --- | --- |
| `npm.cmd run typecheck` | PASS, exit 0 |
| `npm.cmd run lint` | PASS, exit 0; zero warnings allowed |
| `npm.cmd test -- --maxWorkers=1` | PASS: 402/402 tests, 29/29 files, 91.61s |
| `npm.cmd run build` | PASS, exit 0; includes a second typecheck, 1,834 transformed modules; Vite build 5.21s |
| `npm.cmd run test:e2e -- --workers=2 --output=<OS temp>/kaarigarlink-phase9c-final` | PASS, exit 0: 111/111 Chromium tests, 6.1 minutes |

The browser run emitted only the existing Node color-environment warning (`NO_COLOR`/`FORCE_COLOR`); it did not affect the exit status.

The unit command uses the existing script with one worker to avoid local resource contention. Chromium uses the existing development server with CI unset, as permitted by the existing Playwright configuration.

Earlier runs identified and corrected:

1. A new browser assertion matched both the QC validation summary and field alert; scoped it to the existing focusable summary.
2. Removing signed-in workshop identity copy broke 9 existing guard assertions; restored the identity inside the workflow status region.
3. A closed admin summary introduced a duplicate account heading during navigation; made its title a paragraph within the named article, retaining the detail page heading and all existing assertions.
4. A dashboard preview shared the Invitations destination heading, allowing an existing keyboard navigation assertion to resolve before navigation. Renamed the preview `Recent invitations` to distinguish it from the destination.
5. The first full Chromium run passed 110/111 cases. Workshop search measured exactly 300px at the existing 390px check, below its >300px assertion. Reduced mobile filter-panel inline padding from 16px to 12px, retaining the assertion. The unchanged focused Chromium case then passed (1/1, 15.5s). Final full rerun follows this spacing correction.

No assertions were weakened or tests removed.

## Responsive, accessibility and evidence review

The new browser cases fix the clock at 2026-11-19 for reproducible seeded dates; these are demo records, not live platform telemetry. The new route checks exercise 26 route/state combinations at 1440, 1024, 768, 375 and 320px. They verify headings, loaded fonts, page-level overflow, no runtime errors and unchanged business storage during read-only browsing.

Focused tests exercise keyboard mobile navigation/focus trapping/Escape return, reduced motion, cross-role rejection, quote validation/cancellation/confirmation, inspector anchor focus and invalid-decision focus, immutable accepted history, admin filtering/cards/related records, and buyer invitation → workshop response → quote creation without an order.

Dense tables, including the existing inline quotation editor, keep labelled keyboard-focusable horizontal scroll regions; page overflow is checked separately. Expandable admin user/workshop cards provide a compact alternative without removing table columns.

Desktop/mobile route screenshots and quote/proposed-rework/card states are captured by the new suite. Initial visual review covered all route groups and led to mobile top-bar, task badge alignment and dashboard hierarchy refinements. The final run generated 60 curated screenshots: desktop (1440px) and mobile (375px) for all 26 route/state combinations, plus quote creation/editing, proposed rework and expanded admin cards. Reviewed route overviews and full-size operational forms/details, then checked the corrected dashboard/header, filter spacing and card layouts. No page-level overflow or unreadable form layout remained in the tested widths. Tables intentionally scroll within their labelled regions. Raw test artifacts stay in the OS temp directory; only curated screenshots are added under `docs/evidence`.

## Preserved restrictions and remaining work

- Invitation responses never award jobs or create orders. Buyer award stays disabled pending an approved backend contract.
- Existing quotation permission, ownership, stale-term, duplicate, edit/withdraw and confirmation protections are retained.
- Workshop production/rework/payment/profile/account mutations remain disabled.
- Inspector alone retains authorized mock QC decisions; validation, drafts and immutable submitted history remain unchanged.
- Admin oversight stays read-only; no moderation, award, production, payment or QC powers added.
- No invented manufacturing measurements, certifications, utilization, timestamps or live-backend behavior.

Phase 9D remains unimplemented. A separately approved follow-up can cover final cross-role polish and release validation. Backend integration and blocked operations still require their approved contracts. Verification here covers Chromium, not Firefox/WebKit or a full screen-reader audit.

## Screenshot inventory

All files below are curated demo evidence from the final passing run; raw Playwright reports/traces remain outside the repository.

| Route or interaction state | Desktop | Mobile |
| --- | --- | --- |
| admin job detail | [1440px](evidence/phase-9c-admin-job-detail-1440.png) | [375px](evidence/phase-9c-admin-job-detail-375.png) |
| admin orders | [1440px](evidence/phase-9c-admin-orders-1440.png) | [375px](evidence/phase-9c-admin-orders-375.png) |
| admin quality detail | [1440px](evidence/phase-9c-admin-quality-detail-1440.png) | [375px](evidence/phase-9c-admin-quality-detail-375.png) |
| admin user detail | [1440px](evidence/phase-9c-admin-user-detail-1440.png) | [375px](evidence/phase-9c-admin-user-detail-375.png) |
| admin workshops | [1440px](evidence/phase-9c-admin-workshops-1440.png) | [375px](evidence/phase-9c-admin-workshops-375.png) |
| admin dashboard | [1440px](evidence/phase-9c-admin-dashboard-1440.png) | [375px](evidence/phase-9c-admin-dashboard-375.png) |
| admin order detail | [1440px](evidence/phase-9c-admin-order-detail-1440.png) | [375px](evidence/phase-9c-admin-order-detail-375.png) |
| admin compact directory | [1440px](evidence/phase-9c-admin-compact-directory-1440.png) | [375px](evidence/phase-9c-admin-compact-directory-375.png) |
| admin workshop detail | [1440px](evidence/phase-9c-admin-workshop-detail-1440.png) | [375px](evidence/phase-9c-admin-workshop-detail-375.png) |
| admin jobs | [1440px](evidence/phase-9c-admin-jobs-1440.png) | [375px](evidence/phase-9c-admin-jobs-375.png) |
| admin quality | [1440px](evidence/phase-9c-admin-quality-1440.png) | [375px](evidence/phase-9c-admin-quality-375.png) |
| admin users | [1440px](evidence/phase-9c-admin-users-1440.png) | [375px](evidence/phase-9c-admin-users-375.png) |
| inspector proposed rework | [1440px](evidence/phase-9c-inspector-proposed-rework-1440.png) | [375px](evidence/phase-9c-inspector-proposed-rework-375.png) |
| inspector dashboard | [1440px](evidence/phase-9c-inspector-dashboard-1440.png) | [375px](evidence/phase-9c-inspector-dashboard-375.png) |
| inspector pending detail | [1440px](evidence/phase-9c-inspector-pending-detail-1440.png) | [375px](evidence/phase-9c-inspector-pending-detail-375.png) |
| inspector accepted detail | [1440px](evidence/phase-9c-inspector-accepted-detail-1440.png) | [375px](evidence/phase-9c-inspector-accepted-detail-375.png) |
| inspector rework | [1440px](evidence/phase-9c-inspector-rework-1440.png) | [375px](evidence/phase-9c-inspector-rework-375.png) |
| inspector history | [1440px](evidence/phase-9c-inspector-history-1440.png) | [375px](evidence/phase-9c-inspector-history-375.png) |
| inspector assignments | [1440px](evidence/phase-9c-inspector-assignments-1440.png) | [375px](evidence/phase-9c-inspector-assignments-375.png) |
| inspector rework detail | [1440px](evidence/phase-9c-inspector-rework-detail-1440.png) | [375px](evidence/phase-9c-inspector-rework-detail-375.png) |
| workshop quote create | [1440px](evidence/phase-9c-workshop-quote-create-1440.png) | [375px](evidence/phase-9c-workshop-quote-create-375.png) |
| workshop onboarding | [1440px](evidence/phase-9c-workshop-onboarding-1440.png) | [375px](evidence/phase-9c-workshop-onboarding-375.png) |
| workshop orders | [1440px](evidence/phase-9c-workshop-orders-1440.png) | [375px](evidence/phase-9c-workshop-orders-375.png) |
| workshop quote editor | [1440px](evidence/phase-9c-workshop-quote-editor-1440.png) | [375px](evidence/phase-9c-workshop-quote-editor-375.png) |
| workshop invitation detail | [1440px](evidence/phase-9c-workshop-invitation-detail-1440.png) | [375px](evidence/phase-9c-workshop-invitation-detail-375.png) |
| workshop settings | [1440px](evidence/phase-9c-workshop-settings-1440.png) | [375px](evidence/phase-9c-workshop-settings-375.png) |
| workshop dashboard | [1440px](evidence/phase-9c-workshop-dashboard-1440.png) | [375px](evidence/phase-9c-workshop-dashboard-375.png) |
| workshop invitations | [1440px](evidence/phase-9c-workshop-invitations-1440.png) | [375px](evidence/phase-9c-workshop-invitations-375.png) |
| workshop order detail | [1440px](evidence/phase-9c-workshop-order-detail-1440.png) | [375px](evidence/phase-9c-workshop-order-detail-375.png) |
| workshop profile | [1440px](evidence/phase-9c-workshop-profile-1440.png) | [375px](evidence/phase-9c-workshop-profile-375.png) |

## Final repository checks

- Branch remains `design/phase-9a-ampliflow`.
- HEAD remains `2d4fea58e5b965244640929be78d188785879de6`; no commit, push, merge or branch switch.
- Backend HEAD tree is exactly `aa99d866532a2f424545e4e07451e72932996467`; no tracked changes or untracked backend files.
- `d4d32f8` and `4b10f9c` are both ancestors (Git ancestry checks returned 0).
- Services, shared types, mock store/fixtures, auth, canonical router/roles, public landing page and package/lock files have no changes.
- Existing test files are unchanged. Only the two focused test files below were added.
- `git diff --check` passes. Pending text files were scanned for private-key headers and common credential-token patterns; no matches. Pending paths contain no cache, generated build/report directories or local environment files.
- Nothing is staged. Working tree intentionally contains 14 modified tracked files and 66 untracked files: 60 curated screenshots plus 6 source/test/documentation files. Build output is ignored; raw test artifacts are outside the repository.
- Screenshot evidence totals 11,978,421 bytes (about 11.4 MiB).

Modified tracked files:

- `frontend/src/app/AppShell.tsx`
- `frontend/src/features/admin/AdminDashboard.tsx`
- `frontend/src/features/admin/AdminDetailPage.tsx`
- `frontend/src/features/admin/AdminListPage.tsx`
- `frontend/src/features/admin/OperationalAlerts.tsx`
- `frontend/src/features/buyer/BuyerHeader.tsx`
- `frontend/src/features/inspector/InspectionDetailPage.tsx`
- `frontend/src/features/inspector/InspectionHistory.tsx`
- `frontend/src/features/inspector/InspectionsPage.tsx`
- `frontend/src/features/inspector/InspectorDashboard.tsx`
- `frontend/src/features/inspector/QCChecklist.tsx`
- `frontend/src/features/workshop/WorkshopActions.tsx`
- `frontend/src/features/workshop/WorkshopPage.tsx`
- `frontend/src/features/workshop/WorkshopRecords.tsx`

New source/test/documentation files:

- `docs/phase-9c-role-design.md`
- `docs/phase-9c-verification.md`
- `frontend/e2e/role-design.spec.ts`
- `frontend/src/app/RoleDesign.test.tsx`
- `frontend/src/components/WorkspaceHeader.tsx`
- `frontend/src/components/workspace.css`

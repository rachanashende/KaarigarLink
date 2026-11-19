# Member 3 workshop handoff

Member 3 exclusively owns frontend/src/features/workshop/. That directory remains absent: no workshop-specific files have been created or modified.

## Central integration point

src/app/router.tsx registers each role namespace from src/app/roles.ts. /workshop/dashboard currently renders the shared RoleLandingPage inside RequireSession → AppShell → RequireRole(workshop).

When ready, export a workshop route module from your feature directory and register its child routes under the existing workshop branch in router.tsx. Replace its dashboard child with your dashboard. Keep the shared shell, session guard and workshop role guard; do not add a competing BrowserRouter, QueryClientProvider or AuthProvider. Coordinate a single router edit with Member 4; all workshop route registration stays centralized.

The same-role /workshop/* catch-all shows 404 until actual screens are registered; another role entering any /workshop/* path sees Access restricted. No onboarding, profile, invitation, quote or milestone screens are implemented.

## Shared imports

```tsx
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import type { Workshop, Quote, Order } from '@/types';
```

useServices() returns the one provider-owned DataService. Use it with TanStack Query; do not instantiate stores in pages or import fixtures into components. useAuth() exposes user and asynchronous signIn/demoSignIn/signOut. Normal logout is already implemented in the topbar.

Shared primitives include PageHeader, StatCard, StatusBadge, DataTable, EmptyState, ErrorState, LoadingState, UnauthorizedState and ConfirmationDialog. Dialog uses native modal semantics with explicit Tab wrapping, Escape, focus restoration and scroll locking. ConfirmationDialog accepts controlled open/onOpenChange, title, description, confirmLabel/onConfirm, optional busy and error. Use busy to prevent duplicate confirmations.

Keep the existing palette, typography, card spacing and control sizing. Add workshop navigation entries centrally when their pages exist; do not ship dead links.

## Demo identity and contracts

Select Workshop on /login or use workshop@kaarigarlink.example / DemoPass123!. User ID: workshop-user-1; workshop ID: workshop-1. These are public demo credentials.

The foundation DataService.list interface remains unchanged. Phase 2 adds a buyer namespace for buyer-owned reads and job creation; workshop commands remain reserved for Member 3. Add approved workshop domain commands to shared interfaces and adapters with coordinated validation/tests. Do not mutate the store from components. Existing domain entities and transition vocabulary are unchanged; no workflow transitions have been approved. Mock business data resets on reload, while mock identity persists in this tab's sessionStorage for restoration within 8 hours. Backend authentication and authorization remain required.

## Phase 2 integration impact

The workshop route branch, placeholder, directory, identity and workshop-related types remain unchanged. Buyer routes are centralized beside the existing role branches, and only buyer pages are lazy-loaded. No workshop feature module has been created.

Job now has optional createdAt; existing workshop job consumers remain compatible. Keep unknown timestamps unknown rather than inventing dates. Existing processes/specification/location/designFiles fields are reused. DataService.buyer is additive to the existing list API; use the shared mock factory rather than implementing partial service objects. Four demo buyer jobs and posting audit events now share the same store; new jobs become visible to list readers immediately. Matching/quotes/orders are not populated by buyer posting, and no award or workflow transition is executed.

The Phase 2 buyer APIs accept actor IDs for mock scoping only; real backend authorization is still required. See contracts.md for required sign-off decisions.
## Phase 3 invitation and quote integration

Workshop feature files/routes are still untouched. Buyer matching/quote pages are centralized under /buyer/jobs/:id/matches and /quotes. The shared entity types are unchanged.

DataService.buyer now reads match/quote workspaces and creates invitations. Invitations use existing PENDING/ACCEPTED/DECLINED values and the jobId/workshopId pair. Duplicate sends return the same record; declined invitations are not reopened. Workshop response/quotation submission methods remain yours to implement with approved backend contracts.

The original workshop identity remains workshop-user-1 / workshop-1. Extra synthetic workshop accounts use pragati@kaarigarlink.example, deccan@kaarigarlink.example and vishwakarma@kaarigarlink.example with the same public demo password. The Workshop role shortcut still opens the original account. Job-1 has an eligible uninvited Deccan Toolcraft match so buyers can exercise a new PENDING invitation; the resulting record is visible through the same .list('invitations') store read.

No quote is generated when inviting, and no order is generated when reviewing an award. All historical quotes/invitations are fixed shared fixtures. There is no buyer-side quotation submission and no workshop acceptance/decline UI. Member 1 must approve invite rules; Member 2's absent award contract remains an explicit blocker. Do not infer transitions from the review buttons.


## Phase 4 tracking integration (current)

Your feature directory remains absent and untouched; workshop dashboard registration/placeholder and original identity remain unchanged. Buyer navigation adds Manufacturing orders only; no workshop navigation or screens were added.

Optional display fields Order.createdAt and Milestone.description/notes are backward compatible. Existing Job/Quote/Review fields and all status unions are preserved. Six historical orders belong to buyer-1/workshop-1 with separate job-order-* and quote-order-* IDs; they are read-only seeded snapshots, never buyer-created awards. Orders and the top-level milestone collection contain matching data.

Use provider-owned services and coordinate approved workshop commands at the shared service boundary. Update embedded/top-level milestones together. Buyers cannot edit milestones or make QC/rework decisions. Inspection records have no timestamp ordering; latest summary is order.qcStatus.

The original in-memory reset behavior still applies to production demo builds and isolated test factories. Development now persists only jobs (without attachment metadata), invitations, reviews and audit events under kaarigarlink.demo-data.v1. Workshop profile/quote/order/milestone/QC changes are not persisted by this envelope. Coordinate a validated versioned extension when adding your mutations; do not assume generic commit persists every collection. One active browser tab is supported.

Buyer → Manufacturing orders → Reset demo data confirms an all-role business reset and retains login. Invalid saved data warns and blocks writes until reset. Storage write failures leave memory unchanged. This is development demo infrastructure, not backend authorization/concurrency.

Buyer reviews use a labelled provisional CLOSED-only policy and do not update workshop aggregate ratings. Award order remains disabled pending Member 1/2 sign-off. See phase-4-contracts.md; no team approval is implied.

## Phase 5 inspector integration (current)

Workshop feature directory/route branch/identity remain untouched. Inspector UI is confined to src/features/inspector; shared router/shell gains inspector-only navigation and lazy routes. No workshop corrective-work, QC submission, milestone completion or reinspection operation is implemented.

Inspection has optional checklist, draft, history, dueOn, assignedAt and updatedAt. Human findings use UNRECORDED/PASS/FAIL/NOT_APPLICABLE; these are checklist results, separate from Inspection.decision and Order.status. Shared entities and existing state spellings are preserved. DataService adds an inspector namespace; future concrete service adapters must provide these methods or an explicit unsupported implementation.

Provisional mock decisions update only Inspection/history plus Order.qcStatus. Order.status, milestones, jobs, quotes and payments remain unchanged. A submitted assignment cannot be reopened or overwritten. Reinspection is pending backend capability: coordinate with Member 2 before creating a new round or completing rework. The new overdue seed uses inspection-overdue/order-production with QC REWORK while production remains IN_PRODUCTION; these are explicitly separate state dimensions.

The same development persistence key now writes envelope version 2 and restores Phase 4 version 1 data. Inspector drafts/history and derived QC summaries restore atomically; evidence/attachment metadata and credentials are excluded. Draft evidence must be reattached after reload. Workshop changes are still outside the persistence allowlist; coordinate a versioned extension rather than assuming generic commit persists everything.

Reset is available on Inspector dashboard and Buyer orders, restores all-role business/QC seed state and retains login. Buyer responses omit draft findings and show submitted QC notes/deadlines only. See phase-5-qc-contracts.md for validation, conflicts, ownership and outstanding policy decisions. No backend approval is implied.

## Phase 6 admin oversight (current)

Workshop feature directory/routes/identity remain untouched. New Admin UI under features/admin reads the existing shared workshop profiles, per-slot capacity, supplied rating, matching/invitation/quotation activity and related orders. It does not verify, suspend, edit or submit work for a workshop.

DataService adds read-only admin.getOverview(actorId), guarded by canonical admin role. All shared entities/enums and existing persistence version/key are unchanged. Admin responses omit exact addresses/coordinates, attachment metadata and private QC drafts. Inspector decisions and buyer actions still use their existing services; Admin only observes submitted shared state. No QC logic or workshop milestone ownership changes.

Use the shared service factory when composing test/demo services. Future concrete adapters must provide the admin namespace or explicitly reject it; agree server-side access/pagination and field permissions with Members 1/2. Do not infer a moderation or lifecycle transition from an admin reporting group or alert. Existing demo reset now also appears on Admin dashboard and resets all-role demo state after confirmation.

## Phase 8B.1 routing foundation (current integration branch)

The earlier absent-directory/placeholder statements above describe their original phases. features/workshop now contains WorkshopPage, routing/guard tests and its boundary README. Member 3 implementation source remains in its structurally merged locations for coordinated reconciliation; it has not been replaced or deleted.

Canonical workshop dashboard/list/detail/profile/settings/onboarding paths are registered in app/router.tsx under the existing session/shell/workshop guard. app/roles.ts owns workshopNavigation, shared by the shell and page links. /workshop redirects to the retained /workshop/dashboard landing route. Each workspace is explicitly disabled; no separate workshop store or provider is mounted and no standalone records are shown. Authentication/logout remains shared. Onboarding is guarded and cannot save a registration/draft yet.

Legacy imports compile using installed react-router; standalone navigation links use /workshop paths. Legacy App.css/index.css stay outside the active import graph. Do not mount the standalone App, shell, DemoAuthProvider or WorkshopDataProvider to enable the pages.

Phase 8B.2 needs a scoped shared workshop service, canonical owner identity, agreed typed projections and query/persistence integration. Phase 8B.3 needs separately approved invitation/quotation/production/QC/payment commands and cross-role tests. Do not cast standalone types to shared entities, create orders from invitation response, bypass buyer award or inspector QC, set payment paid, or edit another workshop's records. Backend/service sign-off remains outstanding. No new workflow command or shared contract change is introduced in Phase 8B.1.

## Phase 8B.2 shared reads (current)

This supersedes the Phase 8B.1 data-unavailable state. The existing guarded WorkshopPage now loads WorkshopRecords using a user-keyed query and DataService.workshop, over the same mock store as Buyer/Inspector/Admin. It shows actual own invitations/jobs/quotes/orders/milestones/submitted QC/rework/payment simulation/profile/capacity/account records. Exact User.id -> Workshop.ownerId resolves ownership; canonical invitation IDs now name the invitation-detail route parameter. No standalone data or mutation handler is activated.

All workshop business actions and buyer award remain disabled. Existing shared persistence/reset is reused unchanged; workshop reads perform no storage write. Legacy source stays available for coordinated reconciliation. See phase-8b2-workshop-contracts.md for explicit domain mappings, read projections and unsupported fields. Phase 8B.3 must agree and test approved workflow commands before enabling any write.

## Phase 8B.3 supported local commands (current)

This supersedes the all-writes-disabled notes for invitation responses and quotation terms only. Active WorkshopActions uses DataService.workshop over the canonical store, existing authentication and role guard. Member 3 can compose the existing scoped selectors and respondToInvitation/submitQuote/editQuote/withdrawQuote methods; do not mount standalone providers or handlers. All methods independently enforce exact owner mapping and latest state. Read projections supply actions/reasons for UI availability; confirmation and failure feedback use the shared components.

Canonical quote terms are amount (INR total), estimatedDelivery (ISO date) and notes. expected terms are mandatory for edit/withdraw. No standalone duration/cost fields or casts are accepted. Shared persistence v3 extends the same key, restores v1/v2, and keeps identity/attachments out. Cache invalidation refreshes all roles after commands; auth changes still clear the query cache.

Production, milestones, rework/QC submission, payment/closure, profile/settings and onboarding commands remain disabled. Backend profile endpoints need an explicit revision/verification/structured-field adapter before use. Buyer award remains disabled. Invitation acceptance creates no order or quote. Matching for newly posted jobs still needs real supplied MatchResult data; the browser demonstration uses the existing eligible job. See phase-8b3-contract-matrix.md and phase-8b3-verification.md before enabling further commands.

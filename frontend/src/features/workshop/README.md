# Workshop integration foundation (Phase 8B.1)

The active WorkshopPage registers guarded, disabled workspaces for dashboard, invitations/details, orders/details, profile, settings and onboarding through app/router.tsx. /workshop redirects to the retained /workshop/dashboard landing page. All pages use the existing AppShell, shared AuthProvider and application service/query providers.

No independent workshop data provider, session, login, logout, router or CSS is mounted by these routes. No legacy localStorage keys are read, migrated or written. Disabled views deliberately show no standalone records: those records lack shared workshop ownership and compatible job/quote/order contracts.

Member 3 source remains under pages/, context/, components/, services/ and types/. Its router imports and links compile against the existing react-router dependency and canonical /workshop paths. The old src/App.tsx entry, standalone shell/auth/providers and CSS remain inactive reference source for the next integration phase; src/main.tsx still mounts app/App.tsx.

Styling uses existing shared components and Tailwind tokens only. App.css and index.css are not imported into the active route graph, so their global selectors/tokens cannot affect Buyer, Inspector, Admin or Workshop. No premium redesign was performed.

Phase 8B.2 must coordinate a scoped workshop service, canonical user/profile ownership, shared entity mappings, query invalidation and validated persistence. Phase 8B.3 must reconcile approved business commands and cross-role workflows. Invitation response must not create orders; award stays buyer-owned and disabled pending approval. Workshop actions must not bypass QC, set payments paid or edit another workshop's records. Existing standalone mutation handlers must remain inactive until replaced/reconciled and tested.

## Phase 8B.2 shared records (current)

This section supersedes the routing-only data-unavailable statements above. WorkshopPage keeps the same session/shell/role guard and disabled action panel, but now loads canonical records through queries.ts -> DataService.workshop. WorkshopRecords provides read-only metric cards, searchable invitation/order tables, own quote history, detail briefs, milestones, submitted QC/rework, profile/capacity, settings account information and onboarding linkage.

The service resolves exact User.id/Workshop.ownerId, returns only owned joins, rejects ambiguous/broken references and masks private/missing detail IDs alike. No profile produces an onboarding-required state. No unsafe casts, standalone provider, local identity or legacy storage migration is used. Query keys include the actor ID; shared reset and persistence remain the only dataset mechanism.

All writes remain disabled. Source mappings and service/privacy boundaries are documented in repository-root docs/phase-8b2-workshop-contracts.md. Existing shared tokens/components are reused without a redesign.

# Buyer frontend — Member 4

Phase 4 adds OrdersListPage, OrderDetailPage, MilestoneTimeline, OrderProgress, OrderBadge, OrderReview and DemoDataNotice alongside earlier buyer job/marketplace screens.

Routes are centrally registered in src/app/router.tsx. Query hooks in queries.ts call the provider-owned buyer service namespace. No fixtures/store mutations live in components.

Orders and QC are read-only historical snapshots. Progress derives from completed milestones. CLOSED-only, once-per-order review submission is an explicit provisional mock policy. Award execution remains disabled. Reset is confirmed from the orders list.

See docs/phase-4-contracts.md and docs/phase-4-verification.md at repository root. Workshop features belong exclusively to Member 3; inspector/admin operations remain future phases.

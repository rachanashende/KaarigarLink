# Admin oversight — Member 4, Phase 6

AdminDashboard, AdminListPage and AdminDetailPage load lazily through the existing guarded router. Five directory/detail types reuse AdminTables, OperationalAlerts and a scoped useAdminOverview query.

DataService.admin.getOverview enforces admin role and returns minimized read-only projections of the existing store. Pages never use unrestricted list() or import fixtures. All account/moderation/verification/order/QC/payment mutations are absent. The shared confirmed demo reset remains a recovery tool.

model.ts derives metrics, search/filter/sort and deterministic date-based demo alerts; no notifications/polling or revenue/utilization estimates are generated. Draft QC/evidence metadata and credential fields are excluded at the service boundary.

No seed/entity/persistence or inspector decision changes. See docs/phase-6-admin-contracts.md and phase-6-verification.md at repository root. Stop at Phase 6.

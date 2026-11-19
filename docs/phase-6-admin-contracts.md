# Phase 6 admin oversight — provisional contracts

Status: **mock-only, backend sign-off pending**. No HTTP endpoints, account/verification commands or workflow transitions are approved or implemented.

## Read capability and authorization

DataService.admin exposes one method:

```ts
interface AdminService {
  getOverview(adminId: string): Promise<AdminOverview>;
}
```

AdminOverview contains operational projections of users, workshops, jobs, orders, inspections, matches, invitations, quotes and activity. It reuses existing entity shapes. No entity/status/Collections field changes are required.

The mock service resolves the actor against the canonical shared user collection before projecting data. Unknown actor gives UNAUTHORIZED; a non-admin role gives FORBIDDEN. Related resource references are checked; broken joins produce SERVER rather than fabricated names/records. Missing record IDs in a valid snapshot show the established unavailable view. All admin list/detail routes remain inside the existing admin role guard.

Admin may read platform-wide operational records; buyer/inspector ownership restrictions in their own namespaces are unchanged. There is no admin mutation method. Returned data is detached from the store; changing a response cannot modify business state. Refresh performs a read.

Caller-supplied actor IDs/mock auth are public demonstration checks, not production security. Member 1/2 must approve actual authenticated identity, admin entitlements, field-level access, pagination and server-side read authorization.

## Minimized projections

Only explicit existing operational fields are returned; unknown runtime properties are not copied:
- User: id/name/email/role only.
- Workshop: identity/owner, city/state, capabilities, machines, per-slot capacity and supplied rating.
- Job: identity/buyer, manufacturing brief, quantities/processes, city/state, deadline/status and supplied optional date/budget.
- Order: existing references, status/QC summary, optional creation date and milestone display data.
- Inspection: assignment/references, current submitted status/notes/dates, supplied checklist and submitted decision history.
- Matching/quotation/invitation/audit: known operational fields and references.

Passwords/hashes/tokens/unknown secret fields, exact addresses, coordinates, design/evidence metadata and private draft findings are excluded. Required evidence/designFiles arrays are projected empty to retain existing shared entity shapes; this does not claim evidence never existed. Submitted notes/requirements are operationally visible to this provisional admin role; real field-access policy needs approval. Use synthetic input only.

Account status, registration date and workshop verification state are absent from current types. The UI identifies them as unavailable; it does not invent states or offer unsupported filters/actions.

## Snapshot size and detail views

One bounded mock snapshot supports the current small demo (seven users, four workshops, ten jobs, six orders, five assignments). Lists filter/sort locally; details resolve the requested ID and related records from this same snapshot. This keeps admin, buyer and inspector data consistent without a second source.

This method is an adapter/read-model contract, not a proposed get-all production endpoint. Backend integration must agree paged/searchable resource reads, dashboard aggregation and detail APIs before scaling. No production get-all architecture or transport is implied. Future DataService implementations must supply the new admin namespace or explicitly reject it.

## Aggregation definitions

- Total users: user records across all roles.
- Buyers: role buyer.
- Workshops: workshop profiles, not workshop-user count.
- Active jobs: POSTED/QUOTING/AWARDED display grouping, consistent with buyer grouping.
- Active orders: all except CLOSED/CANCELLED; this is a reporting group, not permission to transition states.
- Pending inspections: inspection.decision PENDING.
- Open rework: inspection.decision REWORK, which has no completion command in the existing contracts.
- Marketplace activity: supplied match count, stored invitation count and SUBMITTED quote count.
- Job activity: matching/invitation/quote records for that job.
- Workshop activity: orders/quotations/invitations referencing that workshop; related jobs are the unique union of matches, invitations, quotes and orders.
- Order value/delivery: its referenced quote's INR major-unit amount and estimatedDelivery. No quantity multiplication, settlement, revenue or commission calculation.
- Production progress: rounded completed milestone count / total × 100; empty plans remain unknown, consistent with buyer tracking.
- QC status/history: the existing shared inspection/order summary and immutable submitted records. Drafts stay excluded.

Sorts use provided names/creation dates/deadlines; unknown dates stay last. QC deadline sorting uses reworkDeadline for rework cases and dueOn otherwise. No registration date, verification score, utilization, conversion/revenue or payment total is fabricated.

## Demo operational alert rules

Pure local derivation with an explicit India calendar date; stable IDs and deterministic severity/ID ordering:
- Active job deadline before today → Warning, link to job.
- Active order unfinished milestone due before today → Warning, link to order.
- Active order quote delivery commitment before today → Warning, link to order.
- Pending inspection on an active order past dueOn → High, link to inspection.
- REWORK on an active order past reworkDeadline → High; otherwise Warning follow-up, link to inspection.

Today is not overdue. Completed milestones and closed/cancelled order plans do not raise deadline alerts. Missing dates stay unknown; a rework case without a supplied deadline still gets a follow-up warning. Workshop attention is the subset of workshops referenced by these operational alerts.

The UI labels these Demo operational alerts and exposes the relevant record. They are computed on render from the loaded snapshot; no alert is persisted, delivered or polled in the background. Existing TanStack Query lifecycle behavior remains; Refresh data is explicit. This is not real-time monitoring.

## Persistence and reset

Admin adds no storage key, envelope version, seed record or mutation. Existing version 1/2 restoration, version 2 writes, draft/evidence exclusion and development-only persistence remain unchanged. Admin reads do not write storage. Reload reflects persisted buyer/inspector state; production mock builds remain memory-only.

The existing confirmed DemoDataNotice reset is reused on the admin dashboard. It is an all-role demo recovery tool, not an account/order moderation operation: restores common seed business state, invalidates queries and retains login. The same single-active-tab limitation remains.

## Unavailable actions and dependencies

No role change, account deletion/suspension, workshop verification/suspension, lifecycle override, award, QC decision/reassignment, payment, notification or background monitoring API exists in this namespace.

Member 1 must confirm identity/account/profile fields, matching/invitation visibility and administrative access rules. Member 2 must confirm order/QC/history/audit reads, policy/entitlements and any future moderation commands. Both must approve exact endpoints, pagination/filter/sort parameters, response schemas, date/money/null conventions and errors before Phase 7 integration.

Member 3's workshop feature directory/routes/identity are untouched. Workshop oversight consumes shared profile/capacity/activity records without editing them. Inspector QC command logic, buyer actions and shared persistence remain unchanged.

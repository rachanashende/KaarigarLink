# Phase 4 buyer tracking and reviews — provisional adapter contracts

Status: mock-only, not backend-approved. Member 2 owns orders, milestones, QC and review policy; Member 1 confirms Job/Quote references and authentication. No backend approval or team communication is claimed.

## Buyer adapter

BuyerService extends BuyerOrderService, alongside all earlier methods:
- listOrders(buyerId): Promise<BuyerOrderData[]>
- getOrder(buyerId, orderId): Promise<BuyerOrderData>
- submitReview(buyerId, orderId, ReviewInput): Promise<Review>

BuyerOrderData joins existing order/job/quote/workshop entities, related inspections, chronological order activity, an existing review or null, and canReview/reviewReason. No HTTP path/method/envelope is approved by these signatures. Actual authenticated identity must replace caller-supplied buyer IDs in the backend adapter.

Lists require a known buyer and return orders whose order.buyerId and related job.buyerId both match. Private/missing details and writes return NOT_FOUND. Missing user gives UNAUTHORIZED; wrong role FORBIDDEN; incomplete joins SERVER. Quote must belong to the same job and workshop. Pages never use unrestricted foundation list().

## Additive shared entity fields

Order.createdAt?: string is an optional ISO UTC timestamp.
Milestone.description?: string and notes?: string are optional display text.
Existing fields, status unions, Review and Job/Quote contracts are preserved. Missing timestamps/descriptions are explicitly unknown; no inspection ordering or timestamp is fabricated.

Milestone progress = rounded completed count / total count × 100, equal weights; no milestones = unknown. IN_PROGRESS contributes no partial credit because the contract supplies no partial percentage. Dates use Asia/Kolkata. Non-completed milestones with dueOn before today display Delayed, except on cancelled orders. Completion is independent of QC acceptance/payment/delivery. Stored order states and order.qcStatus are display snapshots, never a transition graph.

Order value and delivery commitment come from its historical awarded quotation. Amounts remain numeric INR major units, never quantity multiplied a second time. Backend must confirm quotation immutability or return an immutable order commercial snapshot.

Inspection records are shown as supplied; the order.qcStatus is the latest summary. No inspectedAt field or reliable inspection history ordering exists. Backend must supply timestamps/history semantics before calling a particular record the latest inspection.

## Explicit provisional review policy

Authorized by the Phase 4 request's mock-only fallback:
- Only CLOSED orders qualify, regardless of payment state or milestone completion.
- One review per order; existing reviews remain visible.
- Integer rating 1–5 and trimmed written feedback 10–2000 characters are required.
- Caller cannot set ID, buyer identity, order identity or lifecycle state through the review payload.
- Confirmation precedes submission; a ref lock covers fast double clicks.
- The shared store validates ownership, eligibility and duplicates again inside one atomic commit.
- Duplicate/ineligible submissions give CONFLICT; malformed input VALIDATION.
- Review plus MOCK_REVIEW_SUBMITTED audit event commit together. No order/job/quote/QC/payment mutation.
- Editing/deleting reviews, rating aggregation and moderation are not implemented.

Member 2 must approve actual eligibility, rating scale, text constraints, duplicate/idempotency behavior, edit policy and API errors. Member 1 must confirm actor/session transport. These rules provide a demonstrable UI and do not approve production behavior.

## Development-only persistence and reset

createServices('mock') uses localStorage only when import.meta.env.DEV and MODE !== test. Built production demos and default isolated unit-test factories remain memory-only. Real/invalid service modes still fail NOT_CONFIGURED before creating a mock store. No API failure falls back to fixtures.

Key: kaarigarlink.demo-data.v1. Envelope version 1 stores jobs (designFiles emptied), invitations, reviews and auditEvents. It does not store users, auth/session data, credentials, tokens, files, workshop profiles, orders, milestones, QC decisions or payments. Historical immutable data reloads from the seed. Only synthetic input belongs in this public demo.

Restore validates strict Zod shapes, bounds, IDs, reference existence and duplicate review/invitation pairs before use. Unknown versions/malformed records produce a visible warning on Manufacturing orders; original seed is shown for recovery, with mutations blocked until reset. This is explicit recovery, not mock fallback from a real API.

Persistence writes happen before publishing the store draft. Storage failures produce SERVER and leave memory unchanged. Reset removes only this key, restores the seed and invalidates shared queries; login/sessionStorage stays active. Confirmation warns that reset affects all demo roles. Attachment metadata remains in current memory until reset/reload and is never written to persistence.

Reset: Buyer → Manufacturing orders → Reset demo data → confirm. If browser policy prevents storage access entirely, allow site storage; alternatively clear this exact origin key in browser developer tools and reload. No generic clear-all-storage operation exists.

Known limit: one active demo tab is supported. Separate tabs do not synchronize in-memory caches or coordinate writes; last browser write wins. Upgrade to backend transactions/versioning for multi-user use. Future Member 3 mutable collections must explicitly join the validated persistence envelope in a versioned change; they are not silently persisted.

## Award and workflow boundaries

The Phase 3 Award review dialog remains available and its execution button remains disabled. There is no award/cancel/milestone/QC/payment command. Six historical order snapshots are seeded without executing or implying approved transitions. Cancellation is read-only history only.

See order-awarding-api-proposal.md for the still-pending award contract. Phase 4 read-only tracking is explicitly allowed independently of its approval.

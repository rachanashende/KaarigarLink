# Phase 8B.2 shared workshop read contracts

These are frontend mock read contracts, not approved HTTP endpoints or workshop mutation rules. Canonical domain entities/enums, fixtures, persistence envelope and authentication remain unchanged. DataService adds one required read-only workshop namespace; concrete adapters must supply it or reject unsupported reads explicitly.

## Ownership and selectors

Authenticated user IDs resolve against canonical users. Unknown actor -> UNAUTHORIZED; non-workshop role -> FORBIDDEN. Exactly one Workshop.ownerId must equal the authenticated user ID. No names, email patterns, array indices or standalone identities participate.

Zero matching profiles returns the own account plus profile:null and empty collections, displayed as profile/onboarding required. Multiple matching profiles -> CONFLICT. Duplicate canonical IDs or broken owned references -> SERVER, with no partial/mixed response.

- getWorkspace(actorId): own account/profile, joined invitations/jobs/buyer display names/own quotes, all own quotation history, assigned orders/commercial terms/milestones/submitted QC/payments, and derived dashboard summary.
- getInvitation(actorId, invitationId): owned invitation and its actual job, buyer display name and same-workshop/same-job quotes.
- getOrder(actorId, orderId): owned order, matching canonical quote/job/buyer, embedded milestone plan, submitted inspections/rework and payment simulation records.
- Missing and foreign detail IDs both return the same NOT_FOUND response. Unmapped accounts cannot use details to access another profile.
- Detail UI selects only from the already authorized workspace response. Direct detail service methods independently enforce the same scope.
- The canonical route parameter is invitationId (formerly the misleading jobId label); URL shape is unchanged. Links use Invitation.id, not Job.id.

Workshop query keys include the authenticated user ID. Shared authentication clears query state on identity changes; no new provider, browser identity or business store exists.

Actor IDs emulate ownership in mock mode. Real adapters must derive identity from authenticated backend sessions/JWTs and enforce authorization server-side; these reads are not production security.

## Read projection and source integrity

Each read starts from a defensive snapshot of the existing provider-owned store. Explicit known-field projections avoid leaking runtime credential/private properties. WorkshopJob omits designFiles; job locations expose city/state only. Buyer references expose ID and display name only. Workshop accounts expose their own canonical name/email/role/ID, and their own profile's supported fields.

Inspection drafts, evidence/attachment metadata and unknown runtime fields are never returned. Submitted history retains decision/actor/time, finding IDs/results/notes/summary and any recorded rework reason/corrective action/deadline. This is a typed read projection, not a conversion to standalone entities or a claim that attachments do not exist.

Owned references must join consistently: invitation/job, quote/job, order/job/buyer/quote/workshop, embedded milestone/order and inspection/order/inspector. Duplicate/ambiguous IDs fail explicitly. Unrelated workshops are never included as fallback data.

Embedded Order.milestones is the authoritative plan for these reads, matching Buyer. Top-level milestone records are not modified; future approved writes must keep both representations consistent.

## Explicit standalone-to-canonical mapping

| Member 3 standalone field/model | Canonical source / treatment |
| --- | --- |
| Boolean demo session / Rohan / Precision Works | Existing shared User -> exact Workshop.ownerId; no identity migration or guessing |
| Invitation.id (KL-*), embedded title/buyer/description | Canonical Invitation.id -> Invitation.jobId -> Job, then Job.buyerId -> User display name |
| New / Accepted / Rejected | Canonical PENDING / ACCEPTED / DECLINED displayed directly; no standalone records/statuses are cast or migrated |
| Invitation.price / offered value | No canonical offered-price contract; actual Job.budget is labelled buyer budget, and Quote.amount is labelled quoted total |
| Invitation.receivedAt | Not supplied by canonical Invitation; not fabricated |
| DemoQuote.invitationId, buyer/job strings | Canonical Quote.jobId/workshopId joins; invitations and quotes relate only through the exact canonical job/workshop pair |
| estimatedTotalPrice / expectedCompletionDate | Display actual Quote.amount / estimatedDelivery; no legacy data imported |
| Cost breakdown, productionDays, quote submission/update timestamps | Unsupported by current Quote contract; not invented or silently folded into another field |
| Standalone WorkshopOrder ID/product/buyer strings | Canonical Order.id/jobId/workshopId/buyerId/quoteId joins |
| Confirmed -> Completed sequential status list | No complete safe transition mapping; canonical lifecycle values and milestones displayed directly; progression disabled |
| Standalone paymentStatus / Completed implies Paid | No mapping. Only actual PaymentRecord.simulationStatus is displayed and labelled simulation. Missing payment records remain unavailable, including on PAID lifecycle orders |
| Quality Check / readiness states | Canonical Order.qcStatus and submitted Inspection records displayed separately; production does not decide QC |
| WorkshopProfile free-text machinery/capacity | Exact canonical own Workshop with capabilities[], Machine[], CapacitySlot[]; no parsing free text into structured contracts |
| Legacy phone, registration, staffing, preferences, onboarding registrations | Unsupported account/profile fields are not fabricated; Settings shows supported own account data, onboarding shows existing profile linkage |

A quotation is not an order. Invitation acceptance is not buyer award. Production completion is not QC acceptance. QC acceptance is not payment completion. No workflow transitions are enabled.

## Derived metrics and unknown information

Dashboard uses actual owned record counts: total invitations, SUBMITTED quotations, active orders (excluding CLOSED/CANCELLED), PENDING inspections, REWORK inspection records and CLOSED orders. Reporting groups do not approve transitions.

Capacity is shown per published window and source unit. No capacity utilization/rating/date/payment/operational values are synthesized. Missing optional ratings/dates use unavailable/not-recorded labels. Milestone completion percentage is the existing shared completed-count helper, not a capacity percentage.

## Persistence, reset and disabled mutations

No workshop mutation method exists. Invitation accept/decline, quote submit/edit/withdraw, order progression, QC/payment commands, profile/settings and onboarding writes remain disabled. Buyer award remains disabled. Standalone handlers/providers remain inactive source.

The existing kaarigarlink.demo-data.v1 key/envelope version 2 is reused unchanged, with existing version 1 restore support. Workshop reads do not write. Existing buyer invitation and submitted inspector changes are immediately visible in the same store and restore through that envelope. Reset through existing Buyer orders/Inspector/Admin controls restores the canonical seed for every role and invalidates shared queries.

Malformed persisted records follow existing validated recovery: visible warning, original canonical seed for reads, writes blocked until shared reset. Broken read-model references fail explicitly, without silently displaying another workshop's records.

No standalone workshop storage key is read, written, migrated or cleared. Legacy records require an explicit future migration policy; their incompatible identifiers cannot be guessed.

## Phase 8B.3 decisions still required

Agree approved invitation responses, quotation fields/rules, production commands, QC/rework synchronization, payment responsibility, profile/onboarding/settings writes, concurrency/idempotency, upload/privacy and backend contracts before implementation. Keep read scoping at the service boundary and extend tests across all roles. No backend approval, endpoint guess or production workflow is implied.

# Provisional frontend contracts

Status: proposed, **not backend-approved**. Source: PRD sections 9–10. Types live in `frontend/src/types/index.ts`. This document records assumptions, not confirmed HTTP endpoints.

> Current implementation: Phase 3. Historical notes below are supplemented by the Phase 3 marketplace proposal and explicit award blocker.

## Representation

| Area | Phase 0 proposal |
| --- | --- |
| IDs | Opaque strings; never parse IDs |
| Roles | buyer, workshop, inspector, admin |
| Dates | Calendar dates as YYYY-MM-DD; event timestamps as ISO 8601 UTC strings |
| Money | INR numeric major units for mock amount/budget; confirm minor units/decimal serialization before live integration |
| Location | city/state plus optional address; coordinates optional on Workshop |
| Files | Metadata only: id/name/mediaType/sizeBytes; no upload, signed URL or binary storage |
| Match results | Backend-owned score/explanations/eligibility; no frontend scoring or assumed score range |
| Collections | Arrays in the foundation; pagination/filter/sort contracts remain pending |
| Optional fields | Absent when unknown; strict exact optional properties, no implicit null conversion |

## Data dictionary

| Entity | Relationship and important fields |
| --- | --- |
| User | id, role, name, email |
| Workshop | ownerId → User; location, capabilities, machines, capacitySlots, optional rating/coordinates |
| Machine | id, name, process; embedded in Workshop |
| CapacitySlot | id, startsOn, endsOn, availableQuantity, unit; embedded in Workshop |
| Job | buyerId → User; title/description/capability, material/specification, quantity/unit, processes, deadline/location, optional budget, designFiles, status |
| MatchResult | jobId → Job, workshopId → Workshop; score/explanations/eligibility |
| Invitation | jobId/workshopId, status |
| Quote | jobId/workshopId, amount, estimatedDelivery, notes, status |
| Order | jobId/workshopId/buyerId/quoteId, status, embedded milestones, optional qcStatus |
| Milestone | orderId → Order; title/dueOn/status/optional completedAt |
| Inspection | orderId/inspectorId; decision, notes, evidence, optional reworkDeadline |
| PaymentRecord | orderId; simulationStatus only |
| Review | orderId, rating, optional comment |
| AuditEvent | actorId → User; entityId/entityType/action/occurredAt |

Milestones have both a collection and an embedded order representation to match the PRD. Future adapters must update both atomically; normalize the backend representation after sign-off. Review rating scale and eligibility are not validated yet because there is no review command.

## State is not policy

Order status names reproduce the PRD: POSTED, QUOTING, AWARDED, IN_PRODUCTION, QC_PENDING, ACCEPTED, REWORK, PAID, CLOSED, CANCELLED. These are vocabulary only. No transition graph or domain mutation is implemented.

Other status unions are provisional. Inspection decision uses PENDING/ACCEPTED/REWORK for an assigned inspection's lifecycle. Confirm whether the backend separates pending status from decision.

Member 2 must approve award eligibility, cancellation after award, rework deadlines/resubmission, QC assignment and duplicate-decision handling, simulated payment eligibility and review/closure policy.

## Services

`DataService.list(collection)` is a typed adapter contract for Phase 0, not an HTTP route convention. Create one service instance at the provider boundary in Phase 1; feature components must not import fixtures or instantiate their own stores.

```ts
import { createServices } from '@/services';
const services = createServices('mock');
const jobs = await services.list('jobs');
```

Each service factory has isolated state. Tests or future adapters can explicitly share a `createMockStore()`. `snapshot()` and list results are defensive clones; `commit()` is internal infrastructure with atomic rollback on thrown errors. Domain commands, validation and authorization belong in future adapters, never in components. Reset/reload discards mock changes. Synthetic fixtures now contain four role users, one workshop and four buyer jobs plus posting audit events; downstream collections are intentionally empty until their phases.

`VITE_SERVICE_MODE` defaults to mock. Any other value fails with NOT_CONFIGURED. No real adapter is claimed. The generic `apiRequest(url, schema, init)` helper validates JSON with Zod, normalizes errors, preserves aborts and never retries using mocks. Its schema is mandatory; no unvalidated response casts.

Normalized error codes: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION, CONFLICT, NETWORK, SERVER, NOT_CONFIGURED. HTTP status is available where applicable. Server bodies are not exposed directly. Backend field-error mapping and empty/204 responses await endpoint agreement.

## Backend sign-off checklist

| Owner | Decision needed |
| --- | --- |
| Member 1 | Auth transport/session expiry, role casing, workshop/job schema, matching score and explanation format |
| Member 2 | Workflow states and permitted actions, concurrency/idempotency, QC/rework/cancellation/payment/review policies |
| Both | Exact methods/routes/parameters, pagination, error envelope/field errors, money units, date/timezone/null rules, CORS and upload metadata |

Proposed groups only: /api/auth, /api/workshops, /api/jobs, /api/matches, /api/invitations, /api/quotes, /api/orders, /api/milestones, /api/inspections, /api/payments, /api/reviews, /api/admin. No exact endpoint paths or HTTP methods are invented here.

All VITE_* variables are public browser configuration. No API secrets or production personal data belong in this client. Mock mode and future UI guards provide no security; backend authorization is required.

## Phase 1 authentication addition

Existing entity types, DataService, fixtures and business-state vocabulary are unchanged. Added services/auth.ts:

```ts
interface AuthService {
  login(credentials: LoginCredentials): Promise<User>;
  demoLogin(role: Role): Promise<User>;
  restoreSession(): Promise<User | null>;
  logout(): Promise<void>;
}
```

LoginCredentials is inferred from a Zod schema: normalized valid email and 8–128-character password. This is demo validation, not a confirmed backend password policy. Wrong credentials yield UNAUTHORIZED, invalid inputs VALIDATION, missing demo accounts NOT_FOUND and storage failures SERVER.

app/services.ts composes a single data/auth service pair. Auth uses the same shared user collection; there is no independent user fixture in login pages. The provider restores before routing, clears the query cache after successful identity changes/logout, and exposes identity without exposing credentials or tokens to pages.

The mock adapter uses public demo password DemoPass123! and sessionStorage key kaarigarlink.mock-session.v1. Stored fields: version=1, userId, expiresAt (8 hours from login). Restoring rejects malformed/expired/deleted-user records and resolves name/role from the data service, not saved user attributes. No password, JWT or user object is stored. Expiry is checked on application restoration, not by a background timer. Logout failure remains visible and does not silently clear the UI identity. Session storage is per tab; browser tab duplication can copy its initial session, according to browser behavior.

Future JWT integration replaces the AuthService adapter and composes authenticated data requests at the service boundary. Confirm token transport/storage, refresh/expiry and logout revocation with Member 1; none are implemented now. demoLogin must be disabled or explicitly rejected in a production adapter. Guard components are UX only, and backend authorization remains mandatory.

No approved workflow command, matching score or API route was added in Phase 1.



## Phase 2 buyer jobs

Existing list(), auth and workshop entity shapes are preserved. Job adds **optional createdAt?: string** (ISO 8601 UTC). New mock jobs always have it; legacy jobs without a timestamp display Not recorded and sort after dated records. No creation date is fabricated in UI. Backend approval is still required.

DataService now has a required buyer namespace implementing BuyerService:

```ts
getDashboard(buyerId: string): Promise<BuyerDashboardData>;
listJobs(buyerId: string): Promise<Job[]>;
getJob(buyerId: string, jobId: string): Promise<Job>;
createJob(buyerId: string, input: CreateJobInput): Promise<Job>;
```

Existing .list consumers are unchanged. Hand-written implementations of DataService must now provide buyer too; prefer the shared factory for mock test doubles. These method signatures are adapter contracts, not invented HTTP methods or endpoints. Buyer pages never use the unrestricted foundation list() method.

Reads validate that the supplied actor exists and is a buyer. Lists are owned-only; missing and other-buyer job IDs both return NOT_FOUND without exposing titles. Dashboard data is scoped to owned jobs, their quotes, owned related orders and related job/order audit events. Stats are derived from that response:
- Total posted: all owned jobs.
- Active: POSTED, QUOTING or AWARDED (display grouping, not a transition policy).
- Pending quotations: SUBMITTED quotes for owned jobs.
- Production orders: IN_PRODUCTION owned orders.
- Upcoming delivery: active jobs with requested deadline today or later, sorted soonest, maximum four. These are requested job dates, not production tracking.

createJobSchema is shared between React Hook Form/Zod and the mock adapter. Required trimmed text fields, positive finite quantity, at least one machine/capability, city/state, valid calendar deadline strictly after today in Asia/Kolkata, and optional positive INR budget (two decimals maximum) are validated at the service boundary. Text lengths/requirements and attachment limits are bounded for the demo. No price multiplication or financial settlement occurs.

Field mapping reuses existing contracts: required machinery/capabilities → processes (array); optional specifications → specification (empty string when omitted); delivery city/state → location; budget stays INR numeric major units. CreateJobInput is schema-inferred. Caller-supplied IDs, buyerId, status and createdAt are rejected, then assigned by the mock adapter: authenticated UI actor, unique ID, POSTED and current timestamp. Job creation and JOB_POSTED AuditEvent append in one atomic store commit. This is the only new domain command; no transition graph is added.

The UI keeps the submission lock held through successful navigation, including the fast-mock case; failure preserves values and unlocks retry. Buyer query prefixes are invalidated after creation and the created detail is cached. This is UI duplicate prevention, not a server idempotency protocol; agree that protocol before live integration.

Design files are metadata only: id/name/mediaType/sizeBytes. Five files maximum, 10 MB each. Contents are never read, transmitted or stored, including in localStorage. No upload security, malware scan or download is claimed. There are no uploads to authorize in this mock phase.

Mock identity/ownership checks are not security: caller IDs can be impersonated in a public demo. The real backend must derive identity from its session/token and authorize every read/write rather than trusting buyerId. Real mode remains explicitly unconfigured, with no fallback to mock success.

Seed changes: four buyer jobs (three POSTED, one static QUOTING) and four posting audit events; user/workshop IDs and workshop data unchanged. Quote/order/downstream collections remain empty. QUOTING is a read-only sample state, not a newly implemented workflow action. All business state remains in memory and resets on reload; no draft persistence was added.

Backend sign-off additions: createdAt availability/format, machine/process vocabulary, deadline timezone, limits/validation, money precision and create/read/error contracts. Order/matching/QC policies remain deferred.

## Phase 3 matching, invitation and quotation proposal

All existing domain entity shapes are unchanged, including MatchResult, Invitation, Quote, Workshop and Order. Added BuyerMarketplaceService (extended by BuyerService), with these provisional adapter methods:

```ts
getMatches(buyerId: string, jobId: string): Promise<BuyerMatchesData>;
inviteWorkshop(buyerId: string, jobId: string, workshopId: string): Promise<Invitation>;
getQuotes(buyerId: string, jobId: string): Promise<BuyerQuotesData>;
```

These are not HTTP endpoint definitions. Reads first enforce existing buyer/job ownership; missing and other-buyer jobs share NOT_FOUND. Joined workshop references must exist; a missing reference surfaces SERVER rather than fabricating a result.

BuyerMatchesData contains the job and ordered WorkshopMatch records: existing match/workshop/invitation entities plus canInvite/invitationReason. The adapter preserves stored match order and score/explanation/eligibility fields exactly. No scoring, distance calculation, ranking engine or on-demand match generation exists. Unseeded jobs return no results. Score/rating scales remain unapproved, so UI does not invent percentages or denominators.

The mock invitation proposal permits a new PENDING record only for an eligible supplied match on an owned POSTED/QUOTING job, with no existing order or awarded quote. It never changes job/quote/order state. A repeated request for an existing job/workshop pair returns the same invitation, including ACCEPTED/DECLINED; there is no resend/reopen/withdraw operation. New invitation and WORKSHOP_INVITED audit append atomically to the shared store. UI confirms first, guards duplicate requests and refreshes buyer queries. Member 1 must approve this policy/API; Member 3 owns workshop responses and quote submission.

Invitation statuses retain existing spelling: PENDING, ACCEPTED, DECLINED. New invitations are PENDING. The buyer reads response states; it cannot accept/decline on a workshop's behalf.

BuyerQuotesData contains the owned job, WorkshopQuote records and awardBlocker. Quotes are filtered by job before workshop joins. canReviewAward/reviewReason describe UI review availability only: SUBMITTED, eligible supplied match, positive finite amount, valid calendar delivery date, open job and no existing order/awarded quote. Late delivery/expiry/revision policies are not invented. Any existing order conservatively blocks review until re-award policy is agreed. Status values stay SUBMITTED/AWARDED/REJECTED/WITHDRAWN.

### Award execution blocker

No award command, permitted transition table or concurrency/idempotency contract exists in the repository. Per the Phase 3 instruction, **no award method or simulated transition was invented**. Valid quotations can open the review dialog with workshop/price/date/notes. Its Award order button remains disabled with an explicit unavailable message. Rejected/withdrawn/ineligible/already-awarded cases cannot initiate review. No job, quote or order state is mutated and no award success is claimed.

Member 2 must supply approved award request/response/error contracts, eligibility, uniqueness/idempotency/stale-quote handling, and job/quote/order transitions before execution can be enabled. This blocks the PRD's successful-award completion criterion, but not matching/invitation/quotation UI verification.

Seed proposal: seven users, four workshop profiles, five fixed match results (job-1 four / job-2 one), four historical invitations and four quotations (job-1 three / job-2 one). Job-3 has no matches/quotes. Three quotes are SUBMITTED and one REJECTED; orders remain empty. Existing IDs are preserved, with one CNC mill and rating added to the original workshop for coherent match data. Ratings are read-only demo profile values; no rating feature was implemented. A full reload still resets mock business data.

Backend sign-off remains required for ranking/rating scales, related resource joins, invitation eligibility and response statuses, quotation lifecycle/money/date conventions and all award semantics.


## Phase 4 tracking/review addition (current)

See [phase-4-contracts.md](phase-4-contracts.md) for exact adapter signatures, provisional review policy and persistence boundaries. This section supersedes earlier historical statements that orders/reviews are empty or all business data resets on development reload.

BuyerService adds listOrders/getOrder/submitReview through BuyerOrderService. BuyerOrderData joins existing entities, scoped inspection/activity records, existing review and explicit review availability. DataService has an optional mock-only demo description/warning/reset capability; real adapters need not implement it.

Shared additions are optional only: Order.createdAt, Milestone.description and Milestone.notes. No Job/Quote/Review fields or status values changed. Milestones remain embedded and in their shared collection; the seed keeps both identical. Future workshop commands must update both atomically.

Six historical orders and their separate jobs/quotes now populate the shared store. Reviews are CLOSED-only, one per order, integer rating 1–5 plus trimmed 10–2000-character feedback; these mock-only rules require Member 2 approval. PAID does not imply eligibility. Review commands never advance any lifecycle state.

Development mock persistence is versioned and allowlisted; production builds/default unit factories remain memory-only. Identity/attachments/order and QC snapshots are excluded. Real mode still fails explicitly. No award or other workflow transition is enabled.

## Phase 5 inspector addition (current)

See [phase-5-qc-contracts.md](phase-5-qc-contracts.md) for the complete provisional QC model. DataService adds InspectorService: assigned list/detail, saveDraft and submitDecision. Existing adapters in this repo compose it through the shared mock factory; future DataService implementations must provide the namespace.

Inspection adds optional dueOn/assignedAt/updatedAt/checklist/draft/history. Added supporting check/finding/decision types; existing entity fields, unions and Collections arrays remain intact. Checklist result status is distinct from QCStatus and OrderStatus.

Only a new, assigned PENDING inspection on an undecided QC_PENDING order with a supplied checklist can decide. Confirmed mock acceptance/rework appends history, updates inspection and Order.qcStatus, and records audit activity atomically. Production/payment/closure/milestones are unchanged. No reinspection command exists.

Buyer responses exclude draft findings. Existing development persistence accepts v1 and writes v2 through the same key; QC updates are allowlisted, evidence metadata stripped, history prefixes and references validated. Reset restores the common seed. No real endpoint, authorization mechanism or production transition is approved.

## Phase 6 read-only admin namespace (current)

See [phase-6-admin-contracts.md](phase-6-admin-contracts.md). DataService.admin.getOverview(adminId) returns a role-checked, minimized operational snapshot over the same users/workshops/jobs/orders/matches/invitations/quotes/inspections/activity. Future concrete DataService adapters must supply the namespace or reject it explicitly. It is not an HTTP endpoint definition.

All existing entity fields, status unions, seeds, buyer/inspector commands and persistence are unchanged. Admin reads whitelist known operational fields and exclude credential/unknown secret fields, private QC drafts, attachment metadata, exact addresses and coordinates. No moderation, verification, award, lifecycle, QC or payment mutation method exists.

Filters, details, metrics and deterministic demo alerts use that bounded snapshot. Production pagination/filter/read entitlements and transport remain backend dependencies. The existing confirmed all-role demo reset is reused; it is not a business moderation action.

## Phase 8B.2 workshop read namespace

DataService now requires workshop.getWorkspace(actorId), getInvitation(actorId, invitationId) and getOrder(actorId, orderId). These read the existing shared mock store, resolve the exact canonical User -> Workshop.ownerId mapping and enforce workshop role/ownership before returning joined records. Missing profiles do not fall back to another workshop; ambiguous mappings and invalid references fail explicitly. No shared domain entity/enum, fixture, persistence version or workflow command changed. See phase-8b2-workshop-contracts.md for typed projections, privacy, unavailable legacy fields, reset and outstanding backend approval requirements.

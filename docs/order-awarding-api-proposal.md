# Order-awarding API — backend review proposal

Status: **PROPOSED / NOT APPROVED**.
Prepared from the current frontend contracts. No backend implementation or recorded backend approval was found in this workspace. This document does not authorize a state transition or enable the Award order button.

Owners: Member 2 approves award/order semantics; Member 1 confirms authentication and shared Job/Quote contracts. Member 4 integrates after approval. No message has been sent to either member from this workspace.

## 1. Endpoint and schemas — proposed transport

Recommend a single atomic operation:

```http
POST /api/jobs/{jobId}/award
Content-Type: application/json
Idempotency-Key: <opaque unique award-attempt key>
```

Authentication transport must be confirmed with Member 1; no bearer-token or cookie behavior is assumed.

Proposed request:

```ts
interface AwardRequest {
  quoteId: string;
}
```

The server loads the job from the path and the quote from quoteId. It derives workshopId from that quote and buyerId from the authenticated principal. The browser cannot supply price, delivery date, buyer identity, order status or milestone state.

Proposed successful response: HTTP 201 for a newly created award/order, with this envelope:

```ts
interface AwardResponse {
  job: Job;
  quote: Quote;
  order: Order;
}
```

Job, Quote and Order refer to the existing frontend shapes in frontend/src/types/index.ts. All remain provisional until backend sign-off. Return authoritative updated records, not only a success flag, so the frontend can invalidate/update related caches and navigate using order.id.

Member 2 must approve this method/path/envelope or provide the implemented alternative.

## 2. Required identifiers

| Identifier | Proposed source |
| --- | --- |
| jobId | URL path; opaque string |
| quoteId | Request body; opaque string |
| workshopId | Server derives from quote.workshopId |
| buyerId | Server derives from authenticated identity |
| orderId | Server creates and returns as order.id |

Required consistency: quote.jobId equals path jobId; created order jobId/quoteId/workshopId/buyerId refer to those same authorized records. IDs are never interpreted as numbers by the frontend.

The quoted amount and delivery commitment must be validated against the current quote in the same transaction. Member 2 must confirm quote immutability, or specify an approved revision/version precondition for stale quote protection; no revision field is invented here.

## 3. Eligible quotation statuses — approval required

Existing vocabulary: SUBMITTED, AWARDED, REJECTED, WITHDRAWN.

The current frontend permits only SUBMITTED quotes to enter the read-only review. That is **not an approved awarding rule**. Member 2 must confirm:
- Whether SUBMITTED is the sole awardable state.
- Workshop/match eligibility and whether an accepted invitation is required.
- Expiry, capacity, deadline and stale/revised-quote conditions.
- Whether a quote may be awarded after any earlier order/cancellation.

REJECTED/WITHDRAWN are blocked by the current UI. AWARDED is treated as an already-awarded condition. Backend authorization and eligibility checks must be authoritative even when the UI has enabled review.

## 4. Job/order transitions — deliberately undecided

The PRD explicitly reserves exact transition rules for Member 2. No transition is selected or implemented by this proposal.

Please approve or replace each row:

| Decision | Backend-approved value |
| --- | --- |
| Source job states from which awarding is permitted | Pending Member 2 |
| Job state after successful award | Pending Member 2 |
| Selected quote state after successful award | Pending Member 2 |
| Initial order state | Pending Member 2 |
| What happens to other quotes for the job | Pending Member 2 |
| Whether later re-award is permitted | Pending Member 2 |

AWARDED exists in the proposed Job/Quote/Order vocabularies; its presence alone does not approve a transition. The frontend will apply only the state returned by the approved service and will not advance production state itself.

## 5. Automatic order creation — recommended, not confirmed

Frontend recommendation: award validation, selected-quote/job updates, exactly one order creation, applicable milestone creation and audit append form one database transaction. A failed request leaves no partial award/order.

Member 2 must confirm automatic order creation. If order creation is a separate operation, supply its API and recovery/idempotency behavior before frontend implementation. A success response must not send the user to an order that does not exist.

## 6. Duplicates, conflicts and errors — proposed semantics

Recommended:
- Same authenticated buyer + same idempotency key + same request returns the original successful result and the **same order.id**. It must never create another order.
- Reusing that key for a different job/quote request returns 409.
- A different attempt after the job is already awarded returns 409, unless Member 2 explicitly approves another replay policy.
- Concurrent attempts are serialized/guarded in the database so at most one eligible order is committed.
- Key retention/scope, replay HTTP status and timeout-retry behavior require Member 2 confirmation. The client reuses its attempt key for uncertain retries.

Proposed error envelope:

```ts
interface ApiError {
  error: {
    code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' |
          'VALIDATION' | 'CONFLICT' | 'SERVER';
    message: string;
    fields?: Record<string, string[]>;
    existingOrderId?: string; // Only when this buyer may access it.
  };
}
```

| HTTP | Proposed meaning |
| --- | --- |
| 401 | Authentication absent/invalid/expired |
| 403 | Authenticated role cannot award |
| 404 | Job/quote absent or not accessible to the buyer; avoid existence leaks |
| 409 | Already awarded, conflicting idempotency request, quote changed or eligibility changed |
| 422 | Malformed/invalid request fields |
| 500 | Server failure; no partial transaction committed |

Member 2 must approve exact codes, field-error format, replay response and whether an authorized conflict includes existingOrderId. These error-body fields are not implemented in the existing generic API helper yet.

## 7. Order ID, milestones and tracking read

Proposed read endpoint:

```http
GET /api/orders/{orderId}
```

Proposed response using existing types:

```ts
interface OrderTrackingResponse {
  order: Order;
  job: Job;
  quote: Quote;
  workshop: Workshop;
  activity: AuditEvent[];
}

interface Order {
  id: string;
  jobId: string;
  workshopId: string;
  buyerId: string;
  quoteId: string;
  status: OrderStatus;        // Current enum is provisional.
  milestones: Milestone[];
  qcStatus?: QCStatus;
}

interface Milestone {
  id: string;
  orderId: string;
  title: string;
  dueOn: string;              // Proposed YYYY-MM-DD.
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt?: string;       // Proposed ISO 8601 UTC timestamp.
}
```

Do not duplicate milestones at the response top level. Member 2 must confirm initial milestone definitions/IDs/dates, whether the initial list can be empty, ordering, progress semantics and QC inclusion. The frontend must not fabricate production steps or timestamps.

Also confirm amount serialization/INR units, calendar-date timezone, optional-versus-null fields and the meaning of every returned order state. These decisions must match Member 1's shared Job/Quote definitions.

## 8. Authorization and ownership

Proposed requirements for backend approval:
- Authenticated buyer role is required for awarding.
- The job belongs to that authenticated buyer.
- The quote belongs to that job; its workshop reference is valid and eligible under the approved policy.
- Award ownership/eligibility/concurrency checks happen inside the transaction.
- Client-provided buyer IDs, amounts or statuses cannot override authoritative records.
- Tracking reads are limited to authorized order participants/roles; Member 2 must specify workshop, inspector and admin access separately.
- Buyer access to another buyer's job/order returns the agreed non-leaking response.
- An idempotent replay cannot reveal another buyer's order.

Frontend guards and mock actor IDs are not security controls.

## Required Member 1 / Member 2 sign-off

| Owner | Confirm |
| --- | --- |
| Member 1 | Job/Quote ID and field shapes; money/date/null representation; authentication/expiry; workshop eligibility source |
| Member 2 | Implemented endpoints/schemas; awardable statuses; exact transitions; automatic order creation; idempotency/conflicts; tracking/milestones; ownership |
| Both | Quote revision/immutability, cross-module references and an implemented integration example |

Approval record: **pending**. No approved reviewer/date/commit or backend example has been supplied.

Once approved, record the exact backend version/commit and example success/conflict payloads here. Then add the frontend award adapter, meaningful success/failure/concurrency tests, and only afterward enable award execution. Phase 4 independently permits read-only seeded buyer tracking and a documented mock-only review workflow (see phase-4-contracts.md). No application code or shared runtime contract is changed by this document.

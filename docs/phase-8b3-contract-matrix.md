# Phase 8B.3 command compatibility matrix

Date: 19 November 2026 (Asia/Calcutta). Reviewed before implementation.

Sources: current shared domain/service/store/persistence, Member 3 handoff and Phase 8B.2 mappings; docs/API.md; backend routes, validators, orders-domain placeholder; backend workshop ownership and optimistic-concurrency tests. The existing remote Member 2 branch was inventoried read-only and contains no implemented quote/order workflow module. No remote was fetched or modified.

| Proposed command | Classification | Decision / evidence |
| --- | --- | --- |
| Invitation response | Local mock simulation only | API.md documents a planned invited-workshop response; current backend router does not mount it. Backend INVITED/EXPIRED differs from mock PENDING. Enable only PENDING -> ACCEPTED/DECLINED over shared canonical mock records. |
| Submit quotation | Local mock simulation only | Canonical Quote supports amount, estimatedDelivery, notes, job/workshop IDs and status. Orders schema is a placeholder; no implemented quote endpoint/test in this backend. Require accepted owned invitation, open/unexpired job and no award/order. One quote per job/workshop pair. |
| Edit quotation | Local mock simulation only | Only own SUBMITTED quote on accepted invitation/open/unexpired/unawarded job; require exact expected quote terms for stale-value detection. |
| Withdraw quotation | Local mock simulation only | Same ownership/open-job rules, SUBMITTED -> WITHDRAWN only; no resubmission of withdrawn quotes. Expected terms detect stale commands. |
| Cost breakdown / production duration | Blocked pending shared contract | No canonical fields or approved conversion. Reject unknown fields; do not silently discard them or persist standalone models. |
| Order creation / buyer award | Blocked pending approval | No approved award adapter or atomic lifecycle contract. Keep existing buyer Award order disabled. Invitation response must not create an order. |
| Production / milestone / rework / QC submission | Blocked pending transition contract | Canonical status union is not a role/action transition table. No approved QC-round creation/rework synchronization contract; no progression methods enabled. |
| Inspector decision | Existing inspector mock policy only | Retain existing inspector-owned commands unchanged; workshops can only read submitted results. No workshop acceptance/rejection or QC bypass. |
| Payment / close order | Blocked pending authorized contract | No workshop payment or close command. Completion never sets Paid or QC accepted. |
| Profile / machines / capacity | Backend contracts exist, frontend mutation mapping blocked | Backend owner/admin PUT and structured CRUD are implemented/tested, including verification reset and stale-update protection. Frontend shared model lacks those update/revision/verification semantics and uses different machine/capability/unit structures. Do not guess mappings or enable writes. |
| Onboarding / account creation | Backend auth/register exists, frontend command blocked | Current shared AuthService has no registration contract; identity/profile atomic creation and verification must be reconciled. |
| Settings / preferences | Blocked pending shared contract | No canonical preference fields or write interface. |

## Implemented local mock policy

This is explicit mock behavior authorized for this phase, not backend sign-off. All input boundaries are strict/validated. Current ownership/state/references are checked again inside the existing synchronous clone -> validate/update -> persist -> publish transaction. A persistence failure publishes neither quote/invitation changes nor audit effects.

Accepted/declined responses are terminal. Exact repeated responses return the existing result without duplicate audit effects. Quote submission uses the unique job/workshop pair; an exact submitted replay returns the same quote, a different duplicate conflicts. Edits/withdrawals compare expected canonical terms; exact replays are no-ops, conflicting stale values fail. No quote revision field exists, so value comparisons do not detect ABA histories. Separate tabs/processes/servers are outside the existing single-active-tab mock guarantee.

Delivery is an ISO date from today through the job deadline (India time); job expiration is checked against the latest canonical job. Amount must be finite, positive, at most INR 1 billion and have at most two decimal places; notes are trimmed and bounded at 4000 characters. Canonical duration/cost-breakdown fields do not exist and remain unavailable.

No command changes Job.status, orders, milestones, inspector decisions or payments. Audit events reference the existing Job entity vocabulary. Quotes join Buyer comparison through the same canonical collection; no second store, standalone session, HTTP endpoint or legacy storage key is activated.

Persistence now writes envelope v3 under the existing key with a validated canonical quote allowlist, preserving v1/v2 restoration and shared reset. No generated fixture orders or fake production/QC success will be used to claim unsupported cross-role flows.

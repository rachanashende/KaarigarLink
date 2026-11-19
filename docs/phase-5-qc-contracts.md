# Phase 5 — provisional inspector QC contracts

Status: **mock-only / NOT backend-approved**. Member 2 must approve QC policy, commands, history, rework and authorization; Member 1 confirms identity and shared Job/Workshop fields. No backend endpoints, team messages or approvals are claimed.

## Existing contracts and additions

Before Phase 5, Inspection exposed only id/orderId/inspectorId/decision/notes/evidence/reworkDeadline. QCStatus vocabulary PENDING/ACCEPTED/REWORK existed, but there was no checklist, inspector command, history, assignment deadline or approved order transition.

Existing fields/unions remain intact. Added optional Inspection fields:
- dueOn: YYYY-MM-DD inspection deadline.
- assignedAt/updatedAt: ISO UTC timestamps.
- checklist: supplied InspectionCheck records (id, label, requirement, required, evidenceRequired).
- draft: InspectionFindings (items and overall summary).
- history: append-only InspectionDecisionRecord array.

Findings contain checklist ID, UNRECORDED/PASS/FAIL/NOT_APPLICABLE, notes and evidence metadata. A decision record has a service-created ID, inspectorId, submittedAt, findings, and ACCEPTED or REWORK. REWORK additionally stores reason, correctiveAction and reworkDeadline. These are human-entered records, not platform physical verification.

No new Collections array is required. Draft/history live with their assignment. Existing Job/Quote/Order/Review fields remain unchanged.

## Service namespace

DataService.inspector implements:
- listInspections(inspectorId): assigned joined workspaces only.
- getInspection(inspectorId, inspectionId): one assigned workspace.
- saveDraft(inspectorId, inspectionId, findings): validated partial checklist/summary.
- submitDecision(inspectorId, inspectionId, input): isolated atomic mock QC decision.

InspectorInspectionData joins inspection/order/job/workshop/buyer/assigned inspector, decision availability/reason and actor-scoped QC audit activity. It does not include other assignments or another inspector's activity. No transport endpoint is implied.

Known actor must have inspector role. Wrong role is FORBIDDEN, unknown actor UNAUTHORIZED; missing/unassigned IDs share NOT_FOUND on reads and writes. Broken resource joins give SERVER. Real identity must come from authenticated backend context rather than caller-supplied IDs.

## Provisional eligibility and validation

Decision/draft commands require:
- This inspector owns the assignment.
- Inspection decision is PENDING and has no submitted history.
- Related order production status is QC_PENDING, and its QC summary is PENDING or absent. An existing final QC summary blocks a stale pending assignment.
- A nonempty checklist was supplied.

Findings must match that checklist exactly: no unknown, missing or duplicated IDs. Text is trimmed/bounded to 4000 characters. Evidence is metadata-only, at most three files per check and 10 MB per file. No content is read/uploaded/downloaded.

Partial drafts may retain UNRECORDED items and an empty summary. Saving a draft never issues a QC decision or changes an order. The Save draft control preserves checklist findings and summary only; proposed rework reason/action/deadline are not draft fields and are explicitly identified as unsaved until submission.

Submission requires a summary of at least ten characters, completed required checks, at least ten characters of notes for FAIL/NOT_APPLICABLE, and metadata for each recorded evidence-required check. NOT_APPLICABLE is permitted with documented rationale; backend policy must confirm that allowance.

Acceptance forbids any failed finding. Rework requires at least one documented FAIL, a reason and corrective action of at least ten characters each, and a valid calendar deadline strictly after today in Asia/Kolkata. Past deadlines remain valid historical data on restore; the future rule applies when making a new request.

Confirmation displays decision, pass/fail counts, summary and applicable reason/action/deadline. A UI ref lock covers fast double clicks. The service independently rejects duplicate/stale/terminal decisions with CONFLICT. Invalid payloads produce VALIDATION; unexpected actor/identity/state fields are rejected by strict schemas.

## State model — no production transition

| Operation | Inspection | Order QC summary | Order production status |
| --- | --- | --- | --- |
| Save partial draft | PENDING; draft updated | unchanged | unchanged |
| Accept | PENDING → ACCEPTED; one history append | ACCEPTED | unchanged (QC_PENDING) |
| Request rework | PENDING → REWORK; reason/deadline/history | REWORK | unchanged (QC_PENDING) |
| Reinspection | unsupported | unchanged | unchanged |

Inspection update, history append, order.qcStatus and MOCK_QC_ACCEPTED/MOCK_QC_REWORK activity commit atomically. Storage failure rolls the entire draft back. Draft is removed on a successful decision.

No lifecycle transition graph is approved. Orders are never marked ACCEPTED, REWORK, PAID or CLOSED by these commands. Milestones, jobs, quotations and payments remain untouched. In particular, an order may retain production status QC_PENDING while its separate QC summary becomes ACCEPTED/REWORK. The UI labels these states separately.

Rework remains awaiting workshop corrective work; follow-up inspection is required but scheduling/reopening/reassignment/resubmission are unsupported. No automatic reinspection or workshop completion exists.

History records append; no edit/delete/overwrite command exists. Legacy assignments without history still show existing notes/status but cannot invent historical dates.

## Seed

Five assignments for inspector-1: one pending, two accepted, two rework. Original Phase 4 inspection IDs/notes/rework deadline remain. Each now has supplied machining-specific checks, dates and historical decision records when applicable.

inspection-qc on order-qc is the actionable pending case.
inspection-overdue on order-production has historical rework requested 16 November with deadline 18 November 2026. Production status remains IN_PRODUCTION; separate qcStatus is REWORK. This explicitly demonstrates distinct production/QC state. No state transition is executed to seed it.

Checks cover drawing dimensions, Aluminium 6061 material, surface finish/deburring and the 100-piece quantity. No generic functional test is imposed without job requirements. Seed evidence references are clearly synthetic metadata.

Overdue count covers unresolved pending inspections by dueOn and rework follow-up by reworkDeadline; accepted assignments are excluded. Missing dates stay unknown. Six orders/ten jobs/ten quotes and buyer review eligibility remain unchanged.

## Persistence compatibility and reset

One existing localStorage key, kaarigarlink.demo-data.v1, now accepts envelope versions 1 and 2. The key name remains stable to restore existing Phase 4 data. Version 1 restores its buyer collections plus the current QC seed; the next commit writes version 2.

Version 2 adds inspectionUpdates containing assignment IDs, partial draft findings, history and updatedAt. Canonical ownership/order/checklists remain seed-owned. Restore checks IDs, checklist references, inspector identity, duplicate updates, existing history prefixes and eligibility for a single appended decision. It rehydrates QC summaries without changing production states.

Evidence metadata is stripped from persisted draft/history data, as are buyer attachment metadata and credentials. Draft findings survive reload but evidence must be reattached before a decision. Submitted history remains an attestation whose evidence metadata may be unavailable in a later session. Fixed synthetic seed metadata is not a real attachment. Use synthetic input only.

Invalid persisted state warns and blocks mutations until explicit reset. Write failures leave memory unchanged. Reset is the same confirmed all-role demo operation, now available on Buyer orders and Inspector dashboard; it restores buyer/QC state and retains login.

Persistence remains development-only. Built production demos/default isolated tests are memory-only. One active tab is supported; cross-tab writes/caches are not coordinated. No real-mode/API-error fallback to mocks exists.

## Buyer and Member 3 boundaries

Buyer tracking receives submitted QC state/notes/rework deadlines and decision date; draft findings are removed from its service response. Buyer query caches invalidate after QC changes, and role changes clear caches through existing authentication.

Workshop execution belongs to Member 3. Her directory/routes remain untouched. She must coordinate approved workshop corrective-work and reinspection commands; do not reopen assignments or complete milestones directly. Embedded/top-level milestone consistency remains required.

## Backend decisions pending

Member 2: exact APIs/errors/idempotency, workflow eligibility, assignment/reassignment, decision immutability, checklist/evidence rules and upload security, NOT_APPLICABLE policy, rework/reinspection rounds, order/QC synchronization, concurrency, review/closure interactions, history/date/retention semantics.

Member 1: authenticated identity/expiry, buyer/job/workshop representation and access policy. Mock actor IDs/guards provide no production security.

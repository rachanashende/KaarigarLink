# KaarigarLink frontend overview

Restored Phase 6 frontend walkthrough. Commands and code paths below are relative to the repository root unless stated otherwise. Phase reports describe their original verification runs.

Manufacturing job-work marketplace. [PRD.md](../PRD.md) defines requirements, ownership and phase gates.

## Current phase: 6

Admin platform oversight now extends Phases 0–5: operational dashboard, users, workshops, manufacturing jobs/orders, matching/quotations, submitted QC history and deterministic demo alerts. Admin services are read-only and enforce the admin role. Buyer and inspector workflows, lifecycle states, persistence and Member 3 boundaries remain intact. Award execution stays disabled; no backend endpoint, moderation or payment operation is implemented.

## Run locally

Node 22.12+; Phase 6 adds no dependencies.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:5173. Use npm instead of npm.cmd where PowerShell policy permits.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- --maxWorkers=2
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e -- --workers=2
```

Run heavy checks sequentially on this machine. Chromium is the configured browser; actual results are in the phase reports.

## Demo access

Choose a role on /login or use a public demo account; all use **DemoPass123!**. Never enter real credentials or production data.

| Role | Email |
| --- | --- |
| Buyer | buyer@kaarigarlink.example |
| Workshop | workshop@kaarigarlink.example |
| Inspector | inspector@kaarigarlink.example |
| Admin | admin@kaarigarlink.example |

Identity uses per-tab sessionStorage (version, user ID and eight-hour restoration expiry). No passwords/tokens/user objects are saved. Business data persistence is separate.

## Phase 6 admin walkthrough

1. Select Admin on /login. Inspect store-derived metrics, marketplace activity and linked demo operational alerts.
2. Open User directory: search, filter roles and inspect existing account information. Account status/registration dates are not supplied; no role change, deletion or suspension exists.
3. Open Workshop oversight: filter capabilities, read machinery/published capacity/rating and navigate related jobs/orders. Verification and suspension remain unsupported.
4. Manufacturing jobs expose the same matches, invitations and quotation terms used by Buyer. Order details show source commercial terms, milestone progress and separate production/QC statuses; no award or lifecycle override exists.
5. Quality operations shows all assignments, submitted findings/history, rework dates and inspector links. Admin cannot make QC decisions; private drafts/evidence metadata are excluded.
6. Submit a supported mock decision as Inspector, then return as Admin/Buyer. Both read the same persisted QC records. Refresh data performs a read; it does not write business state.
7. Reset demo data from the Admin dashboard confirms the existing all-role demo reset and retains login.

Admin routes and record links are keyboard accessible. All filters/sorts use source fields. Alerts are local demo calculations, not live monitoring or notification delivery. The read model is intended for the small mock demo; production pagination/endpoints/access rules require backend approval.

## Phase 5 inspector walkthrough

1. Select Inspector on /login. Inspect the derived metrics, pending assignment, overdue rework case and decision history.
2. Assigned inspections → inspection-qc. Read the job requirements and distinguish order production status, QC status and rework follow-up.
3. Complete supplied checks, notes and overall summary; attach synthetic dimensional evidence metadata. Save draft to preserve findings/summary. Evidence metadata must be reattached after reload; proposed rework fields are not draft fields.
4. Review QC decision → confirm acceptance, or choose Request rework and document a failed finding, reason, corrective action and future deadline.
5. Submitted decisions are immutable and duplicate-safe. Open Rework follow-up/Inspection history; reinspection scheduling remains pending backend support.
6. Log out and choose Buyer → order-qc. Read the submitted QC summary/notes/deadline while production status remains QC_PENDING. Draft findings are not shared with buyers.
7. Inspector dashboard or Buyer orders → Reset demo data restores all demo business state and retains login. Reset between acceptance and rework demonstrations.

These are provisional mock-only rules requiring Member 2 approval. The platform records human findings and does not physically verify manufacturing quality.

## Phase 4 walkthrough

1. Buyer → Manufacturing orders: search by order/job/workshop, filter status or sort creation/delivery dates.
2. Open order-production: 25% completion is derived from one of four completed milestones. Overdue unfinished steps show Delayed.
3. Open order-qc or order-rework: read inspector notes, current QC summary and rework deadline. These views have no decision controls.
4. Open order-closed: submit a rating and written feedback after confirmation. Exactly one review is allowed for CLOSED orders in this provisional mock policy.
5. Reload to restore the review in development mode. order-paid remains ineligible; payment state alone does not qualify.
6. Manufacturing orders → Reset demo data → confirm restores the seed, including prior posted jobs/invitations/reviews. Login remains active.

Seed: ten owned jobs, ten quotes, six historical orders and twenty-four milestones, five inspection assignments with supplied checklists and historical decisions, four workshops and seven unique synthetic users. Historical order jobs/quotes are separate from the original four Phase 2–3 examples. Their states are fixed snapshots, not outcomes of an implemented award flow.

## Earlier flows retained

Post a validated job with metadata-only design files; use job search/filter/sort and full briefs. Job-1 has fixed ranked matches, machine/capacity/explanation data and an initially uninvited Deccan Toolcraft match. Invitations are duplicate-safe and do not create quotations. Job-1 has three quotes to inspect/compare; job-2 has one, job-3 none. New jobs have no generated matches/quotes. The original workshop shortcut still uses workshop-user-1.

Eligible quotes open the Phase 3 Award review dialog with source terms and a disabled Award order button. There is no award command or fabricated order success.

## Persistence and reset

Development mock mode uses localStorage key **kaarigarlink.demo-data.v1** for validated jobs, invitations, reviews, audit events and QC updates. Envelope version 2 restores earlier version 1 data through the same key. It excludes identity, credentials, attachment contents/metadata, production lifecycle and workshop profile mutations. Use synthetic input only. File metadata remains in current memory and disappears on reload.

Production builds and isolated default test factories are memory-only. Real/invalid modes fail explicitly with NOT_CONFIGURED; there is no API-error fallback. Invalid saved data shows a warning and blocks mutations until explicit reset; failed saves leave the store unchanged.

Reset from Manufacturing orders, Inspector dashboard or Admin dashboard clears only that demo key and refreshes shared queries. Browser developer tools can remove that exact key if recovery outside the UI is needed. One active demo tab is supported; multiple tabs do not synchronize writes/caches. Form drafts are not autosaved. QC drafts/history and their separate order QC summaries now restore together; future workshop mutations need an explicit versioned persistence extension.

## Routes

| Route | Access |
| --- | --- |
| /login | Login/demo access |
| /buyer/dashboard | Owned metrics, jobs, activity and deadlines |
| /buyer/jobs | Job search/filter/sort |
| /buyer/jobs/new | Job posting |
| /buyer/jobs/:id | Job brief |
| /buyer/jobs/:id/matches | Ranked matches, profiles and invitations |
| /buyer/jobs/:id/quotes | Quote comparison and blocked award review |
| /buyer/orders | Owned order search/filter/sort |
| /buyer/orders/:id | Production timeline, commercial terms, QC/rework and review |
| /buyer/orders/:id/review | Dedicated review view |
| /workshop/dashboard | Member 3 placeholder only |
| /inspector/dashboard | Assigned QC metrics, attention queue and follow-up |
| /inspector/inspections | Assigned inspection search/filter/deadline sorting |
| /inspector/inspections/:id | Requirements, checklist/draft, confirmed decision and history |
| /inspector/rework | Assigned rework deadlines and pending follow-up |
| /inspector/history | Immutable submitted decisions and findings |
| /admin/dashboard | Platform metrics, activity, attention queues and demo alerts |
| /admin/users | User search/role filter/sort |
| /admin/workshops | Capability-filtered workshop oversight |
| /admin/jobs | Platform manufacturing jobs and marketplace counts |
| /admin/orders | Platform orders, values, progress and QC summaries |
| /admin/quality | Submitted inspection/rework oversight |
| /admin/users/:id | Account details and relevant related records |
| /admin/workshops/:id | Published profile, related jobs/orders and issues |
| /admin/jobs/:id | Job brief, matches, invitations, quotes and related orders |
| /admin/orders/:id | Order commercial terms, milestones and related QC |
| /admin/quality/:id | Assignment, inspector, submitted findings/rework history |
| /foundation | Phase 0 shared preview |

Other-role routes are guarded. Private/missing jobs and orders share NOT_FOUND. Mock actor IDs and UI guards are demonstration checks; backend authorization remains required.

## Architecture and integration

src/app owns one router, shell, providers and guards. Buyer UI stays in src/features/buyer; pages use the provider-owned DataService and TanStack Query, never fixtures. Shared tokens/components/auth are preserved. No workshop feature directory is created.

DataService now composes buyer, inspector and read-only admin namespaces over one mock store. Inspection adds optional checklist/draft/history and date fields; existing entity fields/status vocabularies remain. Shared FormField and DemoDataNotice preserve buyer compatibility exports. No backend endpoint or production transition is approved. Inspector routes are lazy-loaded; React runtime is a separate cached build chunk.

[Phase 6 report](phase-6-verification.md) · [Admin contracts](phase-6-admin-contracts.md) · [Phase 5 report](phase-5-verification.md) · [QC contracts](phase-5-qc-contracts.md) · [Phase 4 report](phase-4-verification.md) · [Tracking/review contracts](phase-4-contracts.md) · [Award proposal](order-awarding-api-proposal.md) · [Shared contracts](contracts.md) · [Design system](design-system.md) · [Member 3 handoff](member-3-handoff.md) · [Phase 3 report](phase-3-verification.md).

Next: review Phase 6 and obtain approved backend contracts/connection details before separately authorizing Phase 7 integration. No deployment, Git initialization or backend integration was performed.

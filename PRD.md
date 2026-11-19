KaarigarLink — Member 4 Frontend PRD
Version: 1.0
Owner: Member 4 — Frontend Lead, Buyer, Inspector, Admin & QA
Project: KaarigarLink — Job-Work Marketplace for Small Manufacturers
SDG alignment: SDG 9, especially target 9.3
Development approach: Prototyping followed by Incremental Development
Status: Implementation-ready; backend contract pending team approval
1. Product summary
KaarigarLink connects small manufacturing workshops with buyers who need outsourced production. Buyers post manufacturing jobs, view eligible workshop matches, compare quotations, award orders, monitor milestones, see independent quality-control decisions, record simulated payment status, and review completed work. Inspectors assess QC; admins oversee platform operations.

This PRD scopes Member 4's frontend work only, including the shared frontend foundation and buyer, inspector, and admin experiences. Member 3 owns workshop-specific pages; Members 1 and 2 own the backend.
2. Goals and success criteria
- Deliver a responsive, cohesive, accessible application shell for all four roles: buyer, workshop, inspector, admin.
- Implement functional buyer flows from job posting through matching, quotes, award, tracking, QC visibility, and review.
- Implement inspector QC acceptance/rework interfaces and minimal admin operations.
- Provide reusable design tokens, UI components, typed contracts, and mock services for Member 3.
- Keep UI independently demonstrable with realistic mock data until backend endpoints are ready.
- Complete a verifiable end-to-end demo, including success and failure paths.
Acceptance definition: all owned screens render, actions update state or report a real error, role restrictions are represented in UI, tests/build pass, and backend integration does not require redesigning feature pages.
3. Team responsibilities and boundaries
Member	Ownership
1	Backend core: database, authentication, workshop profiles, jobs, matching and invitations
2	Backend workflow: quotes, orders, milestones, QC, simulated payments, reviews, cancellation and admin APIs
3	Workshop frontend: onboarding, profile, invitations, quote submission, milestones, workshop order tracking
4	Frontend foundation, buyer frontend, inspector frontend, admin frontend, integration coordination and end-to-end QA


Member 4 owns src/app/, src/components/, src/styles/, src/types/, shared src/services/, src/features/auth/, src/features/buyer/, src/features/inspector/, and src/features/admin/. Do not implement or overwrite src/features/workshop/; reserve a documented integration point for Member 3.
4. Users and permissions
- Buyer: create/view jobs; view eligible matches and quotes; award an eligible quote; view production and QC; perform permitted cancellation/payment-simulation/review actions.
- Workshop: workshop pages owned by Member 3; Member 4 only supports shared layout, navigation, contracts, and services.
- Inspector: view assigned QC work; submit accept or rework decision with required evidence/notes.
- Admin: view platform metrics and manage permitted workshop/user/order moderation actions.
Client-side guards improve UX but are not security controls; backend must authorize all protected operations.
5. Tech stack
- React + Vite + TypeScript (strict)
- Tailwind CSS + shadcn/ui; Lucide React icons
- React Router for routing
- TanStack Query for remote state
- React Hook Form + Zod for forms and validation
- Vitest + React Testing Library for unit/component tests
- Playwright for end-to-end tests
- Vercel for frontend hosting; backend hosted separately on Render; PostgreSQL on a managed service
Use existing repository conventions if the team already established them. Avoid paid AI services, live payment processing, and real maps API dependencies. Distance scoring belongs to the backend, not the UI.
6. UX and visual system
Direction: polished, trustworthy, industrial-inspired B2B SaaS, optimized for clarity over visual novelty. Define and document one palette, typography scale, spacing system, card/table/form patterns, and consistent responsive sidebar/topbar. Use subtle motion only when it improves feedback.

Shared primitives: buttons, text inputs, selects, date inputs, form field wrappers, dialogs, toast/alert, cards, stat cards, tables, status badges, skeletons, empty states, error states, confirmation dialogs, order timeline, pagination/filter controls.

Accessibility: semantic headings, visible focus, keyboard-operable controls, explicit labels, descriptive errors, sufficient contrast, and status text beyond color.
7. Functional scope and acceptance criteria
FR-01 — App shell, auth UI and role navigation
- Responsive navigation and role-specific menus.
- Login form, mock role login for demo, logout, loading, unauthorized and 404 states.
- Reserve /workshop/* route namespace for Member 3.
- Accept when: buyer/inspector/admin route guards and navigation work in mock mode, and workshop placeholder/handoff does not conflict with later screens.
FR-02 — Buyer dashboard and jobs
- Buyer dashboard with active jobs, quotations, in-production orders, completed orders, and recent activity.
- Job form: title, description, capability, material/specification, quantity/unit, machines/process, deadline, delivery location, optional budget and design-file metadata.
- Jobs list/detail with search, status filtering and validation.
- Accept when: valid mock submission creates a visible job; invalid inputs are rejected; empty/loading/error states are supported.
FR-03 — Workshop matches and invitations
- Display backend-provided ranked matches, capabilities, capacity, location, rating and transparent match explanation.
- No-match state with actionable guidance; invitation state visibility.
- Accept when: match scores are rendered from service data (never fabricated in components) and no-match is handled correctly.
FR-04 — Quotes and awarding
- Show quote details, INR amounts, delivery estimate, status and side-by-side comparison.
- Buyer can initiate permitted award action with confirmation; prevent duplicate submission.
- Accept when: eligible quote can be awarded in mock flow and ineligible actions are blocked.
FR-05 — Buyer order tracking, cancellation, payment status and reviews
- Show order summary, workshop, milestones, progress, QC decision/rework notes/deadline, chronological activity.
- Show simulated payment clearly labeled as simulation; buyer actions only where contract allows.
- Cancellation UI follows backend-defined policy; ratings only after eligibility criteria are met.
- Accept when: successful, rework, cancellation and closed-order states display correctly without arbitrary state changes.
FR-06 — Inspector QC
- Dashboard/list of assigned inspections, detail view, specification/evidence display, accept/rework decision.
- Rework requires reason and applicable deadline; prevent duplicate or unauthorized decisions.
- Accept when: mock QC acceptance and QC-to-rework paths update shared state and buyer tracking.
FR-07 — Admin MVP
- Overview counts and activity; searchable workshop/user lists; order oversight; limited moderation actions with confirmation.
- Accept when: authorized mock admin actions update state and other roles cannot access admin pages.
FR-08 — Integration and QA
- Replace mock service adapters with actual backend requests without rewriting screens.
- Explicit auth, validation, server, and network error handling; no silent fallback to mock success.
- End-to-end scenarios: successful order, no workshop match, QC failed/rework, buyer cancellation after award.
- Accept when: full flow is demonstrated and test/build results are recorded.
8. Routes
Route	Owner	Page
/login	M4	Login / demo access
/buyer/dashboard	M4	Overview
/buyer/jobs	M4	Jobs list
/buyer/jobs/new	M4	Post job
/buyer/jobs/:id	M4	Job detail
/buyer/jobs/:id/matches	M4	Matching results
/buyer/jobs/:id/quotes	M4	Quote comparison
/buyer/orders/:id	M4	Order timeline and status
/buyer/orders/:id/review	M4	Review form
/inspector/dashboard	M4	QC queue
/inspector/inspections/:id	M4	QC decision
/admin/dashboard	M4	Overview
/admin/workshops	M4	Workshop moderation
/admin/orders	M4	Order oversight
/workshop/*	M3	Reserved for workshop frontend


9. Proposed shared data contracts (require backend sign-off)
Core entities: User, Workshop, Machine, CapacitySlot, Job, MatchResult, Invitation, Quote, Order, Milestone, Inspection, PaymentRecord, Review, AuditEvent.

Minimum fields:
- User: id, role, name, email.
- Workshop: id, name, location, coordinates?, capabilities, machines, capacitySlots, rating?.
- Job: id, buyerId, title, description, capability, quantity, unit, deadline, location, status.
- MatchResult: jobId, workshopId, score, explanations, eligibility.
- Invitation: id, jobId, workshopId, status.
- Quote: id, jobId, workshopId, amount, estimatedDelivery, notes, status.
- Order: id, jobId, workshopId, buyerId, status, milestones, qcStatus?.
- Inspection: id, orderId, inspectorId, decision, notes, reworkDeadline?.
- PaymentRecord: id, orderId, simulationStatus.
- Review: id, orderId, rating, comment?.
Order states (proposed): POSTED, QUOTING, AWARDED, IN_PRODUCTION, QC_PENDING, ACCEPTED, REWORK, PAID, CLOSED, CANCELLED. Exact transition rules, including cancellation after award and rework resubmission, must be confirmed by Member 2. Do not independently invent transitions.

Proposed API groups: /api/auth, /api/workshops, /api/jobs, /api/matches, /api/invitations, /api/quotes, /api/orders, /api/milestones, /api/inspections, /api/payments, /api/reviews, /api/admin. Confirm exact HTTP methods, route parameters, pagination, error shapes, and authentication with backend owners on Day 1.
10. Mock-first implementation architecture
frontend/src/
  app/                 # router, providers, app shell
  components/          # shared UI, layout, status, feedback
  features/
    auth/              # Member 4
    buyer/             # Member 4
    inspector/         # Member 4
    admin/             # Member 4
    workshop/          # Member 3; reserved
  services/
    apiClient.ts
    mock/              # realistic fixtures and stateful mock adapter
    adapters/          # mock/real implementations of shared interfaces
  types/               # team-approved shared types
  styles/              # global tokens
Use typed service interfaces so mock and real adapters return compatible results. Mock actions must mutate a coherent state store; avoid isolated page fixtures that contradict one another. Real-mode errors must be surfaced, not silently replaced with mock success. No API secrets in client code.
11. Implementation phases and completion gates
Phase	Scope	Completion gate
0	Inspect repo, bootstrap Vite/TS, tooling, contracts, mock architecture, tokens	Dev server, typecheck, lint and build run; contracts documented
1	App shell, login, role routing, shared UI	Role navigation and guard tests pass; workshop route reserved
2	Buyer dashboard, job form, job list/detail	Mock job creation, validation, filters work
3	Matching and quote comparison/award	No-match, quote comparison and award confirmation work
4	Buyer orders, tracking, cancellation, reviews	Success/rework/cancel/closed UI flows work
5	Inspector QC	Accept/rework decisions update shared mock state
6	Admin MVP	Overview, moderation, access control work
7	Real API integration	Contract mismatches resolved; backend flows tested
8	E2E QA, accessibility, polish, deployment	Verified tests/build, demo and README


Working rule: Codex must inspect existing files, implement only the current phase, run available checks, report actual results and stop for approval. Avoid unrequested rewrites of other modules.
12. Four-day team execution plan
- Day 1: Agree API list and database fields with backend team. Member 4 completes Phase 0 and starts Phase 1. Mock service contracts and workshop handoff are ready.
- Day 2: Prioritize buyer jobs, matching and quote workflows. Member 3 can independently build workshop pages using shared components and mocks.
- Day 3: Complete buyer order tracking and inspector QC; integrate real endpoints as available. Run first full end-to-end flow.
- Day 4: Freeze features, test success and error flows, fix bugs, deploy, document, rehearse demo. Keep admin MVP minimal if schedule is tight.
Phases 0–8 are logical gates, not one day each. Work may overlap where dependencies allow.
13. Test plan
- Unit/component: form validation, filters, status badges, route guards, quote selection, QC decision validation.
- Integration: mock adapters and real API response/error handling.
- E2E: (1) successful order, (2) no matching workshop, (3) QC rejection and rework, (4) cancellation after award.
- Non-functional: responsive layouts, keyboard navigation, loading/empty/error states, no leaked secrets, no unsupported state transitions.
- Required evidence: terminal output of typecheck/lint/tests/build, screenshots of major screens, bug list, and demo script.
14. SEPM CCA evidence alignment
Maintain artifacts for the team's CCA submission: justified Prototyping → Incremental model, requirements and scope, WBS/Gantt, risks, DFD Levels 0–2 (including Match and Invite decomposition), data dictionary, UML sequence diagram with alternate flows, architecture and deployment, GitHub branches/commits/PRs, project board, ethics (privacy, fairness, IP, transparent fees, accessibility), and each member's demonstrable contribution. Member 4 should ensure frontend screenshots and actual workflows align with the report diagrams.
15. Out of scope
- Real payment processing or financial settlement.
- Live maps/geocoding API or frontend-side matching algorithm.
- AI chatbot or paid LLM features.
- Workshop-specific pages owned by Member 3.
- Full enterprise analytics, messaging, real-time notifications or complex inventory management.
16. Dependencies and risks
- Backend API drift: agree schema and endpoint contract on Day 1; log changes explicitly.
- Member 3 joins late: reserve routes and types; provide starter README, shared UI and mock services.
- Inconsistent UI: single design system owned by Member 4; avoid competing styles.
- Order state mismatch: backend Member 2 is source of truth; test forbidden transitions.
- Limited time: prioritize job → match → quote → award → QC → close; defer admin extras.
- Deployment surprises: deploy a minimal shell early and verify environment variables and CORS.
17. Definition of done
A feature is done only when it has: implemented UI, functional mock or real data behavior, appropriate validation, loading/empty/error states, responsive layout, keyboard accessibility, tests where meaningful, no known TypeScript/build failures, documented API assumptions, and a reviewed commit. Final acceptance requires a coherent demo spanning the roles and four specified E2E scenarios.
18. Instructions for Codex
Read this PRD before editing code. Inspect the repository and report existing architecture. Implement one phase at a time, beginning with Phase 0. Use existing shared components and repository conventions. Do not implement Member 3's workshop pages. Keep mock services API-ready and coordinate contracts with backend owners. After each phase, summarize changed files, executed commands, actual test results, open questions and next recommended phase; wait for approval before proceeding.
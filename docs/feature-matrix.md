# Feature completeness matrix (after M12)

Status reflects **live mode**: a feature is *Implemented* only when it has backend endpoints, authorisation and a connected frontend. Mock mode keeps the original demo behaviour.

> **Verified in M13 (2026-11-22):** the migration history has no drift against the schema, and every automated check passes: both typechecks, lint, the build, the backend and frontend test suites, and the mock-mode and live-mode browser tests. The live journeys cover every role's main workflow against a real backend and PostgreSQL; see [testing.md](testing.md). Manual exploratory browser testing has not been done.

## Summary

| Area | Status |
|---|---|
| Authentication and account management | Implemented, except password reset and email verification (deliberately deferred) |
| Jobs and matching | Implemented |
| Invitations and quotes | Implemented |
| Orders and milestones | Implemented |
| Inspections and QC | Implemented |
| Payments and refunds | Implemented (simulated only, by design) |
| Profiles and workshop capabilities | Implemented |
| Documents and evidence | Implemented (local disk storage, no virus scan) |
| Audit history | Implemented (from M12 onwards) |
| Notifications | Implemented (in-app only) |
| Buyer workflows | Implemented |
| Workshop workflows | Implemented, except self-service workshop creation (Partially implemented) |
| Inspector workflows | Implemented |
| Admin workflows | Implemented (verification and assignment); user moderation deliberately deferred |

## By area

### Authentication and account management

| Feature | Status | Notes |
|---|---|---|
| Register (buyer, workshop, inspector), login, logout | Implemented | Admins are created by seed/DB only (backend rule) |
| Session restore after refresh, expired-session handling | Implemented | JWT in sessionStorage, `/auth/me`; a 401 signs out with a notice |
| Edit name and phone | Implemented | `PATCH /auth/me`, all roles |
| Change password, signing out other sessions | Implemented | `PATCH /auth/me/password`; earlier tokens are rejected immediately (per-user token version, M13) |
| Password reset, email verification | Deliberately deferred | Needs an email provider |
| Role-based access | Implemented | Enforced by the backend; the UI only hides controls |

### Jobs and matching

| Feature | Status | Notes |
|---|---|---|
| Post, list and view jobs | Implemented | Free-text capability mapped to the backend process enum |
| Publish a draft job or cancel an unawarded job | Implemented | `PUT /jobs/:id { status }`; awarded work is cancelled through the order |
| Edit job details after posting | Partially implemented | The backend supports `PUT /jobs/:id`; the frontend has no edit form for the brief |
| Live ranked matching with explanations | Implemented | Closed jobs show invitation snapshots, labelled |
| Exact job statuses | Implemented | |

### Invitations and quotes

| Feature | Status |
|---|---|
| Invite workshops; accept or decline invitations | Implemented |
| Submit, edit (version-checked, 409 on conflict) and withdraw quotes | Implemented |
| Compare quotes and award one | Implemented |
| Expired invitations and cancelled quotes shown distinctly | Implemented |

### Orders and milestones

| Feature | Status |
|---|---|
| Order start (workshop), complete and cancel (buyer) | Implemented |
| Milestones: plan, start, complete, approve, rework restart | Implemented |
| Milestone editing (pending milestones) | Partially implemented (backend `PATCH /milestones/:id` exists; no edit form in the UI) |
| Order history | Implemented (audit) |

### Inspections and QC

| Feature | Status |
|---|---|
| Inspector assignment, reassignment and history (admin) | Implemented |
| Assigned-only access | Implemented |
| PASSED, FAILED and REWORK_REQUIRED, with an optional milestone target | Implemented |
| Structured checklist; private server drafts | Implemented |
| QC gate on order completion | Implemented |

### Payments and refunds

| Feature | Status |
|---|---|
| Create payments and simulate their result (buyer); cumulative limit | Implemented (simulated) |
| Cancellation fails pending payments and reports `refundDue`; explicit refund (workshop or admin) | Implemented (simulated) |
| Real payment gateway | Deliberately deferred (PRD: no live payment processing) |

### Profiles and workshop capabilities

| Feature | Status |
|---|---|
| Buyer profile | Implemented |
| Workshop profile, machinery, capabilities, capacity; verification status and completeness | Implemented |
| Workshop creation for a WORKSHOP account without a profile | Partially implemented (registration always creates the profile; the backend `POST /workshops` has no UI) |

### Documents, audit history and notifications

| Feature | Status | Notes |
|---|---|---|
| Design files on jobs: upload, list, download, delete | Implemented | Local disk storage, validated |
| Inspection evidence on orders, linked to the submitted inspection | Implemented | |
| Virus scanning, cloud storage | Deliberately deferred | `StorageBackend` is the extension point |
| Append-only audit history; admin audit page; order history | Implemented | Events start with M12; some edits are not audited (see [live-integration.md](live-integration.md)) |
| In-app notifications: bell, unread count, mark read | Implemented | |
| Email, SMS or push notifications | Deliberately deferred | Out of scope for M12 |

### Admin

| Feature | Status |
|---|---|
| Overview counts, directory lists, record details | Implemented |
| Workshop verification | Implemented |
| User suspension, role changes, deletion | Deliberately deferred (no backend contract) |

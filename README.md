# KaarigarLink Team

Manufacturing marketplace with a separately owned backend and a React/Vite/TypeScript frontend completed through Phase 6.

- `backend/`: backend team ownership. See [API documentation](docs/API.md) and the backend package scripts.
- `frontend/`: shared app shell, mock authentication, buyer workflows, inspector QC, and read-only admin oversight.
- `docs/`: shared documentation and [repository cleanup report](docs/repository-cleanup.md).
- Workshop screens belong to Member 3 on `origin/feature/member-3-workshop-frontend`. This branch keeps only the workshop placeholder; route registration is centralized in `frontend/src/app/router.tsx`.

## Frontend development

Use Node.js 22.12 or newer. From `frontend/`:

```sh
npm ci
npm run dev
```

The default service mode is mock. `.env.example` contains only the mock mode setting; copy it to a local `.env` if needed. Client-side environment variables are public: never put credentials in `VITE_*` variables. Demo authentication is not production authorization.

## Frontend checks

```sh
npm run typecheck
npm run lint
npm run test -- --maxWorkers=2
npm run build
npm run test:e2e -- --workers=2
```

Install the Playwright Chromium browser with `npx playwright install chromium` if it is not already available. The existing Playwright configuration starts the development server on port 5173. On Windows with script execution restrictions, use `npm.cmd` and `npx.cmd`.

Tests stay colocated with source under `frontend/src/`, with browser tests in `frontend/e2e/`. Preserve package lockfiles and use `npm ci` for reproducible installs. Generated caches, dependencies, builds, browser reports, and local environments are ignored.

## Integration boundaries

Backend deployment configuration in `render.yaml` remains backend-owned. The frontend has no approved live backend adapter yet. Do not infer award, payment, moderation, or workshop mutations from the mock UI.

The reviewed [PRD](PRD.md), [frontend walkthrough](docs/frontend-overview.md), [shared contracts](docs/contracts.md), [design system](docs/design-system.md), [Member 3 handoff](docs/member-3-handoff.md), phase 0-6 verification reports and their 58 curated evidence screenshots have been restored from the original local project. See the [Phase 6 verification](docs/phase-6-verification.md) and [admin contracts](docs/phase-6-admin-contracts.md) for the latest frontend scope. Earlier phase reports are historical snapshots; the cleanup report records the repository state before this documentation restoration and first frontend commit.

## Workshop integration: Phase 8B.1

On integration/workshop-frontend, workshop routing and compilation now use the existing shared application foundation. /workshop redirects to /workshop/dashboard; invitations, orders, profile, settings, onboarding and record-detail routes are guarded workshop workspaces. They deliberately show disabled states until shared data, ownership and business rules are reconciled. No standalone workshop session, provider, data, mutations or global CSS is activated. Buyer award execution stays disabled.

See [Phase 8B.1 verification](docs/phase-8b1-verification.md) and [workshop boundaries](frontend/src/features/workshop/README.md). Buyer, Inspector and Admin functionality remains through Phase 6. This phase adds no dependency, toolchain, shared entity or backend change.

## Workshop shared data: Phase 8B.2

Workshop routes now show owner-scoped canonical dashboard metrics, invitations/job briefs/quotation history, assigned orders/milestones/submitted QC/rework, profile/capacity, account information and onboarding linkage. All workshop business writes remain disabled; no standalone provider, fixtures or storage is activated. See [read contracts and domain mapping](docs/phase-8b2-workshop-contracts.md) and [Phase 8B.2 verification](docs/phase-8b2-verification.md). The Phase 8B.1 notes above describe the preceding routing-only state.

## Workshop workflows: Phase 8B.3

Owned invitation accept/decline and quotation submit/edit/withdraw are now confirmed, validated local mock commands over the existing shared store. Buyer comparison and Admin oversight see the same Quote records. The preceding Phase 8B.1/8B.2 sections describe historical states; the workshop placeholder statement no longer applies on this integration branch.

Buyer award, order creation, production/rework/QC submission, workshop payment/closure, profile/settings/onboarding writes remain disabled pending compatible contracts. No backend endpoint, standalone provider, dependency or shared entity change was introduced. See the [command compatibility matrix](docs/phase-8b3-contract-matrix.md) and [verification report](docs/phase-8b3-verification.md) for exact scope, tests and limits.

## Phase 9A shared visual system

The dedicated design/phase-9a-ampliflow branch introduces verified Ampliflow-inspired typography/color and shared shell/component styling, preserving all four-role workflows. Exact source values, app adaptations, fonts/licenses and motion rules are documented in [the Phase 9A specification](docs/phase-9a-design-specification.md). The existing /foundation route includes an isolated component specimen section; it performs no business mutation.

See [Phase 9A verification](docs/phase-9a-verification.md) for actual checks, visual evidence and limits. No backend/domain/service change, new npm dependency or activation of blocked commands is part of this phase. Detailed marketplace browsing and individual business-page redesigns remain for later phases.

## Phase 9A.5 public entry

Anonymous visitors now see the public marketplace homepage at `/`. Its capability categories, five-stage workflow, participant sections and independent-quality explanation describe the existing demo without publishing private records or promising disabled transactions. Navigation anchors work on desktop and in the keyboard-accessible mobile dialog. All entry CTAs use `/login`; choose an existing demo role there.

Authenticated `/` and `/login` visits still redirect to the current role dashboard. Existing protected routes, deep links, sessions and business permissions are preserved. The page reuses Phase 9A fonts, tokens, components and reduced-motion-aware transitions, with no new dependency or business contract.

See [Phase 9A.5 verification](docs/phase-9a5-verification.md) for actual checks, responsive evidence, checker limitations and remaining Phase 9B work.

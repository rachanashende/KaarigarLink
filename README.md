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

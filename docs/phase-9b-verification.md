# Phase 9B verification

Date: 21 November 2026. Branch: `design/phase-9a-ampliflow`.
Base and unchanged HEAD: `803b06c8e1f728e13d14504d1b9a1111313e2072`.

## Scope and pages

| Route | Presentation and usability changes |
| --- | --- |
| /buyer/dashboard | Editorial welcome, prominent manufacturing-job CTA, existing four canonical metrics, quotation activity, orders awaiting QC/rework, linked job pipeline and retained jobs/deadlines/audit activity |
| /buyer/jobs | Existing URL-backed search/status/sort, submitted-quote activity per job and contextual matching/comparison actions |
| /buyer/jobs/new | Three native section links, consistent field hierarchy, wider desktop brief and stacked mobile fields; original required fields, validation, metadata and one submission preserved |
| /buyer/jobs/:id | Editorial record header, square brief/delivery/reference sections and existing contextual next actions |
| /buyer/jobs/:id/matches | Job requirement summary, responsive two-column workshop catalog, source rank/score, eligibility, capability/machinery and explanations before invitation actions |
| /buyer/jobs/:id/quotes | Job summary, factual amount/delivery ranges, conspicuous award blocker, existing sortable table, three-quote selection and stacked/side-by-side comparison with factual differences |
| /buyer/orders | Structured summaries and canonical QC column alongside existing lifecycle, delivery and production; existing filters/sort/reset |
| /buyer/orders/:id | Consistent order header/summary, existing production timeline, inspector findings/rework, separate payment uncertainty and review eligibility |
| /buyer/orders/:id/review | Consistent editorial header and review form; existing confirmation, validation, duplicate protection and CLOSED-only mock eligibility |

No routes were added or removed. Public homepage/login and existing protected deep links remain. The sidebar retains its established Buyer overview / Manufacturing jobs / Manufacturing orders labels and adds Post Job. They correspond to dashboard, jobs, posting and orders; matching/quotes remain contextual job tabs. Jobs is not highlighted alongside Post Job on the creation page.

## Component architecture and design

See [design plan](phase-9b-buyer-design.md). BuyerHeader composes existing SectionLabel and PageHeader; JobRequirementSummary reuses Job and existing formatting. The existing JobsTable gains optional canonical Quote records and contextual navigation buttons; quoteRange is a small tested read projection over existing WorkshopQuote records. No service or domain interface changed.

One buyer-only shell class scopes buyer.css, loaded from the buyer header chunk. Public and other-role visual tokens are unchanged. Existing shared buttons, tables, badges, stats, tabs, form fields, loading/error/empty states and native dialogs remain in use. Inter, Geist Mono, cobalt #2F37D9, ink #0D0F14, slate #51556A and white are preserved. Interface content stays at operational sizes; page openings use 34-64px editorial type and a selective cobalt italic dashboard line. No new dependency, imagery, font or separate visual system.

Existing page/control/dialog/tab motion is retained with the established timing tokens. Buyer heading entrance is bounded; fine card-border feedback answers hover. No new observers, loops, autoplay or scroll effects. Reduced-motion CSS leaves content visible and disables transitions/animations.

## Data and authorization boundaries

All metrics, quotation counts, attention lists, source ranks, ratings, machines and published capacity come from existing owner-scoped mock records. The job list reuses the dashboard read service for quotations; when unavailable, the count says Unavailable instead of zero. Dashboard activity prioritizes submitted offers and explicitly says quote timestamps are not supplied; it makes no invented recency claim.

Quote ranges include all listed statuses, with an explicit warning. Selected differences compare amounts and delivery dates only, handle ties, and are not award recommendations. There is no quote-created timestamp, so delivery commitments are shown rather than invented lead-time days. No unsupported terms, certifications, distance or live availability are added. Discovery preserves the service ranking without speculative filters.

The canonical buyer-order service provides no separate payment record. PAID is reported only as the historical lifecycle label; other states are never inferred to be paid from QC, production or closure. All existing job creation, invitation, review and confirmation handlers are preserved. Final award/order creation, production, QC, payment and closure actions remain blocked or unavailable. Review-award dialogs retain the disabled Award order button and blocker. No backend adapter or new business mutation was introduced.

## Verification results

- Typecheck: PASS, exit 0.
- ESLint: PASS, zero warnings.
- Focused buyer unit/component regressions: PASS, 36 tests in three files, including six new Phase 9B tests.
- Complete Vitest: PASS, 393 tests / 28 files in 76.88 seconds. All 387 baseline tests retained.
- Production build: PASS, exit 0. Initial build: 1832 modules in 5.41 seconds; final rebuild after CSS-only refinements: 1832 modules in 6.68 seconds. Final typecheck and ESLint also passed, exit 0.
- Focused Chromium: PASS, 11/11 tests in 50.6 seconds.
- Full Chromium: PASS, exit 0; 78/78 tests in 5.8 minutes. All 67 baseline cases retained; 11 added. Only the existing NO_COLOR/FORCE_COLOR environment warning was emitted.

Commands run from frontend: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test -- --maxWorkers=1`, `npm.cmd run build`, and `npm.cmd run test:e2e -- --workers=2 --output=<temporary directory>`. New focused tests live in BuyerDesign.test.tsx and buyer-design.spec.ts. Heavy unit/browser runs were sequential to avoid previous CPU-contention timeouts. Existing Vite server on port 5173 was reused; no unrelated process was stopped.

Early checks found an unsupported exact option in a new Testing Library query (removed), and the existing job-row test correctly detected a second link where it expected one. The original job title link was retained and the contextual next step became a separate action button; original assertions were not weakened. The first browser interaction test attempted to click a rejected quote's disabled review button; it was corrected to the eligible workshop row, leaving rejection and final-award restrictions intact. Subsequent focused checks passed. One initial npm invocation used the root without package.json and was rerun from frontend. No baseline test file was modified or removed.

## Responsive and accessibility findings

Every major route was checked at 1440, 1024, 768, 375 and 320px. New Chromium assertions found no document horizontal overflow, uncaught page errors or business-storage writes from route browsing. The shell navigation remains keyboard accessible. Tables use existing labelled, focusable horizontal-scroll regions; this is intentional within the table, separate from document overflow. Workshop discovery, requirement summaries, filters, form fields and selected-quote comparison stack at narrow widths.

Native form-section anchors now target focusable headings. Tests exercise direct mobile Post Job access, focus restoration through the shared menu, first-invalid-field focus, aria-invalid, pipeline filter links, comparison, disabled final award and reduced motion. Existing suites cover submission/review/invitation validation, loading/errors/empty states, guard denial and session restoration. Statuses retain visible text; color is supplementary.

Calculated contrast from the unchanged tokens: cobalt/white 7.87:1, slate/white 7.35:1, slate/subtle surface 6.92:1, ink/white 19.17:1. Existing controls retain immediate focus rings. This is targeted browser/keyboard/visual review, not a screen-reader or cross-browser certification.

Desktop/mobile screenshots were manually inspected for alignment, wrapping, hierarchy and consistency with Phase 9A.5. Review refinements aligned match-score columns, reduced mobile metric whitespace and tightened desktop order-table cells. Selected-comparison evidence scrolls to the document top to avoid capturing the sticky sidebar at an intermediate scroll position.

Installed frontend-design and taste guidance informed typography, alignment, restraint and visual review. The marketing taste gate was not rerun on authenticated operational pages; no timed-out or failed checker is claimed as a pass. Its full-screen/photo/effect rules would conflict with this phase's data-dense app brief.

## Screenshot evidence

Final curated PNGs under docs/evidence (desktop 1440px, mobile 375px):

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Dashboard | [1440](evidence/phase-9b-dashboard-1440.png) | [375](evidence/phase-9b-dashboard-375.png) |
| Jobs | [1440](evidence/phase-9b-jobs-1440.png) | [375](evidence/phase-9b-jobs-375.png) |
| New job | [1440](evidence/phase-9b-post-job-1440.png) | [375](evidence/phase-9b-post-job-375.png) |
| Job brief | [1440](evidence/phase-9b-job-detail-1440.png) | [375](evidence/phase-9b-job-detail-375.png) |
| Matching | [1440](evidence/phase-9b-matches-1440.png) | [375](evidence/phase-9b-matches-375.png) |
| Quotes | [1440](evidence/phase-9b-quotes-1440.png) | [375](evidence/phase-9b-quotes-375.png) |
| Selected comparison | [1440](evidence/phase-9b-selected-comparison-1440.png) | [375](evidence/phase-9b-selected-comparison-375.png) |
| Orders | [1440](evidence/phase-9b-orders-1440.png) | [375](evidence/phase-9b-orders-375.png) |
| Order tracking | [1440](evidence/phase-9b-order-tracking-1440.png) | [375](evidence/phase-9b-order-tracking-375.png) |
| Review | [1440](evidence/phase-9b-order-review-1440.png) | [375](evidence/phase-9b-order-review-375.png) |

Raw browser artifacts remain in system temporary directories. Existing evidence is preserved.

## Protection, Git status and limits

Backend hash remains `aa99d866532a2f424545e4e07451e72932996467`; backend worktree comparison returned 0. Both original contributor commits d4d32f8 and 4b10f9c remain ancestors (exit 0). Services, shared types, fixtures, authentication, router, package locks and workshop/inspector/admin business modules are unchanged. AppShell changes only the buyer class and buyer navigation.

Git: 38 changed paths: 11 modified tracked files and 27 untracked files (two documentation files, five new frontend source/test/style files and 20 curated PNGs). Nothing is staged. HEAD remains 803b06c8e1f728e13d14504d1b9a1111313e2072. No staging, commit, push, merge, branch switch or history rewrite occurred. Git whitespace checks passed; a changed-file private-key/token-pattern scan found no matches. Generated build/browser/cache outputs are excluded from the pending files.

Limitations: academic mock services, supplied matching results for new jobs, absent quote timestamps and separate payment records, intentionally unavailable award/lifecycle operations. No live business transaction is simulated. Wider tables scroll at narrow widths; no unsupported responsive data reduction hides terms or status. Future role-page design and live backend integration require separate scope.

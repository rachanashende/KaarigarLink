# Phase 3 verification — Matching & quotation comparison

Date: 18 November 2026 (Asia/Calcutta). Member 4 frontend scope only.

## Outcome and explicit award blocker

Buyer matching, invitation and quotation UI are implemented and verified. **Award execution is not implemented:** inspection found no award command, approved request/response contract or transition policy. The Phase 3 request explicitly instructed documenting that blocker instead of inventing a workflow.

Eligible submitted quotes can open a confirmation review with workshop, INR amount, delivery commitment, notes and status. The final Award order button is disabled with an explanation. Rejected/withdrawn/ineligible/already-awarded cases cannot initiate review. No award success, order creation or status transition is claimed. The PRD successful-award criterion remains dependent on Member 2.

## Inspection and preserved scope

Read PRD.md completely, README.md, Phase 2 verification, shared contracts/services/store, router/shell, existing components/tests and Member 3 handoff before editing. Reused the installed frontend-design/taste direction and Ponytail approach.

Existing job/auth/dashboard flows, entity types, design tokens, shared components, package manifest/lockfile and workshop route behavior are preserved. No workshop feature directory exists or was modified. No backend code or external API integration was added.

## Screens and routes

| Route | Implementation |
| --- | --- |
| /buyer/jobs/:id/matches | Supplied ranked results, explanations, eligibility/profile/capacity/rating data, invitation states/actions |
| /buyer/jobs/:id/quotes | Scoped quotation table, sort/selection/comparison, quote/profile inspection, blocked award confirmation |
| /buyer/jobs/:id | Existing brief gains job-scoped navigation and real links to both new pages |

Both new pages are lazy-loaded through the existing guarded router. Breadcrumbs identify the active view. Existing routes remain available.

## Functional behavior

- Match order, scores, explanations and eligibility come directly from the service fixture array; no scoring, distance or matching algorithm runs in components or adapters.
- Each result shows workshop/location/capabilities/machines/capacity/rating when supplied. Missing ratings are explicitly unknown; no rating input/review system exists.
- No-match results stay empty. Unseeded/new jobs do not acquire fabricated recommendations.
- Invitations require owned open jobs and eligible supplied matches. Confirmation precedes one atomic PENDING invitation/event append. Job/quote/order states are unchanged.
- Duplicate sends, including concurrent calls, return the existing job/workshop invitation. Accepted/declined records are not resent or reopened.
- Failed invitations display errors inside the dialog without success feedback; the shared cache refreshes after success.
- Quotes are filtered by owned job before workshop joins. Zero, one and multiple results are handled.
- Sorting supports amount ascending/descending and earliest delivery. Up to three quotations can be selected; one/two/three-column layouts show the source terms and notes.
- Native checkbox/link/button controls, dialogs, focus return, selection feedback and scrollable table regions support keyboard use.
- Award review cannot execute a missing service or mutate the store.

## Service and contract changes

Added BuyerMarketplaceService, extended by existing BuyerService:
- getMatches(buyerId, jobId)
- inviteWorkshop(buyerId, jobId, workshopId)
- getQuotes(buyerId, jobId)

Added read view contracts BuyerMatchesData/WorkshopMatch and BuyerQuotesData/WorkshopQuote. They reuse existing entities and expose invitation/review availability reasons. canReviewAward means review availability only, not backend award authorization. There is no award method.

Existing buyer ownership logic was extracted once into mockBuyerAccess and reused by old/new methods. Missing/private jobs remain indistinguishable. Missing workshop references surface a real error rather than a successful placeholder.

Mock invite policy is provisional: POSTED/QUOTING, supplied eligible match, no existing order/awarded quote, no prior invitation. New status PENDING; existing PENDING/ACCEPTED/DECLINED vocabulary unchanged. Actual backend authorization and policy approval remain required. No endpoint or HTTP method was invented.

Member 1 must approve matching score/rank/rating conventions, invite eligibility/response semantics and exact APIs. Member 2 must approve award eligibility, transitions, stale-quote handling, concurrency/idempotency and error/response contracts before execution can be enabled.

## Mock data

Original four job IDs and original workshop identity remain. Seed now has seven synthetic users, four workshops, five fixed match records, four historical invitations and four quotes:
- Job-1: four ranked records, three eligible; Deccan Toolcraft initially uninvited. Three quotes, two submitted and one rejected.
- Job-2: one eligible match and one submitted quote.
- Job-3: zero matches and quotes.
- Orders remain empty.

The original workshop gains one CNC mill/rating to support coherent fixture explanations. Rating values are read-only demo data. Three submitted quotes now appear in the existing dashboard count. Business state still resets on full reload; identity session behavior is unchanged.

## Files created

Paths below are relative to frontend/:
- src/services/marketplace.ts and marketplace.test.ts.
- src/services/adapters/mockBuyerAccess.ts and mockMarketplace.ts.
- src/services/mock/marketplaceFixtures.ts.
- src/features/buyer/JobWorkspaceNav.tsx, WorkshopDetails.tsx, MatchesPage.tsx.
- src/features/buyer/quoteModel.ts, QuoteDialogs.tsx, QuotesPage.tsx, Marketplace.test.tsx.
- e2e/marketplace.spec.ts.

At workspace root: docs/phase-3-verification.md and seven docs/evidence/phase-3-*.png captures.

## Files modified

- frontend/src/services/jobs.ts: additive marketplace service interface.
- frontend/src/services/adapters/mock.ts: shared access helper and same-store marketplace methods.
- frontend/src/services/mock/fixtures.ts: merged marketplace fixture collections.
- frontend/src/features/buyer/queries.ts: scoped query hooks.
- frontend/src/features/buyer/JobDetailPage.tsx: job navigation and next actions.
- frontend/src/features/buyer/Buyer.test.tsx: existing pending-quote expectation now derives from populated fixture count.
- frontend/src/app/router.tsx and AppShell.tsx: central route registration/breadcrumbs only.
- frontend/src/test/setup.ts: 5-second async render wait for lazy routes/Query updates.
- frontend/e2e/buyer.spec.ts: larger total budget for its existing twenty-viewport/page capture batch; assertions unchanged.
- README.md, frontend/src/features/buyer/README.md, docs/contracts.md, docs/design-system.md and docs/member-3-handoff.md.

No entity/type file, authentication implementation, mock store, shared UI primitive, token/style file, dependency or workshop feature file changed.

## Actual checks and results

Ran from frontend/ using npm.cmd due PowerShell policy. Vite test/build/browser runs used approved filesystem access as in prior phases. Heavy checks were finally run sequentially with fewer workers.

| Command | Final actual result |
| --- | --- |
| npm.cmd run typecheck | PASS, exit 0 |
| npm.cmd run lint | PASS, zero warnings, exit 0 |
| npm.cmd run test -- --maxWorkers=2 | PASS, 11 files / 110 tests, 31.27s, exit 0 |
| npm.cmd run build | PASS, 1782 modules, Vite 11.18s, no warnings, exit 0 |
| npm.cmd run test:e2e -- --workers=2 | PASS, all 21 Chromium tests, 1.0 minute, exit 0 |
| Vite dev server | Served through the existing Playwright webServer, then stopped |

Main JS 499.64 kB / gzip 156.62 kB; MatchesPage chunk 5.63 kB, QuotesPage 9.48 kB; CSS 27.59 kB / gzip 6.22 kB. Existing Zod diagnostic handling is unchanged. Playwright's NO_COLOR/FORCE_COLOR environment notices remain non-failing.

All previous 83 unit/component tests and 16 browser tests remain. One expected dashboard count was generalized for the new quote fixtures; no test was skipped or deleted.

### Coverage and findings

New checks cover supplied rank/explanations, empty results, related profile data, scoped quote joins, zero/one/multiple quotes, immutable sorting, comparison selection/limit/clear, invite confirmation/failure/idempotency, concurrent duplicates, ownership/role restrictions, closed/awarded/rejected/withdrawn/ineligible cases, bad quote amount/date review prevention, missing references, loading/errors and the explicit absence of award execution.

Browser tests exercise profile/quote dialogs, confirmation cancellation, successful double-click-safe invitation, persisted in-memory invitation state on route return, quote selection/sort/detail inspection, disabled award review execution, safe empty/unavailable cases and other-role denial. Responsive checks run at 1440, 1024, 768, 390 and 320px with document-overflow assertions; keyboard checks cover checkboxes, table scrolling, modal Tab/Escape and focus return.

Earlier runs did fail and were resolved/recorded:
- Initial unit run: 105 passed / 1 lazy-import render wait failure. A later expanded run: 109 passed / 1 existing lazy detail wait failure. Shared test async wait is now 5 seconds; assertions were retained. Final 110 passed.
- First browser run with four workers plus a simultaneous build: 15 passed / 6 page-load or overall test timeouts. The build was interrupted; no success was claimed for it.
- Two-worker rerun: 19 passed / 2 failures, one overall budget on a batch of twenty page/viewport cases and one new exact-text locator that included an adjacent machine-process label. Locator corrected; the two multi-viewport screenshot tests use Playwright slow-test budgets while retaining individual assertions. Final full run: 21 passed.
- Strict TypeScript caught a test-only union Promise inference after a loading test was parameterized; corrected with Promise<never>, then build/typecheck passed.

No unresolved automated failure remains. These results do not replace an accessibility/security audit or establish a backend award flow.

## Screenshots reviewed

Final actual captures were reviewed for alignment, text wrapping, table overflow, compact workshop facts, comparison column widths and modal readability:
- [Matches desktop](evidence/phase-3-matches-1440.png)
- [Matches mobile](evidence/phase-3-matches-390.png)
- [Quotes desktop](evidence/phase-3-quotes-1440.png)
- [Quotes mobile](evidence/phase-3-quotes-390.png)
- [Comparison desktop](evidence/phase-3-comparison-1440.png)
- [Comparison mobile](evidence/phase-3-comparison-390.png)
- [Award review/blocker](evidence/phase-3-award-review.png)

No competing palette, gradients, decorative chart or animation system was added. Marketing-page visual gates remain outside this operational-app scope.

## Member 3 impact and limitations

Workshop routes/directory remain reserved. Existing Invitation/Quote/Workshop shapes and original workshop demo identity are unchanged. The shared store exposes newly pending invitations through existing list reads. Workshop acceptance/decline and quote submission are still Member 3 work; buyer invitations never generate quotes. The handoff records additional demo accounts/status rules and the award blocker.

Other limits: fixed synthetic recommendations/quotes; no live matching engine, backend authorization, real upload, persistence beyond memory, cross-browser or assistive-technology audit, deployment or security audit. Sorting is client-side. Demo actor IDs are not trusted authorization. No production milestones, QC, payments, ratings input or admin operations were implemented.

No Git metadata exists and no commits were made.

## Recommended next step

Obtain/approve the Member 1 invite/matching contract and Member 2 award command/transition contract, then enable and verify the remaining successful-award criterion. After review, Phase 4 is buyer order tracking/cancellation/reviews. Stop here; do not start the next phase without Member 4 approval.

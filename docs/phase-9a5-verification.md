# Phase 9A.5 verification

Date: 21 November 2026. Branch: `design/phase-9a-ampliflow`.
Base/unchanged HEAD: `d70f7f948ee6df7fcd9c02d6f351d3e80e2d1daf`.

## Implemented scope

The anonymous `/` route now lazy-loads a public landing page. Authenticated visits to `/` and `/login` retain the existing role dashboard redirects. `/login` remains the sole entry for every public CTA; it does not register users, auto-select a role or execute a protected action. Existing Buyer, Workshop, Inspector and Admin routes, ownership rules, session restoration, providers and deep links remain intact. The login wordmark returns to `/`; a heading-level fix and white accent keep its existing UI consistent and accessible.

The public page contains its responsive navigation, supplied editorial hero, four seed-supported capability categories, five-stage workflow, Buyer/Workshop/Inspector participant sections, independent inspector quality explanation, final CTA and functional footer. Admin is available only through the existing login. Public content imports no fixtures or services; tests verify capability provenance against seeded jobs/workshops. Anonymous rendering makes no protected `data.list` call and creates neither a session nor persisted business data. Existing mock seed data is still part of the demo application bundle: this is not server-enforced privacy or production authorization.

The page uses the existing Inter/Geist Mono files, `#2F37D9`, `#0D0F14`, `#51556A`, white, shared EditorialHeading/SectionLabel/Button/Dialog, thin rules and rectangular actions. Layout styles are scoped with `public-` classes; shared tokens and authenticated layouts are unchanged. No dependency, package lock, font asset, domain contract, service, backend or business command changed.

Hero entrance, hover feedback, small capability-link movement and one-time section reveals reuse Phase 9A timing/keyframes. Content is visible before the observer runs, and reduced motion bypasses the reveals and disables page animation/transitions. No autoplay, scroll-jacking or additional animation library.

## Routing and accessibility checks

New coverage checks anonymous root access, real capability provenance, all entry CTAs, all four demo roles, authenticated root/login redirects, restoration, role denial, protected anonymous access and record deep links. Mobile Chromium coverage checks the skip link, initial dialog focus, forward/backward focus containment, Escape/restoration, anchor focus/visibility and closing the menu at the desktop breakpoint. Native shared dialog behavior is preserved.

Responsive checks at 1440, 1024, 768, 390 and 320 pixels found no document horizontal overflow or uncaught page errors. Screenshots were visually reviewed for headline wrapping, readable spacing, working CTA placement, table-free public content and the existing login at 320 pixels. Body slate on the muted surface measures approximately 6.92:1, above WCAG AA normal-text contrast; the taste checker asks for a stricter 7:1. This is focused keyboard/visual verification, not a full assistive-technology certification.

## Executed checks

- `npm.cmd run typecheck`: PASS, exit 0.
- `npm.cmd run lint`: PASS, exit 0, zero warnings.
- `npm.cmd test -- --maxWorkers=1`: PASS, 27 files / 387 tests; 121.85 seconds. All 371 baseline cases retained; 16 added.
- `npm.cmd run build`: PASS, exit 0; Vite built 1829 modules in 12.80 seconds, including the lazy landing page chunk.
- Focused `npm.cmd run test:e2e -- --workers=1 --output=<temporary path> e2e/landing.spec.ts`: PASS, 9/9 Chromium cases, 31.2 seconds.
- `npm.cmd run test:e2e -- --workers=2 --output=<temporary path>`: PASS, exit 0; 67/67 Chromium tests in 5.5 minutes. All 58 baseline cases retained; nine added. Only the existing NO_COLOR/FORCE_COLOR environment warning was emitted.

Early validation found two invalid Testing Library option properties and browser locators scoped to the wrong navigation container or excluding the intentionally hidden desktop menu button. These were corrected in new tests; no baseline test was changed, removed or weakened. Typecheck and all focused cases passed after correction.

The existing Vite process on port 5173 was verified as serving this exact repository and reused; it was not stopped. Browser output directories and design-checker artifacts were placed under the system temporary directory. `dist`, dependencies and existing test outputs remain ignored; only the eight curated screenshots below are included as evidence.

## Installed design checker: actual limits

The installed taste gate was run, not claimed as passing. First result: `GATE: FAIL 20 (round 1 of 3)`. Findings: five scroll-reveal objections, five no-visual objections, one text-only closing objection, copy-headings, heading-scale, text-contrast, five section-tile objections and moment-none. It could not finish the 390 walk or layout check (Chrome executable discovery failed).

A retry supplied the installed Playwright Chromium executable. Final line: `GATE: FAIL 1 (round 1 of 3)`; the remaining reported `container` finding says `page [1440, 390]: no .wrap`. Consistency timed out, so this is incomplete and does not supersede the first run as a pass. No further retry or waiver was used. The project already uses its scoped `public-wrap` with the Phase 9A content-width token. Raw checker output remains outside the repository.

The brief explicitly requests subtle section reveals, existing editorial typography, optional imagery only when useful, minimal decoration and no separate visual system. Accordingly the implementation retains those requirements rather than mounting the checker's separate effect kit, forced photographs or fixed viewport section heights. Differing semantic h3 sizes follow their local content hierarchy; AA contrast retains the required slate token. No fake fact, metric or social proof was added to satisfy copy heuristics. Independent Playwright mobile/reduced-motion checks passed, but the taste gate itself remains incomplete/failed as recorded.

## Reviewed evidence

- [Desktop full page](evidence/phase-9a5-home-1440.png) and [desktop hero](evidence/phase-9a5-hero-1440.png).
- [Tablet full page](evidence/phase-9a5-home-768.png) and [tablet hero](evidence/phase-9a5-hero-768.png).
- [Mobile full page](evidence/phase-9a5-home-390.png) and [mobile hero](evidence/phase-9a5-hero-390.png).
- [Mobile navigation with focus](evidence/phase-9a5-mobile-navigation.png).
- [Login at 320 pixels](evidence/phase-9a5-login-320.png).

## Protection and remaining work

Backend tree: `aa99d866532a2f424545e4e07451e72932996467`; `git diff --quiet HEAD -- backend` returned 0. Both `d4d32f8` and `4b10f9c` remain ancestors of HEAD (both ancestry commands returned 0). No existing Phase 9B changes were present at the starting clean tree; authenticated feature modules were preserved.

New files: landing component, scoped CSS, public capability labels, 16 component/unit cases, nine Chromium cases, route/design plan, this report and eight curated evidence PNGs. Modified: root README, frontend HTML metadata, anonymous-root routing/title and three login presentation/navigation lines. No existing tests, shared contracts, lockfiles or backend files changed. Nothing is staged, committed or pushed.

The page remains an academic mock marketplace. New jobs need supplied matches. Awarding/order creation, production/payment updates and other already-blocked commands remain disabled; no live backend adapter was introduced. Phase 9B remains the separate review/redesign of detailed authenticated business pages within the established system. Backend contract approval and live integration require separate authorization; this phase stops at public entry and verification.

## Final Git status

19 changed paths: four modified tracked files and 15 untracked new files (including eight curated PNGs). Nothing staged; HEAD and branch unchanged. A private-key/token-pattern scan of changed text files found no matches; reviewed public strings contain no credentials. No generated cache/build/report path is staged. Git whitespace validation passed; README emits only the repository's LF-to-CRLF normalization notice. No commit, push or Phase 9B implementation.

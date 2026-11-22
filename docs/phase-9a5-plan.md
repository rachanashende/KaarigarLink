# Phase 9A.5 plan and route audit

Date: 21 November 2026 (Asia/Calcutta). Software: public B2B manufacturing marketplace entry, aligned with SDG 9.
Branch: design/phase-9a-ampliflow; clean base d70f7f948ee6df7fcd9c02d6f351d3e80e2d1daf.
Protected backend: aa99d866532a2f424545e4e07451e72932996467.

Read phase-9a-design-specification.md before implementation. Keep its verified Inter/Geist Mono, #2F37D9/#0D0F14/#51556A/white, typography scale, rectangular buttons, fine rules and motion tokens. No new brand palette, font, animation dependency, stock photograph, customer logo, testimonial, inventory count or transaction statistic.

## Route audit

Current / uses HomeRedirect: authenticated -> roles[user.role].landing; anonymous -> /login. /login independently redirects authenticated users. RequireSession and RequireRole protect canonical Buyer/Workshop/Inspector/Admin routes; authenticated deep links already work. AuthProvider owns restoration, sign-in/out and query-cache clearing.

Change only the anonymous branch of HomeRedirect to the lazy public LandingPage. Preserve its authenticated redirect and all other route/guard/session behavior. Keep /login, foundation and all protected URL shapes. Homepage and participant entry CTAs use /login, without auto-login, role impersonation, registration or protected mutation. Login brand links back to /. An authenticated visit to / still opens that person's existing dashboard.

Public content imports no fixtures or marketplace services. A small, explicit capability allowlist is checked against seed capabilities in tests: CNC machining, Sheet metal fabrication, CNC turning and Tool making. Do not expose workshop records, prices, capacities, job/order IDs, users or QC data in public markup.

The clean starting tree contains no uncommitted Phase 9B changes; no Phase 9B files were found by name. Preserve every existing feature implementation and baseline test.

## Composition and copy

Voice: direct, factual and welcoming. One editorial brand headline supplied by the user; operational copy explains current capabilities and limitations without promising live transactions.

1. Navigation: own wordmark, three working section anchors, Log In/Get Started. Native shared Dialog for mobile with focus containment, Escape and restoration.
2. Hero: Where manufacturing meets opportunity. Explicit cobalt italic emphasis; concise marketplace description; Find a Workshop / Join as a Workshop -> login. Clearly identify demo entry and role selection.
3. Capabilities: open, ruled two-column list of four real capability categories, not an invented live catalog.
4. How it works: five real stages in an ordered editorial list. Distinguish currently supported responses/comparison/inspector decisions from blocked award/order/production/payment operations. State that new jobs require supplied matching results.
5. Participants: Buyer, Workshop and Inspector rows, each with clear responsibilities and login entry. No public Admin promotion.
6. Trust/quality: independent inspector-owned findings, visible rework and separate production/QC/payment. No certification or success-rate claims.
7. Final CTA/footer: strong editorial type, cobalt action, demo boundary, project/SDG 9 context, functional internal navigation.

No separate public visual system: use existing EditorialHeading, SectionLabel, Button and Dialog, with scoped layout CSS only. Fine hatch detail stays noninteractive. No manufactured product image or fake product UI is needed for this typographic reference.

## Motion and verification

Reuse 90/150/200/240ms tokens, transform/opacity and selected-state feedback. Hero enters once; brief explicitly permits subtle section reveals, so they enhance already-visible content once, without hiding it or scroll-jacking. Reduced-motion bypasses observer/animation behavior. Mobile menu breakpoint follows the public header's available width and closes when desktop navigation is shown.

Retain 371 unit/component and 58 Chromium baseline cases. Add public-access/no-data-query, capability provenance, CTA/login, all-role redirect, deep-link/guard, mobile keyboard, responsive and reduced-motion checks. Run typecheck, lint, full unit suite, production build and Chromium. Review 1440/1024/768/390/320, capture curated desktop/tablet/mobile evidence and preserve the backend/history. Run installed taste tooling honestly; report any failure or scope conflict rather than claiming a pass. No commit or push.

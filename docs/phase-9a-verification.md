# Phase 9A verification - Ampliflow-inspired shared design foundation

Date: 21 November 2026, Asia/Calcutta.
Branch: design/phase-9a-ampliflow.
HEAD/base unchanged: 7cb57e2945ac71f90fde7a5fe8a69d8a5e889838.
No commit, push, merge, rebase or PR was made. The feature/integration branches remain at the verified checkpoint.

## 1. Reference and tokens

The three supplied screenshots were inspected before implementation. Ampliflow is the primary visual source; GM4 and MONO inform future browsing structure only. Their gradients, pills, decorative colors and product imagery were not imported.

The exact reference was identified at [Ampliflow About](https://ampliflow.in/about). Public HTML, linked styles.css?v=c75bce4b23, inline About styles and Google Fonts metadata were inspected. The provided screenshot's sampled dominant solid colors match current CSS: cobalt #2F37D9, ink #0D0F14, slate #51556A and white #FFFFFF. The brief's initial palette was explicitly provisional. [Press metadata](https://ampliflow.in/press) confirms the font families but publishes a different brand palette, so matching screenshot/current CSS takes precedence.

[The specification](phase-9a-design-specification.md) was written before implementation and distinguishes exact properties from operational adaptations. Exact source values include type families, primary colors, Inter 700 display weight, -.035em tracking, 1.02 editorial line height and italic 400 emphasis. The app uses adapted 32-52px operational headings, a 256/80px sidebar, 72px topbar, equal responsive gutters, 1px dividers, 0/2/4px radii, accessible field boundaries and restrained dialog shadow. These layout dimensions are app choices, not claimed screenshot measurements or a pixel-identical page clone.

## 2. Font verification and licensing

Inter and Geist Mono are verified source families, not guessed substitutions. Google Fonts WOFF2 files are self-hosted with original SIL OFL 1.1 texts under frontend/public/fonts. [Font provenance](../frontend/public/fonts/README.md) records every download URL, license and subset.

Inter normal/italic and Geist Mono normal use variable 100-900 weights. Latin-ext provides INR coverage; a genuine Inter italic replaces browser synthetic oblique. No npm dependency or lockfile changed. Inter normal Latin alone is preloaded; unicode ranges and font-display:swap are preserved. Browser checks verify that Inter loads; a direct runtime metadata check also confirmed loaded Geist Mono. No runtime Google Fonts connection is needed. Script coverage is limited to the shipped subsets.

## 3. Shared components and affected screens

- Global tokens/theme aliases, self-hosted fonts, numerical figures and consistent square geometry affect every active role screen.
- AppShell retains all role links, guards, sidebar collapse, mobile navigation, account identity, breadcrumbs and logout. Selection uses cobalt text/rail and a quiet tint. Short-screen sidebar content scrolls; the hatch is a small noninteractive band.
- PageHeader, Button, FormField/controlClass, DataTable, StatCard, StatusBadge and Dialog retain their APIs and handlers. Empty/error/loading/demo states inherit the tokens and reduced-motion policy.
- New small primitives: SectionLabel, EditorialHeading, Card, SearchField, native FilterPanel, NavigationTabs, Notice and bounded Pagination.
- JobWorkspaceNav uses NavigationTabs with the same three labels/URLs and exact aria-current behavior. This is the sole buyer feature-file change, confined to shared navigation presentation.
- The existing /foundation route preserves its Phase 0 content/assertions and adds isolated design specimens. Search, filter disclosure, pagination and dialog preview have real local UI behavior; none touches marketplace data.
- Login inherits fonts, colors, geometry and controls. Its layout, authentication code and role selection are unchanged.

Individual Buyer/Workshop/Inspector/Admin business-page compositions, discovery collections, marketplace grids, detailed job/matching/quote/tracking forms and QC/admin workflow redesigns are reserved for later phases. GM4/MONO layouts are not introduced as new business features. The foundation's original Phase 0 copy remains historical; the current Phase 9A specimen section is clearly labelled.

## 4. Motion

Hover 150ms, press 90ms, panel/content entrance 200ms and underline/rail indicator 240ms use cubic-bezier(.2,.8,.2,1). Buttons move 1px on fine-pointer hover/press; linked-card styling supports a 2px lift. Static data cards do not move. Native filter content and dialogs enter with opacity and a 4px transform; modal closing remains immediate for native focus restoration. A bounded specimen stagger totals at most 120ms.

There is no width/height/padding animation, scroll observer, parallax, spring, looping dashboard card, scroll-jacking or motion dependency. Content is visible without animation. Reduced-motion disables all transitions/animations, including hover transforms, while keeping selected markers and functional controls.

Direct computed-style tests verify actual primary hover #4047E0, transform transition, 0px button radius and reduced-motion transition/animation suppression. A CSS precedence issue found during review was corrected so utility classes do not suppress the intended button feedback.

## 5. Visual comparison and evidence

Before screenshots were captured at the unchanged checkpoint before styling. Focused and refined browser captures were inspected at desktop/tablet/mobile widths. The final passing full suite supplied the curated after captures.

Compared with the prior pale blue-gray canvas/teal palette and rounded controls, the result uses a white ground, exact cobalt/ink typography, larger operational hierarchy, thin neutral rules, square controls and restrained mono details. Four roles keep the same hierarchy and functional data rather than being replaced by a generic dashboard template.

Review corrections: numeric baselines are aligned despite wrapped labels; tablet header branding now fits without an unnecessary second row; topbar/footer/content gutters share breakpoints; mobile-menu evidence waits for its entrance to finish rather than capturing temporary fade transparency. Native dialogs settle to opaque white. Tables retain contained horizontal scrolling on narrow screens and do not cause page overflow.

18 curated PNGs are retained under docs/evidence; earlier evidence is untouched:

| View | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Buyer | [1440](evidence/phase-9a-buyer-1440.png) | [768](evidence/phase-9a-buyer-768.png) | [390](evidence/phase-9a-buyer-390.png) |
| Workshop | [1440](evidence/phase-9a-workshop-1440.png) | [768](evidence/phase-9a-workshop-768.png) | [390](evidence/phase-9a-workshop-390.png) |
| Inspector | [1440](evidence/phase-9a-inspector-1440.png) | [768](evidence/phase-9a-inspector-768.png) | [390](evidence/phase-9a-inspector-390.png) |
| Admin | [1440](evidence/phase-9a-admin-1440.png) | [768](evidence/phase-9a-admin-768.png) | [390](evidence/phase-9a-admin-390.png) |
| Foundation specimens | [1440](evidence/phase-9a-foundation-1440.png) | [768](evidence/phase-9a-foundation-768.png) | [390](evidence/phase-9a-foundation-390.png) |

Additional evidence: [settled mobile menu](evidence/phase-9a-mobile-navigation.png), [before Buyer desktop](evidence/phase-9a-before-buyer-1440.png), [before Buyer mobile](evidence/phase-9a-before-buyer-390.png). 1024px and 320px were also checked automatically; redundant stress-width images are not added to Git. Raw reports/traces remain in temporary directories.

## 6. Accessibility and performance checks

Chromium checks font load, semantic navigation/aria-current, labelled search, unique IDs, native disclosure, bounded pagination, pending/disabled controls, native modal focus/Tab/Escape restoration, visible focus and reduced motion. All four dashboards are checked at 1440,1024,768,390,320; no page overflow or pageerror occurred. Metric alignment is asserted per rendered row.

Measured WCAG contrast on white: ink 19.17:1, cobalt 7.87:1, slate 7.35:1, fine-label gray 4.99:1, warning 5.13:1, success 5.70:1 and danger 6.57:1. Field boundaries are 3.18:1. Semantic labels accompany colors; disabled controls remain semantically disabled. These are targeted checks, not a claim of full WCAG certification or every pre-existing feature's color audit.

A cold Chromium login -> Buyer dashboard run observed cumulative layout shift 0 after fonts and entrances settled; it is one local measurement, not a universal device/network guarantee. No animation library, external font request or decorative image payload was introduced. The five variable WOFF2 assets total 222,980 bytes and load by subset/use. Production Vite build produced no warning.

## 7. Actual verification results

| Command | Actual result |
| --- | --- |
| npm.cmd run typecheck | PASS, exit 0; strict settings unchanged |
| npm.cmd run lint | PASS, exit 0; final run zero warnings |
| npm.cmd test -- --maxWorkers=1 | PASS, exit 0; 26 files / 371 tests; final full run 54.14 seconds |
| npm.cmd run build | PASS, exit 0; includes final typecheck; Vite 7.3.8, 1,826 modules, Vite 3.66 seconds |
| CI=1 npm.cmd run test:e2e -- --workers=2 --output=<fresh temporary path>/kaarigarlink-phase9a-full | PASS, exit 0; all 58 Chromium tests, 3.0 minutes |
| Focused shared/foundation tests | PASS, 9/9 |
| Focused design Chromium suite after alignment review | PASS, 5/5, 11.7 seconds |
| Focused final hover/geometry/reduced-motion case | PASS, 1/1, 3.8 seconds |
| git diff --check / protected source comparison | PASS |

All 367 unit/component and 53 Chromium baseline cases remain intact and passed. Four primitive component cases and five design/accessibility browser cases were added. No existing test file, assertion, timeout or configuration was changed. Chromium printed the existing NO_COLOR/FORCE_COLOR runner warning; it did not fail any test.

Installed taste-skill 2.5.1, frontend-design and ponytail instructions were read and applicable guidance applied. No claim is made that the taste marketing-site CLI gate ran or passed: random palette dealing, full-screen marketing heroes, photo/scene quotas and marketing copy rewrites conflict with the explicit reference-led operational-app scope. Visual checks were performed through the existing Playwright configuration and direct screenshot inspection. No skill kit code/assets were mounted.

## 8. Source and history protection

Backend tree before/after is exactly aa99d866532a2f424545e4e07451e72932996467; git diff HEAD -- backend is empty and no untracked backend paths exist.

The complete services/store/persistence, shared types, auth, canonical router/role registration, Inspector/Admin/Workshop feature directories, preserved Member 3 pages/context, package.json/lockfile and Vite/TypeScript configuration compare unchanged with HEAD. Buyer business handlers also remain unchanged; JobWorkspaceNav alone delegates styling to the shared primitive.

No award, order creation, workshop production/QC/payment/profile/settings/onboarding command was re-enabled. Existing supported invitation/quotation workflows and Inspector-owned QC remain governed by their original services. Both contributor commits and the structural merge remain in history. No dependency installation, source deletion or test removal occurred.

## 9. Changed-file summary

Modified presentation/docs:
README.md; docs/design-system.md; frontend/index.html; app/AppShell.tsx; app/FoundationPage.tsx; components/DataTable.tsx, FormField.tsx, PageHeader.tsx, StatCard.tsx, StatusBadge.tsx, ui/button.tsx, ui/dialog.tsx; features/buyer/JobWorkspaceNav.tsx; styles/globals.css.

Created:
docs/phase-9a-design-specification.md and this report; e2e/design-system.spec.ts; app/DesignSystemPreview.tsx; components/design-system.tsx and design-system.test.tsx; styles/fonts.css; five fonts, two original OFL licenses and font README; the 18 curated evidence PNGs above. Paths without frontend/src prefix are relative to that directory where applicable.

All changes are intentionally unstaged and uncommitted for review. Generated build/cache/report files and local environments are not staged; the index is empty. No new credential or secret file is part of the change.

## 10. Remaining limits

This is the shared foundation, not a redesign of every operational page or a literal reconstruction of Ampliflow's marketing site. Existing feature grids, nested detail sections and mobile table scrolling remain. Wider script coverage, slow-network/device testing, full assistive-technology/WCAG audit and live backend behavior were not verified. Later page phases can compose the new primitives without changing canonical workflows.

Stop after Phase 9A for review; do not commit or push.

## Exact final Git status

14 tracked modifications, 33 new files, zero staged files. No deleted files.

```text
 M README.md
 M docs/design-system.md
 M frontend/index.html
 M frontend/src/app/AppShell.tsx
 M frontend/src/app/FoundationPage.tsx
 M frontend/src/components/DataTable.tsx
 M frontend/src/components/FormField.tsx
 M frontend/src/components/PageHeader.tsx
 M frontend/src/components/StatCard.tsx
 M frontend/src/components/StatusBadge.tsx
 M frontend/src/components/ui/button.tsx
 M frontend/src/components/ui/dialog.tsx
 M frontend/src/features/buyer/JobWorkspaceNav.tsx
 M frontend/src/styles/globals.css
?? docs/evidence/phase-9a-admin-1440.png
?? docs/evidence/phase-9a-admin-390.png
?? docs/evidence/phase-9a-admin-768.png
?? docs/evidence/phase-9a-before-buyer-1440.png
?? docs/evidence/phase-9a-before-buyer-390.png
?? docs/evidence/phase-9a-buyer-1440.png
?? docs/evidence/phase-9a-buyer-390.png
?? docs/evidence/phase-9a-buyer-768.png
?? docs/evidence/phase-9a-foundation-1440.png
?? docs/evidence/phase-9a-foundation-390.png
?? docs/evidence/phase-9a-foundation-768.png
?? docs/evidence/phase-9a-inspector-1440.png
?? docs/evidence/phase-9a-inspector-390.png
?? docs/evidence/phase-9a-inspector-768.png
?? docs/evidence/phase-9a-mobile-navigation.png
?? docs/evidence/phase-9a-workshop-1440.png
?? docs/evidence/phase-9a-workshop-390.png
?? docs/evidence/phase-9a-workshop-768.png
?? docs/phase-9a-design-specification.md
?? docs/phase-9a-verification.md
?? frontend/e2e/design-system.spec.ts
?? frontend/public/fonts/README.md
?? frontend/public/fonts/geist-mono-latin-ext.woff2
?? frontend/public/fonts/geist-mono-latin.woff2
?? frontend/public/fonts/geistmono-OFL.txt
?? frontend/public/fonts/inter-OFL.txt
?? frontend/public/fonts/inter-latin-ext.woff2
?? frontend/public/fonts/inter-latin-italic.woff2
?? frontend/public/fonts/inter-latin.woff2
?? frontend/src/app/DesignSystemPreview.tsx
?? frontend/src/components/design-system.test.tsx
?? frontend/src/components/design-system.tsx
?? frontend/src/styles/fonts.css
```

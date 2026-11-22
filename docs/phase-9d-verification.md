# Phase 9D — Final frontend QA and polish

Audit performed 21–22 November 2026 on `design/phase-9a-ampliflow`. Protected HEAD: `9d443b9d688ce6b456b76b7ce76d8c3fa4919518`.
Backend tree: `aa99d866532a2f424545e4e07451e72932996467`.

**Follow-up checks are green:** both Firefox axe crash groups are resolved by the tested Playwright compatibility pin. See the Firefox follow-up below. Earlier failed full-run results are retained as history; a new full 375-case matrix is not claimed.

## Scope and fixes

Read the Phase 9A design specification/verification, Phase 9A.5 public-entry plan/verification, Phase 9B design/verification and Phase 9C role design/verification. Existing frontend-design, taste and Ponytail guidance informed this restrained audit. The historical foundation specimen and completed page designs are preserved; no marketing design gate is claimed.

| Confirmed issue | Minimal correction |
| --- | --- |
| Sidebar visible “Collapse navigation” differed from accessible “Collapse sidebar”; axe label-content-name-mismatch. | Match visible copy to the existing accessible name. |
| Buyer recent-job section and nested scroll region had identical names; axe landmark-unique. | Name the outer section “Recent job overview”; preserve heading, table caption and scroll-region name. |
| Foundation return link sat outside landmarks; axe region. | Wrap the existing link in named Foundation navigation. |
| Foundation scope anchor did not receive focus after keyboard activation in all three engines. | Make its existing destination programmatically focusable with tabIndex=-1. |
| Safari pointer-opened native dialogs could restore focus to the document. | Shared Button focuses its actual current target before forwarding the unchanged callback, without scrolling. Native disabled behavior is preserved. |
| WebKit keyboard navigation skipped the implicit skip-link tab stop. | Set tabIndex=0 on both existing skip links; no positive tabindex. |
| Public/foundation editorial heading split “manufacturing” inside the word at 320px. | Reduce the existing shared editorial size from 44 to 40px below 375px only. DOM Range regression verifies the complete word occupies one rendered line. |
| Quotation command containers had aria-label on generic divs; axe returned aria-prohibited-attr for manual review. | Give the shared command container role=group so its existing name has valid grouping semantics; no command logic changes. |

No backend, entity contract, mock service/store, authorization, session provider or business-handler changes. Router changes only affect the skip link. Existing buyer award/order creation, workshop production/rework/payment/profile/account writes, Admin mutations and unsupported reinspection commands remain disabled.

## Regression coverage and tooling

Six new component cases in frontend/src/app/FinalQA.test.tsx retain all 402 baseline cases. Thirteen new browser cases in frontend/e2e/final-qa.spec.ts extend the 111 baseline cases to 124 per engine. Existing public mobile-navigation coverage adds a visible-heading readiness assertion before its first raw Tab key. The role-design login helper also now asserts that its heading is visible and loading content has gone before raw keyboard input. Controlled WebKit keydown diagnostics showed that the old helpers could act before SPA/role content mounted. All original keyboard, focus, guard and reduced-motion assertions remain. No tracing workaround remains: an initial trace-off result did not hold, and that experimental setting was reverted.

The canonical Playwright configuration registers Chromium, Firefox and WebKit, with two workers globally and one worker each for Firefox/WebKit to limit diagnostic contention and competing native windows on Windows. It starts a fresh isolated development server on port 4175 without reusing the user's server. Baseline workflow tests deliberately exercise development mock persistence. Production mock mode is intentionally memory-only, so production read-only checks are separate; that existing service distinction was not changed.

Exact development-only @axe-core/playwright 4.14.0 uses transitive axe-core 4.14.1. At the initial handoff, no existing lockfile package version had changed and no runtime dependency was added. The follow-up changes only the three Playwright test packages. Axe remains absent from production application imports/assets. Default axe rules run without exclusions, disabled rules or impact filtering.

### Route and responsive coverage

The intended matrix checks every listed route/state at 320, 375, 768, 1024 and 1440px, with axe scans at 320 and 1440px. Responsive coverage combines existing baseline suites and the new audit; the incomplete Firefox axe coverage is identified below. Tests check page overflow, content readiness, fonts/images, runtime errors and unchanged business storage during read-only browsing. Nested scrollable tables remain intentional.

| Group | Canonical route/state combinations |
| --- | --- |
| Public (4) | /, /login, /foundation, /not-a-route |
| Buyer (9) | /buyer/dashboard; /buyer/jobs; /buyer/jobs/new; /buyer/jobs/job-1; its /matches and /quotes; /buyer/orders; /buyer/orders/order-rework; /buyer/orders/order-closed/review |
| Workshop (8) | /workshop/dashboard; /workshop/invitations; /workshop/invitations/seed-invitation-1; /workshop/orders; /workshop/orders/order-rework; /workshop/profile; /workshop/settings; /workshop/onboarding |
| Inspector (7) | /inspector/dashboard; /inspector/inspections; pending inspection-qc, rework inspection-rework and accepted inspection-closed detail routes; /inspector/rework; /inspector/history |
| Admin (11) | /admin/dashboard; /admin/users and /buyer-1; /admin/workshops and /workshop-1; /admin/jobs and /job-1; /admin/orders and /order-rework; /admin/quality and /inspection-rework |

Five additional axe state scans cover invalid login, mobile navigation, logout confirmation, filtered empty jobs and denied Admin access. This is 83 scans per engine / 249 per complete matrix. Existing suites cover login validation, all demo roles, guards, deep links, restoration/logout, keyboard/dialog behavior, reduced motion, enabled Buyer job/invitation/review and Workshop invitation/quotation workflows, plus Inspector decisions and read-only Admin consistency.

Chromium/WebKit diagnostic ARIA snapshots support semantic review. Firefox omits only these diagnostic attachments: controlled runs showed renderer crashes when snapshots preceded axe. Direct axe.run also crashed on certain forms/details. The official adapter passed isolated probes but still crashed on three groups under the two-worker full run. Controlled development and production probes each passed all six scans, comparing three affected states with tracing snapshots enabled/disabled. These results do not establish tracing as the cause; Firefox now uses one worker and targeted recovery results are reported below. All axe scans and assertions still run in Firefox. No browser or accessibility rule is skipped.

## Initial verification results

| Command / run | Actual result |
| --- | --- |
| npm.cmd run typecheck | Passed; repeated after the final configuration/readiness changes. |
| npm.cmd run lint | Passed, zero warnings; repeated after the final changes. |
| npm.cmd test -- --maxWorkers=1 | 408/408 tests, 30/30 files; 119.25s. All 402 baseline cases retained. |
| Focused FinalQA.test.tsx after final test-description cleanup | 6/6 passed; 5.89s. |
| npm.cmd run build | Passed, including typecheck; 1,834 modules, final Vite build 8.34s. |
| Full npm.cmd run test:e2e -- --workers=2 (three engines, before final grouping/readiness corrections) | **363/372 passed, nine failed, zero skipped**, exit 1; 81.1 minutes including host interruptions. Two worker-shutdown errors also occurred. |
| Chromium recovery, one worker | **5/5 passed** (96.7s): all four failed Chromium cases plus changed Workshop accessibility. |
| Firefox recovery, one worker | **2/4 passed** (194.4s): Buyer and Workshop audits passed; Admin and dialog/validation groups crashed. |
| Firefox Admin/dialog repeat with --trace=off | **0/2 passed**, both renderer crashes (48.7s). Disabling tracing is not a solution. |
| WebKit initial recovery, one worker | **2/3 passed** (159.5s): Workshop audit and quotation keyboard workflow passed; Inspector menu case failed. |
| WebKit all three role keyboard cases after content-readiness correction, --repeat-each=3 | **9/9 passed** (51.6s), with tracing retained. |

The full-run breakdown was Chromium 120/124, Firefox 121/124, WebKit 122/124. Latest results across full/recovery runs cover **370/372 distinct cases passing**, including all 333 original functional browser cases. This is **not** a single green full-suite run, and the complete matrix was not repeated after the final targeted corrections.

All four failed Chromium traces record “[vite] server connection lost. Polling for restart...”; the exact cases passed on recovery without weaker assertions or longer existing timeouts. Firefox crashes remain reproducible inside the test-runner axe groups, despite passing isolated form probes. The WebKit readiness correction preserves the exact keyboard sequence and added stronger page-readiness assertions rather than replacing keyboard input with clicks.

Raw reports/logs/traces are retained outside Git under %TEMP%/kaarigarlink-phase9d-*. Important JSON reports: final-e2e; recovery-chromium/firefox/webkit; firefox-no-trace; webkit-ready-keyboard. Trace-off experiments also remain recorded and are not represented as a reliable fix.

Earlier runs are not represented as passing:
- Initial discovery found the label, duplicate landmark, out-of-landmark link and focus issues above, alongside mistakes in the newly written audit setup that were corrected.
- The first full matrix completed 357/366, with nine failures: three Chromium timeouts/network errors across host suspension (including ERR_NETWORK_IO_SUSPENDED and ERR_NETWORK_CHANGED), three Firefox direct-scanner renderer crashes, and three WebKit focus/synchronization failures. Raw results remain in OS temporary storage.
- A subsequent production-mode full functional run was stopped after exposing the intentional memory-only mock behavior: a QC update reset on navigation, so the development-persistence assertion correctly failed. No service or assertion was weakened to accommodate the wrong test environment.
- Focus regressions passed 9/9 across engines before the final matrix.

### Initial accessibility results and coverage gap

Latest distinct completed axe scans after the grouping fix:

| Engine | Completed / intended | Violations | Incomplete/manual items in completed scans |
| --- | ---: | ---: | ---: |
| Chromium | 83 / 83 | 0 | 0 |
| Firefox | 68 / 83 | 0 | 0 |
| WebKit | 83 / 83 | 0 | 0 |

The original full run completed 226 scans and reported 12 repeated aria-prohibited-attr manual-review entries on quotation wrappers. Source/semantic review confirmed generic elements were being named. The role=group correction was verified by the new component case and all three Workshop browser audit recoveries. Latest results contain **234 completed distinct scans**, with zero violations/incomplete items; no manual item was ignored.

**Initial blockers (resolved in the follow-up below):** Firefox crashed while scanning /admin/jobs/job-1 and invalid-login. Consequently, desktop/mobile scans of that job detail, /admin/orders, /admin/orders/order-rework, /admin/quality and /admin/quality/inspection-rework, plus invalid-login/mobile-menu/logout/empty-jobs/denied-route state scans, were incomplete in that engine: 15 planned scans. Chromium and WebKit completed those scans. The corresponding Firefox functional baseline cases passed. No exclusions, rule disabling, swallowed crashes or test skips conceal this gap.

Reviewed diagnostic semantics for login, Buyer dashboard, Workshop quotations, Inspector QC form and Admin job detail: main/heading/navigation structure, distinct table/region names, labelled form controls and named quotation groups. This is an accessibility-tree preflight, not an observed spoken screen-reader session.

Actual engine launch versions: Chromium 159.0.8154.6, Firefox 159.0 and WebKit 27.2, on Windows. Automated engine coverage is not physical Safari/iOS certification.

## Production assets and loading

Final Vite build: 1,834 modules; 44 JS/CSS assets, 790,199 bytes raw / 248,319 gzip / 214,744 Brotli. Before Phase 9D: 789,963 raw / 248,256 gzip / 214,712 Brotli. These are summed individual asset compressions, not a single initial download.

| Asset group | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Initial index JavaScript + React runtime | 530,368 | 164,889 |
| Initial shared CSS | 37,723 | 8,192 |
| All five unchanged WOFF2 font files | 222,980 | Not recompressed here |

Preserved route lazy loading, React chunk, self-hosted font licenses/subsets, single Inter preload and font-display swap. No speculative splitting, extra preload or image library was justified.

A cold Chromium production preview audit at 1440 and 320px loaded Inter normal/italic and Geist Mono locally with no failed requests, HTTP errors or broken images. Both loaded 303,514 encoded resource bytes including fonts and the lazy public page, excluding HTML/protocol overhead. Observed local LCP was 636/580ms and CLS 0.002434/0.000011 respectively. These single desktop loopback samples, taken during QA, are not field Core Web Vitals or slow-device measurements. Current audited pages use inline SVG artwork/icons and did not request raster photography.

The final production preview was launched on a separate owned temporary server and closed afterwards. Six production and six development Firefox state probes (invalid login, Buyer job form, Admin job detail, each with/without tracing snapshots) completed with zero violations/incomplete items. These isolated successes do not replace the failing runner groups. No production persistence contract was changed.

## Screenshot and semantic review

Reviewed and preserved these seven focused PNGs:

- [Foundation heading before the 320px typography correction](evidence/phase-9d-foundation-before-320.png).
- [Foundation scope focus, 1440px](evidence/phase-9d-foundation-focus-1440.png).
- [Foundation heading/scope focus, 320px](evidence/phase-9d-foundation-focus-320.png).
- [Sidebar visible action label, 1440px viewport; sidebar crop](evidence/phase-9d-sidebar-label-1440.png).
- [Mobile dialog focus returned to its opener, 375px](evidence/phase-9d-dialog-return-focus-375.png).
- [Visible login skip link, 320px](evidence/phase-9d-login-skip-focus-320.png).
- [Public heading with complete words, 320px; entrance animation settled](evidence/phase-9d-public-heading-320.png).

Also reviewed existing-run Admin desktop and Workshop/Inspector mobile dashboard captures for shared typography, spacing, alignment and intentional nested table scrolling. These unchanged-screen images were not copied into new project evidence.

Only changed/problematic screens are newly curated. Existing baseline screenshot calls remain intact; their generated output stays in OS temporary storage. Prior phase evidence is preserved.

## Remaining limits and blockers

NVDA/JAWS were not found installed/running. Windows Narrator exists, but its spoken output could not be observed in this headless environment. A real screen-reader audit is therefore **not performed**. ARIA-tree/landmark inspection, automated axe and keyboard tests are preflight checks, not screen-reader or WCAG certification.

Physical iOS/Android, touch/zoom, actual assistive technology, low-bandwidth/low-power devices and the deployed host remain untested. Production business persistence remains deliberately disabled; production reloading a mock mutation resets it. Live transactions still require approved backend contracts and authorization integration. No disabled business action was enabled.

## Initial Git and protection checks

Final branch/HEAD remain the protected baseline stated above. Both d4d32f8 and 4b10f9c are ancestors of HEAD. Backend tree hash is unchanged, and git diff against backend, shared types/services and authentication source is empty. Fonts, fixtures and existing contributor commits remain intact.

Working tree: **13 modified tracked files, 10 untracked intended files, zero staged files**. Pending-path review and secret-pattern scan found no credentials, local environment files, caches or generated-output paths. Git diff whitespace checks passed (only normal LF/CRLF advisories on the role E2E file and Playwright config). Generated dist is ignored; raw test artifacts are in OS temporary storage.

Exact short-status entries:

```text
 M README.md
 M frontend/e2e/landing.spec.ts
 M frontend/e2e/role-design.spec.ts
 M frontend/package-lock.json
 M frontend/package.json
 M frontend/playwright.config.ts
 M frontend/src/app/AppShell.tsx
 M frontend/src/app/FoundationPage.tsx
 M frontend/src/app/router.tsx
 M frontend/src/components/ui/button.tsx
 M frontend/src/features/buyer/BuyerDashboard.tsx
 M frontend/src/features/workshop/WorkshopActions.tsx
 M frontend/src/styles/globals.css
?? docs/evidence/phase-9d-dialog-return-focus-375.png
?? docs/evidence/phase-9d-foundation-before-320.png
?? docs/evidence/phase-9d-foundation-focus-1440.png
?? docs/evidence/phase-9d-foundation-focus-320.png
?? docs/evidence/phase-9d-login-skip-focus-320.png
?? docs/evidence/phase-9d-public-heading-320.png
?? docs/evidence/phase-9d-sidebar-label-1440.png
?? docs/phase-9d-verification.md
?? frontend/e2e/final-qa.spec.ts
?? frontend/src/app/FinalQA.test.tsx
```

The initial Phase 9D handoff performed no staging, commit, push, merge, branch switch or history rewrite. The later instruction authorizes a normal local checkpoint after the green follow-up checks below.

## Firefox axe follow-up — 22 November 2026

### Diagnosis

**Confirmed cause: Playwright/Firefox compatibility, not an application accessibility defect or ordinary runner instability.**

The installed combination was Playwright 1.65.1 with Firefox 159.0, revision 1572, and unchanged axe-core 4.14.1. A new minimal regression uses only valid inline HTML: a named section, heading, label and password input. It reproduced a page crash on a page-world ARIA reflection read after a labelled-control query in Playwright's isolated world, **before axe was invoked**. No KaarigarLink code, services, CSS or data is involved.

This matches [Playwright #43967](https://github.com/microsoft/playwright/issues/43967) and its [axe-specific duplicate #44135](https://github.com/microsoft/playwright/issues/44135). Firefox incorrectly caches ARIA reflection results across JavaScript compartments. The last known good stable Playwright release is 1.64.1; the fixed Firefox roll is documented in [#43982](https://github.com/microsoft/playwright/pull/43982). The registry's stable release was still 1.65.1 when checked; the fix was on the 1.66 development branch.

Viewport/device-profile probes did not provide a reliable fix. Tracing off and a single worker had already failed to cure the groups. Controlled reads and the application-independent reproduction identify the compatibility trigger; prior host/network interruptions remain separate historical failures.

### Smallest justified fix

- Pin the existing development dependency @playwright/test to exact **1.64.1**. Deduplicate playwright and playwright-core to the same version. Only these three existing package versions changed relative to the start of this follow-up; axe and application/runtime dependencies are unchanged.
- Install the matching managed test browsers: Chromium **156.0.8078.4 / r1248**, Firefox **157.0 / r1555**, WebKit **27.2 / r2370**. No custom executable path, prerelease package or user desktop-browser replacement.
- Restore Firefox semantic ARIA attachments in final-qa.spec.ts; the obsolete diagnostic exclusion is removed.
- Add e2e/axe-compatibility.spec.ts to guard upgrades. It asserts labelled-control focus, page-side ARIA references, a full unfiltered axe result and labelled input interaction after the scan, on all three engines.
- Document the pin in the README. No application source, backend, contracts, mock services, workflow handler or blocked action was changed in this follow-up.

No test was disabled, no assertion/rule weakened, no crash swallowed, no DOM getter patched and no Firefox scan excluded. Existing timeouts, tracing and role guards remain intact.

### Exact follow-up results

| Check | Actual result |
| --- | --- |
| Minimal compatibility regression before the pin, Firefox 1.65.1 | **0/1 passed**, deterministic page crash at the direct ARIA reflection read; 7.17s. Retained as negative evidence. |
| Same regression after the pin, all three engines | **3/3 passed**, 16.85s. |
| Complete final-qa.spec.ts, Firefox, one worker | **13/13 passed**, zero skipped/retries, 321.37s. Both previously failing groups passed unchanged. |
| Firefox axe attachments in that run | **83/83 scans completed, zero violations, zero incomplete items**; all **39 semantic snapshots** captured. The former 15-scan gap is closed. |
| Focused cross-browser compatibility/auth/workflow regressions | **36/36 passed** — 12 Chromium, 12 Firefox, 12 WebKit; zero skipped/retries, 241.99s. |
| Final npm.cmd run typecheck | **Passed**, exit 0. |
| Final npm.cmd run lint | **Passed**, zero warnings, exit 0. |
| Final npm.cmd test -- --maxWorkers=1 | **408/408 passed**, 30/30 files, 105.08s. |
| Final npm.cmd run build | **Passed**, includes typecheck; 1,834 modules, Vite 8.02s. |

The 36 selected regressions exercise email validation/login, all four demo roles, session restoration/logout, role/ownership guards, mobile focus, expired/corrupt sessions, Buyer job posting, Workshop invitation/quotation lifecycle, Inspector acceptance and cross-role Admin/Buyer QC consistency. They were necessary because the stable test pin changes the managed browser revisions.

The last user instruction was to resume rather than repeat completed checks. The already-running WebKit regression and queued strict checks completed successfully; no additional passing suite was rerun after that instruction.

Reproduction commands, from frontend/:

```sh
npm.cmd run test:e2e -- e2e/axe-compatibility.spec.ts --workers=1
npm.cmd run test:e2e -- e2e/final-qa.spec.ts --project=firefox --workers=1
npm.cmd run test:e2e -- --workers=1 --grep "ARIA reflection|login validation|demo routing, restoration|mobile navigation traps|expired or corrupt|accept, submit, compare, edit and withdraw|posts a job once|confirmed acceptance|inspector decisions persist"
```

Raw JSON/logs/traces remain outside Git under %TEMP%/kaarigarlink-phase9d-followup-*. Named reports: before-pin, compatibility, firefox-audit and workflows; strict output is followup-checks.log. The production build asset names/sizes match the preceding Phase 9D build; test tooling is not bundled into the application.

### Remaining failures and limits

**No failures remain in the executed follow-up checks.** The two Firefox blockers are closed. The compatibility pin should remain until a patched stable upgrade passes the new regression.

The complete inventory is now 125 browser cases per engine / 375 total, including the new compatibility case. A single fresh 375-case run was **not** performed or claimed. Earlier full-run failures remain recorded above; passing results across different runs/browser revisions are not represented as one green full matrix. Real screen-reader, physical-device and deployment-host coverage limits from the initial report remain unchanged.

### Review and local checkpoint

All pending Phase 9D source, tests, documentation and seven intended screenshots were reviewed for the authorized checkpoint. Before staging: 13 modified tracked files, 11 intended untracked files, zero staged files. No cache, build output, local environment or credential paths were included.

Branch remains design/phase-9a-ampliflow. Precommit parent is 9d443b9d688ce6b456b76b7ce76d8c3fa4919518. Backend tree remains **aa99d866532a2f424545e4e07451e72932996467**; shared types/services/authentication and fonts are unchanged. Both original contributor commits d4d32f8 and 4b10f9c remain ancestors.

The user authorized a normal local commit after these green checks, with subject **fix(frontend): finalize accessibility and cross-browser QA**, preserving the existing history. The completion reply records the actual commit hash and postcommit Git status. No push or merge is authorized.

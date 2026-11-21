# Phase 9A design specification

Software: a four-role B2B manufacturing marketplace. Phase 9A changes shared presentation only.
Date: 21 November 2026, Asia/Calcutta. Branch: design/phase-9a-ampliflow.
Base: 7cb57e2945ac71f90fde7a5fe8a69d8a5e889838.
Backend protected tree: aa99d866532a2f424545e4e07451e72932996467.

## Reference analysis before implementation

Primary: supplied Screenshot 2026-11-19 190638.png (Ampliflow). Secondary: 190915 (GM4) for sidebar filters/search/sort/grid/pagination only. Tertiary: 191132 (MONO) for category browsing/collections only. Their colors, rounded pills, gradients and shadows are not imported.

The Ampliflow reference is reliably identified by its exact heading and matching source at https://ampliflow.in/about. Its public HTML, styles.css?v=c75bce4b23 and inline About styles were inspected read-only. Public press metadata at https://ampliflow.in/press also identifies Inter + Geist Mono, but its published palette differs from current CSS. Current CSS and the provided screenshot take precedence.

Screenshot pixel histogram (sampled every second pixel, not a guess): white #FFFFFF, ink #0D0F14, cobalt #2F37D9 and slate #51556A are dominant solid colors. They match the current CSS :root values. The brief's #3438E8/#0C0D12/#596078 are provisional and are superseded by these verified values.

## Tokens and provenance

| Token | Selected value | Basis |
| --- | --- | --- |
| Canvas / card | #FFFFFF | Screenshot + source exact |
| Primary / focus / emphasis | #2F37D9 | Screenshot + source exact |
| Primary hover | #4047E0 | Source exact |
| Ink | #0D0F14 | Screenshot + source exact |
| Secondary text | #51556A | Screenshot + source exact |
| Fine labels | #6B6F80 | Current source exact |
| Subtle surface | #F7F8FA | Source exact |
| Selected surface | #EEEEFC | App approximation of source rgba(47,55,217,.08) |
| Divider | #E7E7E8 | Approximate opaque equivalent of source 10% ink border; 1 CSS px for app crispness |
| Field border | #8C90A0 | App accessibility adaptation, >=3:1 on white |
| Success / warning / danger | #14754F / #986211 / #B42318 | App semantic adaptations, text labels retained |
| Radii | 0 / 2 / 4 px | App adaptation of square reference controls, not source global 6/8/12px defaults |
| Shadow | None at rest; dialog 0 20px 60px / 12% ink | App hierarchy adaptation |
| Spacing | 4px base: 4/8/12/16/24/32/48/64/96 | Measured visual rhythm + app adaptation |
| Sidebar / topbar | 256px (80px collapsed) / 72px min | App proportions, not screenshot measurements |
| Content | max 1320px; 16px mobile, 32px tablet, 48px desktop gutters | App adaptation; equal edges |

Source About h1: Inter 700, clamp(44px,6vw,80px), line-height 1.02, tracking -.035em. Its emphasized word is italic 400. Body lede: 18px/1.6. Eyebrow: Geist Mono 11px, tracked .28em, uppercase, .5px outline. These are verified CSS properties, not inferred screenshot CSS pixel sizes (the supplied 1896px image may include display scaling).

App PageHeader uses clamp(32px,3.6vw,52px), 700, line-height 1.06 and -.035em; long operational titles wrap naturally. EditorialHeading uses the verified 44-80px range only in the foundation specimen. Interface text is 14-15px, 400/500/600; labels 11px/.16em. Numerical data uses tabular lining figures. Labels remain readable text, never color-only. Italic emphasis is explicit content, not an automatic last-word decoration on business pages.

## Fonts and licensing

Verified exact families: Inter and Geist Mono, declared by About :root and Google Fonts metadata. Google Fonts provides SIL OFL 1.1 versions from the Inter Project Authors and Geist Project Authors. Use self-hosted variable WOFF2 with original license texts alongside them; no runtime font/CDN requests or new npm dependency. Inter Latin/Latin-ext cover English and INR; a real licensed Inter italic face replaces browser synthetic oblique. Geist Mono is used sparingly for micro-labels/IDs, not all prose. No substitute family is being presented as the original.

Fallbacks: system-ui for Inter, ui-monospace for Geist Mono. font-display: swap; preload only the frequently used Latin Inter normal face. Keep the existing lockfile/dependency set unchanged.

## Layout and shared components

Preserve canonical role-aware links, route guards, collapse state, native mobile dialog, logout confirmation and keyboard behavior. Redesign only their presentation. Selected links use cobalt text, a fine rail and a quiet selected surface. The shell keeps its sidebar scrollable on short screens; primary task content is never obscured by decoration. Fine diagonal hatching is confined to a small noninteractive sidebar/footer band.

Shared components retain their semantic APIs: buttons, field wrappers, PageHeader, DataTable, StatCard, StatusBadge, dialogs and loading/error/empty states. Add small reusable editorial label/heading, Card, search, native filter disclosure, navigation tabs, notice and pagination primitives. Preview them within the existing foundation route while preserving its original content and tests. Do not add new marketplace business data or redesign feature-page composition.

## Motion

Use existing React/CSS stack, no motion dependency. Ease cubic-bezier(.2,.8,.2,1); hover 150ms, press 90ms, panel 200ms, indicator 240ms, content entrance 200ms. Hover lifts actionable buttons 1px and linked cards 2px on fine pointers only; press translates 1px. Native disclosure content and dialogs enter with opacity/4px transform, never layout-property animations. Navigation rail and tab underline use transform. Optional stagger only for a bounded specimen group, <=120ms total; no task waits for it. No scroll observers, parallax, looping card visuals or animations on every table row.

prefers-reduced-motion disables every transition/animation and leaves content visible. No width/height/padding animation, hidden-until-script content or animation-induced layout shift. Focus appears immediately, at least 2px with offset; pending/disabled behavior stays functional.

## Skill application and scope precedence

Read installed taste-skill 2.5.1, frontend-design and ponytail instructions. Apply their typography, alignment, restrained purposeful motion, accessibility and visual-review guidance. The explicit user reference palette overrides random palette/font dealing. This is an authenticated operational app foundation, not a new marketing site: full-screen heroes, photo quotas, shaders, marketing copy rewrites and dealt moments would violate Phase 9A scope. No kit assets or marketing boilerplate are mounted. Report any checker actually run; do not claim the skill's marketing gate passed.

## Protection and verification plan

No backend, shared domain/service/store, role routes/guards, business handlers, fixtures, Member 3 functional modules or blocked commands change. Retain all 367 unit/component and 53 Chromium baseline cases and assertions. Add focused shared-component and design accessibility/browser checks. Run strict typecheck, lint, complete unit tests, build and Chromium sequentially where heavy. Review Buyer/Workshop/Inspector/Admin and shared controls at 1440/1024/768/390 (plus 320 stress); keyboard/mobile menus, contrast, font load, reduced motion, overflow and layout shifts. Preserve curated before/after evidence and report actual results. No commit or push.

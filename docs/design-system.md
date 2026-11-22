# Frontend design foundation

Kind: industrial B2B software. Audience: small manufacturers, buyers and independent inspectors. Phase 0 provides tokens and a development preview, not a marketing page or dashboard.

The frontend-design and taste skills informed typography, restrained surfaces, alignment and accessibility. Their full-screen marketing heroes, photo/animation dealers and promotional finish gates are outside this phase's PRD scope. No marketing assets or motion kit were copied.

## Palette

| Token | Value | Purpose |
| --- | --- | --- |
| background | #f3f6f8 | Cool workshop-paper canvas |
| foreground | #182e3e | Strong readable text |
| primary | #204d6b | Steel-blue primary action |
| card | #ffffff | Work surfaces |
| muted-foreground | #4c6070 | Secondary text |
| accent | #f5b942 | Safety amber, dark text only |
| destructive | #b42318 | Errors and destructive actions |
| border | #cbd6df | Quiet dividers |
| input | #768b9b | Form-control boundaries |
| ring | #236b96 | Visible keyboard focus |

White text belongs on primary, not on amber. Statuses must always include words; color alone is insufficient.

## Typography, spacing and shape

Self-hosted Public Sans variable, a practical legible face for operational screens. No remote font request.

- Body: 16px/1.5; secondary labels: 14px/1.5.
- Section heading: 20px/1.4, semibold; product-page heading target: 30px/1.2.
- Foundation preview heading: 30px mobile, 48px desktop. Do not reuse this display size for dense tables.
- Spacing: Tailwind's 4px scale; use 4, 8, 12, 16, 24, 32, 48px.
- Radius: 4px small, 6px controls, 8px surfaces.
- Equal horizontal content edges; max preview width 1024px, 20px mobile inset.

## Shared patterns for Phase 1

Only Button exists now (default/outline, Radix Slot composition, 44px minimum height, disabled state and keyboard focus). `components.json` configures shadcn/ui's new-york style, aliases, CSS variables and Lucide. Generate primitives incrementally and adapt them to these tokens; do not generate the entire component library in Phase 0.

- Cards: white, thin border, 8px radius, 24px padding; shadow only for elevated overlays.
- Tables: semantic table/caption/header cells; quiet row dividers; horizontal scrolling for data, never the whole viewport.
- Forms: visible labels, 44px controls, field-specific errors connected with aria-describedby; no placeholder-only labels.
- Sidebar/topbar: plan for a 240px desktop sidebar and 64px topbar; below 768px use a keyboard-accessible collapsible drawer. Implement in Phase 1.
- Feedback: skeletons/empty/error states, text statuses and confirmation dialogs in Phase 1 as needed.
- Motion: short interaction feedback only; all movement rests under prefers-reduced-motion.

Foundation layout:

```text
| brand ------------------------------------------------ |
| phase                                                  |
| project heading                                        |
| foundation explanation                                 |
| workshop ownership / handoff                           |
| scope                                                  |
| development footer ----------------------------------- |
```

No live metrics, invented testimonials, business actions or role menus appear in this preview. Browser checks must cover focus and 320–1440px widths; passing automation does not replace visual review.

## Phase 1 implementation

The palette, font, spacing scale and Button are preserved. src/app/AppShell.tsx now uses a 240px sidebar (80px collapsed), 80px topbar, 1280px maximum content width and 16/32/40px responsive horizontal insets. Below 768px the sidebar becomes a native modal drawer with 44px navigation controls. The topbar can wrap on narrow screens.

Login has a solid steel-blue brand panel beside the form on desktop; mobile keeps a compact brand header so the form appears promptly. Inputs use 16px text on mobile to avoid browser zoom and 14px on larger screens. No photographs, gradients or decorative animation were added.

Shared components: PageHeader, StatCard, StatusBadge, DataTable, EmptyState, ErrorState, LoadingState, UnauthorizedState, ConfirmationDialog and Dialog. Tables have captions/column headers and a keyboard-focusable overflow region. Statuses include text. Login errors are associated with visible labels/fields. Native dialogs provide inert background, controlled dismissal and focus restoration; explicit Tab wrapping keeps focus inside, and CSS locks background scrolling. Route changes focus the content without scrolling the topbar away. The skip link remains first in the keyboard order.

The four role pages are shared shell placeholders. Their cards show actual demo identity/session information, not invented business metrics. Operational data layouts remain for future phases. Frontend-design and taste guidance informed alignment, hierarchy and restraint; their marketing-only visual dealers and full-screen section gates remain inapplicable to this operational app scope.


## Phase 2 buyer screens

Buyer screens extend the existing shell and tokens; no redesign or new dependency. Four data-derived summary cards, a semantic jobs table, plain status counts, linked deadlines and an audit activity list replace the buyer placeholder. No decorative chart or fabricated metric is used.

The form uses a readable max-width, explicit labels, required/optional wording, grouped manufacturing/delivery/reference sections, visible field errors and a disabled pending/success state. Input text is 16px on mobile. Attachment copy explicitly says simulated metadata only.

JobsTable uses the shared DataTable with an optional generic row-click callback; native links in the first cell remain the keyboard and modifier-click targets. Tables scroll inside their own labelled, focusable region, with a mobile hint. PageHeader wraps long user titles; StatCard now exposes its label as a group name. These shared enhancements contain no buyer-specific domain logic.

Each buyer page loads lazily under a Suspense boundary inside the existing shell. Skeletons cover data loading; errors expose retry and empty lists explain a useful action. Focus, reduced-motion behavior and palette remain inherited. Eight desktop/mobile captures and 320–1440px browser checks are recorded in the Phase 2 report.


## Phase 3 buyer marketplace

Job-scoped navigation now connects brief, matches and quotations. Match results retain supplied ranking/explanations and show score, eligibility, invitation state, machine/capacity/profile information and accessible detail/confirmation dialogs. Empty results provide guidance without inventing recommendations.

Quotation tables show the source statuses, INR amounts, delivery commitments and notes. Native checkboxes select up to three records for a responsive side-by-side comparison. Selection does not imply award eligibility. Quote/profile dialogs reuse the shared native modal; valid reviews show exact terms plus a disabled order action and the current integration limitation.

The existing palette, typography, shared shell and reduced-motion behavior remain intact. No matching visual effect, decorative chart, rating input or new dependency was introduced.


## Phase 4 orders and tracking

The shell/tokens remain unchanged. Orders reuse the semantic DataTable and labelled overflow region. Commercial terms use tabular INR values; lifecycle badges include text. Details pair a workshop-owned vertical milestone timeline with the manufacturing brief and quotation, then read-only QC/rework, review and chronological activity.

Timeline markers encode completed/active/upcoming steps, with derived delayed labels. Native progress has an accessible name/value and an explicit completed-count label; empty plans stay unknown. Cancelled orders identify remaining steps as inactive history. Review controls reuse RHF/Zod fields and the existing confirmation dialog, including keyboard focus/escape handling. No decorative chart, photography, marketing hero, gradient or animation system is introduced.

## Phase 5 inspector workspace

Five data-derived inspector metrics lead into the attention queue, upcoming dates, recent decisions, rework follow-up and QC activity. Assigned list, rework and history reuse the shared semantic table/overflow region. No chart, new palette, decorative motion or global shell redesign was introduced.

Detail separates production, QC and rework states; supplied machining checks use labelled result/notes/evidence controls and a clear draft/submitted boundary. Error summaries receive keyboard focus; decision confirmation reuses native dialog focus/Tab/Escape behavior. Evidence metadata is explicitly session-only. Long notes wrap, controls remain at least 44px, and small-screen tables scroll internally.

FormField and DemoDataNotice now live under components/ for both buyer and inspector use; old buyer imports remain compatible. Existing Public Sans, colors, spacing and reduced-motion behavior remain. Marketing-only hero/effect gates are outside the operational UI scope.

## Phase 6 admin operations

Admin reuses the existing shell, palette, Public Sans, status badges, tables, page headers, feedback and confirmed demo reset. Seven derived summary cards and explicit record links lead into priority operational alerts, marketplace counts, recent jobs/orders, QC attention, workshop issues and activity. Mobile metrics use two columns; there is no invented eighth metric or decorative chart.

Directories provide labelled search/filter/sort and native record links. Stacked links remain separate targets; email columns preserve readable widths inside scrollable table regions. Deep records reuse consistent fact panels and related tables, with production and QC explicitly distinct. Unsupported fields/actions are identified without inventing verification/account states.

All Admin feature routes are lazy-loaded. No charting dependency, gradient, motion kit or global shell redesign was added. Screenshot/browser checks cover 320–1440px and keyboard navigation. Marketing hero/effect gates remain outside this operational scope.

## Phase 9A - current shared presentation

Earlier palettes describe historical phases. The current dedicated design branch uses Inter (including a real italic face), Geist Mono, white canvas, ink #0D0F14, cobalt #2F37D9 and slate #51556A, verified from the primary reference screenshot and Ampliflow public CSS. See [the full specification](phase-9a-design-specification.md) for provenance and explicitly approximated app values. Fonts are self-hosted under frontend/public/fonts with SIL OFL license texts; no runtime font CDN is required.

Use styles/globals.css variables and theme aliases rather than reintroducing page-specific branding. PageHeader is the operational heading, EditorialHeading is reserved for explicit editorial contexts, SectionLabel is the outlined mono label. Existing Button, FormField/controlClass, DataTable, StatCard, StatusBadge and Dialog APIs retain their behavior. Shared design-system.tsx supplies Card, SearchField, native FilterPanel, NavigationTabs, Notice and bounded Pagination. NavigationTabs are links with aria-current, not an ARIA tab widget without keyboard semantics.

Use the canonical shell for every role. Navigation, authentication, role guard and business services are unchanged. JobWorkspaceNav composes the shared link tabs with its original URLs. Specimens live on /foundation; its original Phase 0 content remains historical and its existing tests are preserved. No live marketplace record is created by the specimen controls.

Motion tokens: hover 150ms, press 90ms, panel/entrance 200ms, indicator 240ms; ease cubic-bezier(.2,.8,.2,1). Only actionable elements move on hover; static data cards remain still. Transitions use opacity/transform and colors, not layout dimensions. Reduced motion disables transitions/animations, retains current-state markers and keeps all content readable. Native modal closing is immediate so focus restoration and task completion are not delayed.

Dense page compositions, new discovery collections, matching-card redesigns and feature-specific forms/tracking/QC/admin layouts are reserved for later phases. Shared styling may change their typography, controls, borders and status presentation; it must not change a state transition or unlock a blocked business action.

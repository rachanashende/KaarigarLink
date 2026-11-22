# Phase 9C role experience design

Software: three authenticated manufacturing operations workspaces, continuous with the verified Buyer experience.
Branch design/phase-9a-ampliflow; clean base 2d4fea58e5b965244640929be78d188785879de6.
Protected backend aa99d866532a2f424545e4e07451e72932996467.

## Plan before implementation

Read Phase 9A specification, Phase 9B design/verification, canonical routes, role pages, read models, mutation handlers and existing tests. Reuse Inter/Geist Mono, cobalt #2F37D9, ink #0D0F14, slate #51556A, white and semantic labelled status colors. Keep natural-height operational layouts, equal edges, square controls, thin rules and existing restrained motion. No visual theme, photo/effect kit, dependency or invented measurement.

Reuse the existing Buyer header composition as a shared WorkspaceHeader; preserve the Buyer wrapper/API and appearance. Scope remaining-role layout through a shell class, without changing guards, session, sidebar behavior or destinations. Shared PageHeader, StatCard, DataTable, Button, Dialog, form fields and status badges stay authoritative.

Workshop: show the canonical identity and current action queues first, followed by owner-scoped metrics, invitation/order tables and dated submitted inspection activity. Count response/quote opportunities from existing service action flags; no inferred authorization. Invitation briefs expose capability and production requirements. Keep quote editing/validation/confirmation inline as established; improve its hierarchy, not its transaction flow. Profiles/capacity/accounts remain read-only. Preserve the disabled actions and explanatory workflow boundary.

Inspector: independent-QC dashboard and linked task queues, prominent context/specifications, native section navigation, distinct draft versus proposed outcome and immutable submitted history. Rework reason and corrective action remain tied to the recorded decision. Do not invent findings or measurements. Keep all validation, evidence metadata, confirmation, draft persistence and inspector-owned decisions unchanged.

Admin: factual platform overview, read-only oversight boundary, clear management navigation and directory filters, structured record sections and related links. Reuse existing alerts/counts. Use the shared FilterPanel disclosure and Card primitives for compact user/workshop summaries that link to the same records; keep the complete tables alongside them. No moderation/assignment/QC/award commands. Bounded canonical directories already fit the current dataset; retain full accessible tables and source-backed filters/sort instead of unnecessary paging that could hide records.

## Routes and protection

Preserve all existing workshop dashboard/invitations/invitation detail/orders/order detail/profile/settings/onboarding routes; inspector dashboard/assignments/detail/rework/history; admin dashboard and five list/detail pairs. No new route, provider or API. Shared services, store, domain types, fixtures, ownership, Buyer award restrictions and production/QC/payment boundaries remain unchanged. Retain both contributors' history.

## Verification plan

Retain 393 unit/component and 78 Chromium baseline cases. Add focused role interaction tests and source-backed dashboard checks. Verify 1440/1024/768/375/320, keyboard/mobile menus, focus, forms, empty/loading/error paths, reduced motion and read-only browsing. Capture every major route at desktop/mobile plus quote and proposed-rework forms. Inspect actual screenshots; keep only curated evidence in docs/evidence and raw reports under temp.

Run typecheck, lint, full unit tests, production build and full Chromium sequentially for predictable timings. Report actual results and failures. Installed frontend-design/taste principles apply within the operational brief; no marketing gate pass is claimed for an authenticated app. No commit, push, merge, branch switch or Phase 9D implementation.

# Phase 9B buyer marketplace design

Software: authenticated B2B manufacturing procurement workspace. Base 803b06c8e1f728e13d14504d1b9a1111313e2072; branch design/phase-9a-ampliflow; backend aa99d866532a2f424545e4e07451e72932996467.

## Plan reviewed against the brief

Keep Inter, Geist Mono, cobalt #2F37D9, ink #0D0F14, slate #51556A and white. Existing semantic status colors retain text. Reuse shared PageHeader, StatCard, DataTable, Button, Dialog, SectionLabel and tabs. Editorial scale belongs at the page opening; operational rows remain dense and legible. No photographs, fake recommendation badges, extra providers, dependencies or effect kit.

Dashboard: welcome and manufacturing CTA, four canonical metrics, real quotation activity and orders needing attention, linked pipeline, retained jobs/deadlines/activity.
Jobs: current URL-backed filters; table adds canonical quotation counts and contextual next action. Creation uses a three-part brief/quantity/files guide while preserving one validated submission.
Discovery: requirement summary followed by an open two-column workshop catalog. Explain matches before actions; preserve source ranking and eligibility. No unsupported filtering, distance or live availability.
Comparison: preserve selection of up to three quotes and every existing dialog/award blocker. Add factual price/delivery ranges and relative differences within the selected set, not recommendations.
Tracking: readable order table, strong summary, timeline, separate QC/rework/payment, unchanged review eligibility/confirmation.
Responsive: stack discovery and comparison on mobile, retain accessible horizontal table regions for wide operational data; equal edges, wrapping controls and natural document height.

## Scope and integration

Buyer-only layout class and CSS; local BuyerHeader and JobRequirementSummary; existing services/contracts remain untouched. Buyer navigation retains established accessible labels for compatibility and gains direct Post Job access. All protected paths, public homepage, authentication and other roles are preserved.

New dashboard and list read projections use existing buyer services only. No new API or shared domain field. Quote dates are delivery commitments; do not invent lead-time days without a quote creation date. The buyer order contract supplies no separate payment record; show its absence explicitly and distinguish the historical PAID lifecycle label. Buyer award, production, QC, payment and closure mutations remain unavailable. No tests removed or weakened.

Use installed frontend-design/taste guidance for alignment, typography, focus, restrained motion and real browser critique. Marketing gate prescriptions (full-screen sections, photo quotas, shaders) are inappropriate for this operational workspace; no marketing gate pass will be claimed. Run the full checks sequentially to avoid the prior parallel-run timeout contention. Capture all nine major route variants at desktop/mobile; stress 320/375/768/1024/1440 and inspect actual screenshots.

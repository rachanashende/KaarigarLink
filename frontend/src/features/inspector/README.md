# Inspector frontend — Member 4

Phase 5 only. InspectorDashboard, InspectionsPage (list/rework/history), InspectionDetailPage, QCChecklist, InspectionHistory and InspectionTable use the provider-owned InspectorService and scoped TanStack Query hooks.

Routes remain centralized in app/router.tsx with existing session/inspector guards and lazy loading. UI never imports fixtures or mutates stores.

Human findings are provisional: confirm one ACCEPTED/REWORK decision on an assigned pending QC assignment. The mock command preserves order production state; no payment/closure/milestone/reinspection action exists. Rework execution belongs to Member 3.

Save draft preserves checklist/summary only. Evidence metadata stays in current memory; reattach after reload. Submitted history is immutable. See docs/phase-5-qc-contracts.md and phase-5-verification.md at workspace root.

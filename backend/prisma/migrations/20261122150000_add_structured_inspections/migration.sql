-- M11: structured QC checklist results on inspections, and private inspection drafts.
-- Additive only: existing inspections keep checklist = NULL (their findings text is unchanged).

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "checklist" JSONB;

-- CreateTable
CREATE TABLE "InspectionDraft" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "checklist" JSONB NOT NULL,
    "findings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectionDraft_inspectorId_idx" ON "InspectionDraft"("inspectorId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionDraft_orderId_inspectorId_key" ON "InspectionDraft"("orderId", "inspectorId");

-- AddForeignKey
ALTER TABLE "InspectionDraft" ADD CONSTRAINT "InspectionDraft_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDraft" ADD CONSTRAINT "InspectionDraft_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

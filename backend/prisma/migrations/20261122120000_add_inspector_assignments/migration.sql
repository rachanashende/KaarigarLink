-- CreateTable
CREATE TABLE "InspectorAssignment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN DEFAULT true,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectorAssignment_inspectorId_active_idx" ON "InspectorAssignment"("inspectorId", "active");

-- CreateIndex
CREATE INDEX "InspectorAssignment_orderId_assignedAt_idx" ON "InspectorAssignment"("orderId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InspectorAssignment_orderId_active_key" ON "InspectorAssignment"("orderId", "active");

-- AddForeignKey
ALTER TABLE "InspectorAssignment" ADD CONSTRAINT "InspectorAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectorAssignment" ADD CONSTRAINT "InspectorAssignment_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectorAssignment" ADD CONSTRAINT "InspectorAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectorAssignment" ADD CONSTRAINT "InspectorAssignment_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Active rows have no end; ended rows have active = NULL (never false), so the
-- unique (orderId, active) allows exactly one active assignment per order.
ALTER TABLE "InspectorAssignment" ADD CONSTRAINT "InspectorAssignment_active_state_check"
    CHECK (("active" IS TRUE AND "endedAt" IS NULL AND "endedById" IS NULL) OR ("active" IS NULL AND "endedAt" IS NOT NULL));

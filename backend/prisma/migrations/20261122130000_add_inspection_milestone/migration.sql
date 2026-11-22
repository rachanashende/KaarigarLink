-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "milestoneId" TEXT;

-- CreateIndex
CREATE INDEX "Inspection_milestoneId_idx" ON "Inspection"("milestoneId");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

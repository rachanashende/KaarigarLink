-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedById" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- REFUNDED payments always record when and by whom; no other status has a refund time.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_state_check"
    CHECK (("status" = 'REFUNDED') = ("refundedAt" IS NOT NULL AND "refundedById" IS NOT NULL));

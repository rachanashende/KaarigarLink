-- M13: per-user session version for immediate token invalidation after a password change.
-- Additive. Generated with prisma migrate diff; the backfill below is the only hand-written part.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Backfill: tokens issued before M13 carry no version (read as 0). Users who already changed
-- their password under M12 move to version 1, so their pre-change tokens stay invalid
-- (M12 rejected them by timestamp). Their current tokens also predate this column, so they
-- sign in again once after this migration.
UPDATE "User" SET "tokenVersion" = 1 WHERE "passwordChangedAt" IS NOT NULL;

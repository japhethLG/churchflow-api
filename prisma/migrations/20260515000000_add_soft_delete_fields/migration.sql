-- Adds `deletedBy` and `deletedByCascade` columns to every soft-deletable
-- model. Switches CampaignItem.campaign to ON DELETE CASCADE (composition
-- relation, the only one we currently cascade). Replaces strict unique
-- constraints with partial unique indexes scoped to active rows so that
-- a tombstone does not occupy the identifier slot — see
-- src/infrastructure/prisma-client/soft-delete/ for the full design.
--
-- Prisma's generated client uses index NAMES to identify uniques for
-- `upsert(where: {<combo>})` lookups, so the partial indexes are
-- (re)created under the same names Prisma originally generated.

-- AlterTable
ALTER TABLE "Tenant"
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedByCascade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedByCascade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Member"
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedByCascade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Campaign"
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedByCascade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CampaignItem"
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedByCascade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Pledge"
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedByCascade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Transaction"
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedByCascade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invitation"
  ADD COLUMN "deletedBy" TEXT,
  ADD COLUMN "deletedByCascade" BOOLEAN NOT NULL DEFAULT false;

-- Composition cascade: archiving a Campaign cascade-archives its
-- CampaignItems via the application helper; if a Campaign is ever
-- HARD-deleted at the DB level, Postgres takes its items along too.
ALTER TABLE "CampaignItem" DROP CONSTRAINT "CampaignItem_campaignId_fkey";
ALTER TABLE "CampaignItem"
  ADD CONSTRAINT "CampaignItem_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique indexes. Slot is freed once a row is soft-deleted so
-- the identifier can be reclaimed by a new active row. Index names are
-- preserved so Prisma's `upsert(where: <combo>)` keeps working.
DROP INDEX "Tenant_slug_key";
CREATE UNIQUE INDEX "Tenant_slug_key"
  ON "Tenant"("slug")
  WHERE "deletedAt" IS NULL;

DROP INDEX "Member_tenantId_userId_key";
CREATE UNIQUE INDEX "Member_tenantId_userId_key"
  ON "Member"("tenantId", "userId")
  WHERE "deletedAt" IS NULL;

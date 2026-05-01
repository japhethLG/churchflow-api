/*
  Warnings:

  - You are about to drop the column `currency` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `fiscalYearStart` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `Transaction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "currency",
DROP COLUMN "fiscalYearStart",
DROP COLUMN "timezone";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "currency",
DROP COLUMN "paymentMethod";

-- DropEnum
DROP TYPE "PaymentMethod";

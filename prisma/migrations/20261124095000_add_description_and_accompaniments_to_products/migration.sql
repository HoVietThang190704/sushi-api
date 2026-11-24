-- AlterTable
ALTER TABLE "catalog"."products" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "catalog"."products" ADD COLUMN IF NOT EXISTS "accompaniments" VARCHAR(500);

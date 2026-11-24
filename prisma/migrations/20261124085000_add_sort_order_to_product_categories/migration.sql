-- AlterTable
ALTER TABLE "catalog"."product_categories" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

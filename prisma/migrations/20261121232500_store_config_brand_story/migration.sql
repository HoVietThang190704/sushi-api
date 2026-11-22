-- AlterTable: Add brand_story JSONB column to ordering.store_configs
ALTER TABLE "ordering"."store_configs"
ADD COLUMN IF NOT EXISTS "brand_story" JSONB;

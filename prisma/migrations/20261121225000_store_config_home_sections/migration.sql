-- AlterTable: Add curated_categories and culinary_news JSONB columns to ordering.store_configs
ALTER TABLE "ordering"."store_configs"
ADD COLUMN IF NOT EXISTS "curated_categories" JSONB,
ADD COLUMN IF NOT EXISTS "culinary_news" JSONB;

-- Add hero_banners JSONB column to ordering.store_configs for Admin customizable homepage banners
ALTER TABLE "ordering"."store_configs"
ADD COLUMN IF NOT EXISTS "hero_banners" JSONB;

-- Normalize all existing COMBO products to SINGLE so every dish has a unified BOM and COGS calculation
UPDATE "catalog"."products"
SET "type" = 'SINGLE'
WHERE "type" = 'COMBO';

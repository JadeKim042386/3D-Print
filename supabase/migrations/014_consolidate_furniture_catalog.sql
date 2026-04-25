-- Migration 014: Consolidate duplicate furniture tables
-- homefix_furniture was created during DPR-95 as a duplicate of the canonical
-- furniture_catalog table. This migration merges all data and FK references into
-- furniture_catalog, then drops the duplicate.

-- ── Step 1: Enhance furniture_catalog schema ────────────────────────────────

-- Allow nullable brand, image_url, name_en to match homefix_furniture schema
ALTER TABLE furniture_catalog
  ALTER COLUMN brand     DROP NOT NULL,
  ALTER COLUMN image_url DROP NOT NULL,
  ALTER COLUMN name_en   DROP NOT NULL;

-- Expand category constraint to include Korean categories used by homefix
ALTER TABLE furniture_catalog DROP CONSTRAINT IF EXISTS furniture_catalog_category_check;
ALTER TABLE furniture_catalog ADD CONSTRAINT furniture_catalog_category_check
  CHECK (category = ANY (ARRAY[
    'sofa','bed','table','chair','storage','desk',
    '소파','침대','식탁/의자','수납장','TV장','책상','주방가구','욕실가구','기타'
  ]));

-- Add homefix-specific columns
ALTER TABLE furniture_catalog
  ADD COLUMN IF NOT EXISTS model_url   TEXT,
  ADD COLUMN IF NOT EXISTS metadata    JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retailer_id UUID;

-- Add mm-unit dimension columns generated from cm columns for homefix compatibility
ALTER TABLE furniture_catalog
  ADD COLUMN IF NOT EXISTS width_mm  INTEGER GENERATED ALWAYS AS (width_cm  * 10) STORED,
  ADD COLUMN IF NOT EXISTS depth_mm  INTEGER GENERATED ALWAYS AS (depth_cm  * 10) STORED,
  ADD COLUMN IF NOT EXISTS height_mm INTEGER GENERATED ALWAYS AS (height_cm * 10) STORED;

-- ── Step 2: Migrate homefix_furniture rows into furniture_catalog ────────────
-- Preserve original IDs so existing homefix_placements rows continue to resolve.

INSERT INTO furniture_catalog (
  id, name_ko, name_en, category, brand,
  width_cm, depth_cm, height_cm,
  price_krw, image_url, affiliate_url,
  model_url, metadata, retailer_id,
  is_active, created_at, updated_at
)
SELECT
  id,
  name_ko,
  name_en,
  category,
  brand,
  (width_mm  / 10)::INTEGER AS width_cm,
  (depth_mm  / 10)::INTEGER AS depth_cm,
  (height_mm / 10)::INTEGER AS height_cm,
  COALESCE(price_krw, 0)    AS price_krw,
  image_url,
  affiliate_url,
  model_url,
  metadata,
  retailer_id,
  true       AS is_active,
  created_at,
  updated_at
FROM homefix_furniture
ON CONFLICT (id) DO NOTHING;

-- ── Step 3: Re-target homefix_placements FK to furniture_catalog ────────────
ALTER TABLE homefix_placements
  DROP CONSTRAINT homefix_placements_furniture_id_fkey;

ALTER TABLE homefix_placements
  ADD CONSTRAINT homefix_placements_furniture_id_fkey
    FOREIGN KEY (furniture_id) REFERENCES furniture_catalog(id) ON DELETE RESTRICT;

-- ── Step 4: Drop the now-redundant homefix_furniture table ──────────────────
DROP TABLE homefix_furniture;

-- ── Step 5: Add updated_at trigger to furniture_catalog ─────────────────────
CREATE OR REPLACE FUNCTION furniture_catalog_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'furniture_catalog_updated_at'
  ) THEN
    CREATE TRIGGER furniture_catalog_updated_at
      BEFORE UPDATE ON furniture_catalog
      FOR EACH ROW EXECUTE FUNCTION furniture_catalog_set_updated_at();
  END IF;
END $$;

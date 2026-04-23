-- Migration 013: furniture_products table
-- Product catalog for HomeFix — browsable, filterable, affiliate-linked

CREATE TABLE IF NOT EXISTS furniture_products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ko      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('bed','sofa','desk','table','chair','storage')),
  width_cm     INT  NOT NULL CHECK (width_cm > 0),
  depth_cm     INT  NOT NULL CHECK (depth_cm > 0),
  height_cm    INT  NOT NULL CHECK (height_cm > 0),
  price_krw    INT  NOT NULL CHECK (price_krw >= 0),
  image_url    TEXT,           -- Supabase Storage or external CDN
  affiliate_url TEXT,          -- Ohouse / Naver Shopping product link
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ohouse','naver','manual')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_furniture_products_category  ON furniture_products(category);
CREATE INDEX IF NOT EXISTS idx_furniture_products_is_active ON furniture_products(is_active);

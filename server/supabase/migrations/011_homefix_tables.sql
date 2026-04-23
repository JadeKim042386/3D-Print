-- Migration 011: HomeFix Interior Planner — API & Integration Layer tables
-- Furniture catalog, staging sessions, placements, render jobs, affiliate links, usage metering

-- ────────────────────────────────────────────────────────────
-- Furniture catalog
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homefix_furniture (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ko        TEXT NOT NULL,
  name_en        TEXT,
  category       TEXT NOT NULL CHECK (category IN (
                   '소파', '침대', '식탁/의자', '수납장', 'TV장',
                   '책상', '주방가구', '욕실가구', '기타'
                 )),
  brand          TEXT,
  width_mm       INTEGER NOT NULL CHECK (width_mm > 0),
  depth_mm       INTEGER NOT NULL CHECK (depth_mm > 0),
  height_mm      INTEGER NOT NULL CHECK (height_mm > 0),
  image_url      TEXT,
  model_url      TEXT,           -- GLB/GLTF 3D model, null until generated
  retailer_id    UUID,
  affiliate_url  TEXT,           -- direct purchase link
  price_krw      INTEGER,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homefix_furniture_category  ON homefix_furniture(category);
CREATE INDEX IF NOT EXISTS idx_homefix_furniture_brand     ON homefix_furniture(brand);

-- ────────────────────────────────────────────────────────────
-- Staging projects (one per user room-design session)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homefix_staging_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '내 공간',
  room_type    TEXT NOT NULL CHECK (room_type IN (
                 '거실', '침실', '주방', '화장실', '발코니', '기타'
               )),
  -- Room geometry (mm). Rectangular rooms use width/depth/height only.
  -- L-shaped rooms add l_width_mm / l_depth_mm for the second rectangle.
  room_width_mm   INTEGER NOT NULL CHECK (room_width_mm > 0),
  room_depth_mm   INTEGER NOT NULL CHECK (room_depth_mm > 0),
  room_height_mm  INTEGER NOT NULL DEFAULT 2400 CHECK (room_height_mm > 0),
  l_width_mm      INTEGER,       -- null for rectangular rooms
  l_depth_mm      INTEGER,       -- null for rectangular rooms
  session_data    JSONB NOT NULL DEFAULT '{}',  -- serialized canvas state
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'rendering', 'rendered', 'archived')),
  render_url      TEXT,          -- final photorealistic render
  thumbnail_url   TEXT,
  render_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homefix_staging_user   ON homefix_staging_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_homefix_staging_status ON homefix_staging_projects(status);

ALTER TABLE homefix_staging_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own staging projects"
  ON homefix_staging_projects
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Furniture placements within a staging project
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homefix_placements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES homefix_staging_projects(id) ON DELETE CASCADE,
  furniture_id   UUID NOT NULL REFERENCES homefix_furniture(id) ON DELETE RESTRICT,
  -- Position in mm from room origin (bottom-left corner)
  x_mm           INTEGER NOT NULL DEFAULT 0,
  y_mm           INTEGER NOT NULL DEFAULT 0,
  rotation_deg   NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (rotation_deg >= 0 AND rotation_deg < 360),
  -- Optional per-placement overrides
  label          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homefix_placements_project ON homefix_placements(project_id);

ALTER TABLE homefix_placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage placements in own projects"
  ON homefix_placements
  USING (
    EXISTS (
      SELECT 1 FROM homefix_staging_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM homefix_staging_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Render jobs (photorealistic render queue)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homefix_render_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES homefix_staging_projects(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
                     'queued', 'processing', 'completed', 'failed'
                   )),
  provider         TEXT NOT NULL DEFAULT 'meshy',
  provider_task_id TEXT,
  camera_preset    TEXT NOT NULL DEFAULT 'perspective' CHECK (camera_preset IN (
                     'top', 'perspective', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw'
                   )),
  staging_snapshot JSONB NOT NULL DEFAULT '{}',  -- frozen placement list at job creation
  result_url       TEXT,
  error_message    TEXT,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homefix_render_project ON homefix_render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_homefix_render_user    ON homefix_render_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_homefix_render_status  ON homefix_render_jobs(status);

ALTER TABLE homefix_render_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own render jobs"
  ON homefix_render_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Usage metering (render quota per user)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homefix_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_start  DATE NOT NULL,          -- billing period start (monthly)
  renders_used  INTEGER NOT NULL DEFAULT 0,
  renders_limit INTEGER NOT NULL DEFAULT 5,  -- freemium default
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_homefix_usage_user ON homefix_usage(user_id);

ALTER TABLE homefix_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own usage"
  ON homefix_usage FOR SELECT
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Updated_at triggers
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION homefix_handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER homefix_furniture_updated_at
  BEFORE UPDATE ON homefix_furniture
  FOR EACH ROW EXECUTE FUNCTION homefix_handle_updated_at();

CREATE TRIGGER homefix_staging_updated_at
  BEFORE UPDATE ON homefix_staging_projects
  FOR EACH ROW EXECUTE FUNCTION homefix_handle_updated_at();

CREATE TRIGGER homefix_placements_updated_at
  BEFORE UPDATE ON homefix_placements
  FOR EACH ROW EXECUTE FUNCTION homefix_handle_updated_at();

CREATE TRIGGER homefix_render_jobs_updated_at
  BEFORE UPDATE ON homefix_render_jobs
  FOR EACH ROW EXECUTE FUNCTION homefix_handle_updated_at();

CREATE TRIGGER homefix_usage_updated_at
  BEFORE UPDATE ON homefix_usage
  FOR EACH ROW EXECUTE FUNCTION homefix_handle_updated_at();

-- ────────────────────────────────────────────────────────────
-- Seed: minimal furniture catalog (Korean market)
-- ────────────────────────────────────────────────────────────
INSERT INTO homefix_furniture (name_ko, name_en, category, brand, width_mm, depth_mm, height_mm, price_krw) VALUES
  ('3인용 패브릭 소파', '3-Seater Fabric Sofa',       '소파',      'Hanssem', 2100, 900, 850, 890000),
  ('2인용 가죽 소파',   '2-Seater Leather Sofa',       '소파',      'Hanssem', 1600, 850, 840, 690000),
  ('퀸 침대 프레임',    'Queen Bed Frame',              '침대',      'IKEA Korea', 1680, 2150, 900, 450000),
  ('킹 침대 프레임',    'King Bed Frame',               '침대',      'IKEA Korea', 1990, 2150, 900, 590000),
  ('4인 식탁',         '4-Person Dining Table',         '식탁/의자', 'LX Hausys', 1200, 800, 760, 320000),
  ('6인 식탁',         '6-Person Dining Table',         '식탁/의자', 'LX Hausys', 1600, 900, 760, 480000),
  ('식탁 의자',        'Dining Chair',                  '식탁/의자', 'LX Hausys',  450, 450, 850, 89000),
  ('TV 거실장',        'TV Media Console',              'TV장',      'Hanssem',  1800, 400, 500, 340000),
  ('4단 책장',         '4-Tier Bookshelf',              '수납장',    'IKEA Korea', 800, 280, 1800, 149000),
  ('주방 상부장',       'Kitchen Upper Cabinet',        '주방가구',  'Hanssem',  2400, 350, 700, 780000),
  ('컴퓨터 책상',       'Computer Desk',                '책상',      'IKEA Korea', 1400, 600, 750, 199000),
  ('옷장 (2도어)',      '2-Door Wardrobe',              '수납장',    'Hanssem',  1600, 600, 2000, 560000)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- Atomic render usage increment (upsert)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION homefix_increment_render_usage(
  p_user_id      UUID,
  p_period_start DATE
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO homefix_usage (user_id, period_start, renders_used, renders_limit)
  VALUES (p_user_id, p_period_start, 1, 5)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET renders_used = homefix_usage.renders_used + 1,
                updated_at   = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

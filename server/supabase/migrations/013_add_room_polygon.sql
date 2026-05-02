-- DPR-184: add room_polygon column to homefix_staging_projects
-- Stores a free-form room outline as an ordered array of { x_mm, y_mm } points (mm, CW).
-- NULL means the project uses legacy rect/L-shape dimensions only.
ALTER TABLE homefix_staging_projects
  ADD COLUMN IF NOT EXISTS room_polygon jsonb DEFAULT NULL;

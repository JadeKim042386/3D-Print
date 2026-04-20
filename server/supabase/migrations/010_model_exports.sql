-- Migration 010: model_exports table for multi-format export caching
-- Tracks converted model files to avoid re-conversion

CREATE TABLE IF NOT EXISTS model_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('stl', 'obj', 'glb', 'gltf', '3mf')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converting', 'ready', 'failed')),
  file_url TEXT,
  file_size_bytes BIGINT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(model_id, format)
);

-- Index for fast lookup by model
CREATE INDEX IF NOT EXISTS idx_model_exports_model_id ON model_exports(model_id);
CREATE INDEX IF NOT EXISTS idx_model_exports_status ON model_exports(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_model_exports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER model_exports_updated_at
  BEFORE UPDATE ON model_exports
  FOR EACH ROW
  EXECUTE FUNCTION update_model_exports_updated_at();

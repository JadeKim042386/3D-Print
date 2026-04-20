-- Add print-readiness validation fields to models table
ALTER TABLE models ADD COLUMN IF NOT EXISTS print_quality_score smallint;
ALTER TABLE models ADD COLUMN IF NOT EXISTS print_ready boolean DEFAULT false;

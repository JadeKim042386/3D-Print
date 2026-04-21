-- Conversion funnel analytics: daily aggregated stats table
CREATE TABLE IF NOT EXISTS analytics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  -- Funnel stage counts
  landing_visits     int NOT NULL DEFAULT 0,
  signups            int NOT NULL DEFAULT 0,
  first_generations  int NOT NULL DEFAULT 0,
  total_generations  int NOT NULL DEFAULT 0,
  first_orders       int NOT NULL DEFAULT 0,
  total_orders       int NOT NULL DEFAULT 0,
  payments_completed int NOT NULL DEFAULT 0,
  plan_upgrades      int NOT NULL DEFAULT 0,
  -- Engagement
  dau                int NOT NULL DEFAULT 0,
  -- Revenue
  revenue_krw        bigint NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily (date DESC);

-- Analytics events log for real-time tracking before daily roll-up
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  event_name text NOT NULL,
  properties jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events (user_id, created_at DESC);

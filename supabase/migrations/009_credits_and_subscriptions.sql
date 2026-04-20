-- Migration 009: Credits & Subscription Billing System
-- Adds subscription_plans, user_credits, and credit_transactions tables

-- Subscription plans catalogue
CREATE TABLE IF NOT EXISTS subscription_plans (
  id         TEXT PRIMARY KEY,        -- 'free' | 'pro' | 'business'
  name       TEXT NOT NULL,
  name_ko    TEXT NOT NULL,
  price_krw  INTEGER NOT NULL DEFAULT 0,
  credits    INTEGER NOT NULL,        -- -1 = unlimited
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed canonical plan rows
INSERT INTO subscription_plans (id, name, name_ko, price_krw, credits) VALUES
  ('free',     'Free',     '무료',   0,      3),
  ('pro',      'Pro',      '프로',   29900,  30),
  ('business', 'Business', '비즈니스', 99900, -1)
ON CONFLICT (id) DO NOTHING;

-- Per-user credits state
CREATE TABLE IF NOT EXISTS user_credits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id          TEXT NOT NULL REFERENCES subscription_plans(id) DEFAULT 'free',
  credits_used     INTEGER NOT NULL DEFAULT 0,
  credits_limit    INTEGER NOT NULL DEFAULT 3,    -- -1 = unlimited
  period_start     DATE NOT NULL DEFAULT date_trunc('month', NOW())::DATE,
  period_end       DATE NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month - 1 day')::DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Audit ledger for every credit change
CREATE TABLE IF NOT EXISTS credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,                    -- negative = deducted, positive = added
  reason      TEXT NOT NULL,                       -- 'generation', 'admin_adjustment', 'monthly_reset'
  model_id    UUID REFERENCES models(id) ON DELETE SET NULL,
  admin_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id          ON user_credits (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id   ON credit_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created   ON credit_transactions (created_at);

-- RLS: users can read their own credits
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_read_own_transactions"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Updated_at trigger helper (reuse if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION set_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS '
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    ';
  END IF;
END $$;

CREATE TRIGGER user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Migration 008: Add admin role to users table
-- Adds role column for admin access control

-- Add role column to users table (default 'user')
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Add check constraint to enforce valid roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('user', 'admin'));
  END IF;
END
$$;

-- ── Admin RLS policies ──────────────────────────────────────────────────────

-- Allow admins to read all orders
CREATE POLICY "Admins can read all orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Admin policies for print_orders (applied when table exists)
-- These will be created via migration when print_orders table is migrated
-- CREATE POLICY "Admins can read all print_orders" ON print_orders ...
-- CREATE POLICY "Admins can update all print_orders" ON print_orders ...

-- Admin policies for models (read-only for admin)
CREATE POLICY "Admins can read all models"
  ON models FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Admin can read all users
CREATE POLICY "Admins can read all users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

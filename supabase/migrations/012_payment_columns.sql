-- Add payment columns to orders table for Toss Payments integration
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS payment_key TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS material_id TEXT,
  ADD COLUMN IF NOT EXISTS material_name TEXT,
  ADD COLUMN IF NOT EXISTS estimated_days INTEGER;

-- Update status check constraint to include 'paid' and 'failed'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'paid', 'printing', 'shipped', 'delivered', 'cancelled', 'failed'));

-- Index for webhook lookups by payment_key
CREATE INDEX IF NOT EXISTS idx_orders_payment_key ON orders(payment_key);

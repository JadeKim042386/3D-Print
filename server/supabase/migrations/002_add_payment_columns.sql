-- Add payment-related columns to orders table for Toss Payments integration

alter table public.orders
  add column order_name text,
  add column payment_provider text default 'toss' check (payment_provider in ('toss', 'kakaopay')),
  add column payment_key text unique,
  add column payment_method text,
  add column payment_status text default 'READY' check (payment_status in ('READY', 'IN_PROGRESS', 'DONE', 'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED')),
  add column customer_name text,
  add column customer_email text,
  add column approved_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancel_reason text,
  add column receipt_url text;

-- Make model_id optional (payment orders may not always reference a model)
alter table public.orders alter column model_id drop not null;

-- Index for payment lookups
create index idx_orders_payment_key on public.orders(payment_key);
create index idx_orders_payment_status on public.orders(payment_status);

-- Allow service role to update orders (for webhook handler)
create policy "Service role can update orders"
  on public.orders for update
  using (true)
  with check (true);

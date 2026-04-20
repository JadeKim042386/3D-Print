-- Print orders table for tracking 3D print orders from Korean and international providers
create table public.print_orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete restrict,
  provider_name text not null check (provider_name in ('3dline', 'craftcloud')),
  provider_order_id text,
  status text not null default 'quote_requested' check (status in (
    'quote_requested', 'quoted', 'order_placed', 'printing',
    'shipped', 'delivered', 'cancelled', 'failed'
  )),
  material text not null check (material in ('PLA', 'ABS', 'PETG', 'Resin', 'Nylon', 'TPU', 'Metal')),
  quantity integer not null default 1,
  price_krw integer,
  estimated_days integer,
  model_file_url text not null,
  shipping_address jsonb,
  customer_name text,
  customer_email text,
  customer_phone text,
  tracking_number text,
  tracking_url text,
  quote_method text check (quote_method in ('api', 'email')),
  provider_quote_id text,
  estimated_delivery_date date,
  notes text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_print_orders_user_id on public.print_orders(user_id);
create index idx_print_orders_model_id on public.print_orders(model_id);
create index idx_print_orders_status on public.print_orders(status);
create index idx_print_orders_provider on public.print_orders(provider_name);
create index idx_print_orders_provider_order_id on public.print_orders(provider_order_id);

-- RLS
alter table public.print_orders enable row level security;

create policy "Users can read own print orders"
  on public.print_orders for select using (auth.uid() = user_id);
create policy "Users can create print orders"
  on public.print_orders for insert with check (auth.uid() = user_id);

-- Service role can update (for webhook status updates)
-- Regular users cannot update print orders directly

-- Updated_at trigger
create trigger set_updated_at before update on public.print_orders
  for each row execute function public.handle_updated_at();

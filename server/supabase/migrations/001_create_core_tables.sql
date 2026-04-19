-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase Auth)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Models table
create table public.models (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  prompt text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  provider text not null default 'meshy',
  provider_task_id text,
  file_url text,
  thumbnail_url text,
  format text default 'glb' check (format in ('glb', 'stl', 'obj', 'gltf')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Orders table
create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'printing', 'shipped', 'delivered', 'cancelled')),
  print_provider text,
  shipping_address jsonb,
  total_price_krw integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Consents table (PIPA compliance)
create table public.consents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms_of_service', 'privacy_policy', 'marketing', 'data_processing', 'third_party_sharing')),
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  version text not null default '1.0',
  created_at timestamptz not null default now(),
  unique(user_id, consent_type, version)
);

-- Indexes
create index idx_models_user_id on public.models(user_id);
create index idx_models_status on public.models(status);
create index idx_orders_user_id on public.orders(user_id);
create index idx_orders_model_id on public.orders(model_id);
create index idx_consents_user_id on public.consents(user_id);

-- RLS policies
alter table public.users enable row level security;
alter table public.models enable row level security;
alter table public.orders enable row level security;
alter table public.consents enable row level security;

create policy "Users can read own profile" on public.users for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

create policy "Users can read own models" on public.models for select using (auth.uid() = user_id);
create policy "Users can create models" on public.models for insert with check (auth.uid() = user_id);
create policy "Users can delete own models" on public.models for delete using (auth.uid() = user_id);

create policy "Users can read own orders" on public.orders for select using (auth.uid() = user_id);
create policy "Users can create orders" on public.orders for insert with check (auth.uid() = user_id);

create policy "Users can read own consents" on public.consents for select using (auth.uid() = user_id);
create policy "Users can create consents" on public.consents for insert with check (auth.uid() = user_id);
create policy "Users can update own consents" on public.consents for update using (auth.uid() = user_id);

-- Updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.users for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.models for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.orders for each row execute function public.handle_updated_at();

-- Auto-create user profile on auth signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Add new Korean print providers: creatable3d, printon3d
-- Extends the provider_name CHECK constraint on print_orders

alter table public.print_orders
  drop constraint if exists print_orders_provider_name_check;

alter table public.print_orders
  add constraint print_orders_provider_name_check
  check (provider_name in ('3dline', 'craftcloud', 'creatable3d', 'printon3d'));

-- Provider metadata table for marketplace listing
create table if not exists public.print_providers (
  name text primary key,
  display_name text not null,
  display_name_ko text not null,
  description text,
  description_ko text,
  location text not null default 'Seoul, KR',
  supports_api boolean not null default false,
  supports_webhook boolean not null default false,
  materials text[] not null default '{}',
  min_lead_days integer not null default 3,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed provider metadata
insert into public.print_providers (name, display_name, display_name_ko, description, description_ko, location, supports_api, supports_webhook, materials, min_lead_days)
values
  ('3dline', '3DLINE', '3D라인', 'Seoul-based 3D printing with expert finishing', '서울 소재 전문 후가공 3D 프린팅', 'Seoul, KR', false, false, '{PLA,ABS,PETG,Resin,Nylon,TPU,Metal}', 3),
  ('craftcloud', 'Craftcloud', 'Craftcloud', 'International 3D printing marketplace', '글로벌 3D 프린팅 마켓플레이스', 'International', true, true, '{PLA,ABS,PETG,Resin,Nylon,TPU,Metal}', 5),
  ('creatable3d', 'Creatable3D', '크리에이터블3D', 'Korean rapid prototyping with competitive pricing', '경쟁력 있는 가격의 한국 쾌속 시제품 제작', 'Seoul, KR', true, true, '{PLA,ABS,PETG,Resin,Nylon,TPU,Metal}', 2),
  ('printon3d', 'PrintOn3D', '프린트온3D', 'Fast turnaround for Seoul metro area', '수도권 빠른 출력 서비스', 'Incheon, KR', true, true, '{PLA,ABS,PETG,Resin,Nylon,TPU}', 2)
on conflict (name) do nothing;

-- RLS: everyone can read provider info
alter table public.print_providers enable row level security;

create policy "Anyone can read providers"
  on public.print_providers for select
  using (true);

-- Add public visibility flag to models
alter table public.models
  add column if not exists is_public boolean not null default false;

create index if not exists idx_models_is_public on public.models(is_public)
  where is_public = true;

-- Allow anonymous reads for public models (gallery + public model preview)
create policy "Public models are readable by all" on public.models
  for select using (is_public = true and status = 'ready');

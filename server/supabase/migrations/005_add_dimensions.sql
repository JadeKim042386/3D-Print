-- Add dimensional accuracy columns to models table
-- Users can specify exact physical dimensions (mm) and we track how accurately
-- the generated mesh matches those constraints post-processing.

alter table public.models
  add column if not exists width_mm          numeric(10,3),
  add column if not exists height_mm         numeric(10,3),
  add column if not exists depth_mm          numeric(10,3),
  add column if not exists scaling_mode      text check (scaling_mode in ('proportional', 'exact')),
  add column if not exists actual_width_mm   numeric(10,3),
  add column if not exists actual_height_mm  numeric(10,3),
  add column if not exists actual_depth_mm   numeric(10,3),
  add column if not exists dimensional_accuracy_pct numeric(5,2);

comment on column public.models.width_mm  is 'User-requested width in mm';
comment on column public.models.height_mm is 'User-requested height in mm';
comment on column public.models.depth_mm  is 'User-requested depth in mm';
comment on column public.models.scaling_mode is 'proportional = uniform scale; exact = per-axis scale';
comment on column public.models.actual_width_mm  is 'Measured AABB width after dimension post-processing';
comment on column public.models.actual_height_mm is 'Measured AABB height after dimension post-processing';
comment on column public.models.actual_depth_mm  is 'Measured AABB depth after dimension post-processing';
comment on column public.models.dimensional_accuracy_pct is '100 = perfect accuracy; lower = larger error';

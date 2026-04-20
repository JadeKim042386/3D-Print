-- Distinguish AI-generated models (via Meshy) from dimension-based models
-- (parametric CSG or dimension-aware AI from the dimension service).
alter table public.models
  add column if not exists generation_type text
    check (generation_type in ('ai', 'parametric', 'dimension_aware_ai'))
    default 'ai';

comment on column public.models.generation_type is
  'ai = Meshy text-to-3D; parametric = CSG exact math; dimension_aware_ai = AI designed to dimensions';

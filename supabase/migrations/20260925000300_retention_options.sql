-- Catalogul de opțiuni de retenție (FR-038). Sume în bani (1 leu = 100 bani).

create table public.retention_options (
  id uuid primary key default gen_random_uuid(),
  months int not null unique check (months between 1 and 60),
  surcharge_minor bigint not null check (surcharge_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger retention_options_updated_at
  before update on public.retention_options
  for each row execute function public.set_updated_at();

alter table public.retention_options enable row level security;
revoke all on table public.retention_options from anon, authenticated;
grant select, insert, update, delete on table public.retention_options to authenticated;

create policy retention_options_admin_all on public.retention_options
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy retention_options_read_active on public.retention_options
  for select to authenticated
  using (active);

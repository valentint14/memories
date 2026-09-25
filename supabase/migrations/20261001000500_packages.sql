-- 002: pachetul complet și setările self-service (FR-014–FR-016, FR-021; research R7).

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  price_minor bigint not null default 0 check (price_minor >= 0),
  max_files_per_guest int not null default 50 check (max_files_per_guest between 1 and 1000),
  max_photo_bytes bigint not null default 52428800 check (max_photo_bytes between 1 and 52428800),
  max_video_bytes bigint not null default 1073741824 check (max_video_bytes between 1 and 1073741824),
  -- Opțiunea de retenție inclusă; se completează de administrator (seed local: 3 luni).
  retention_option_id uuid references public.retention_options (id) on delete restrict,
  updated_at timestamptz not null default now()
);

create trigger packages_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

-- Opțiunea inclusă trebuie să fie activă (verificată la salvare; activarea o reverifică).
create function public.packages_check_option()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.retention_option_id is not null and not exists (
    select 1 from public.retention_options ro where ro.id = new.retention_option_id and ro.active
  ) then
    perform public.raise_app_error('OPTION_INACTIVE');
  end if;
  return new;
end;
$$;

create trigger packages_check_option
  before insert or update of retention_option_id on public.packages
  for each row execute function public.packages_check_option();

insert into public.packages (code, name) values ('complete', 'Pachet complet');

alter table public.packages enable row level security;
revoke all on table public.packages from anon, authenticated;
grant select, update on table public.packages to authenticated;

-- Organizatorul vede prețul curent (FR-018); doar administratorul modifică.
create policy packages_read on public.packages for select to authenticated using (true);
create policy packages_admin_update on public.packages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.self_service_settings (
  id boolean primary key default true check (id),
  max_awaiting_events_per_organizer int not null default 2
    check (max_awaiting_events_per_organizer between 1 and 20),
  updated_at timestamptz not null default now()
);

create trigger self_service_settings_updated_at
  before update on public.self_service_settings
  for each row execute function public.set_updated_at();

insert into public.self_service_settings default values;

alter table public.self_service_settings enable row level security;
revoke all on table public.self_service_settings from anon, authenticated;
grant select, update on table public.self_service_settings to authenticated;

create policy self_service_settings_admin_select on public.self_service_settings
  for select to authenticated using (public.is_admin());
create policy self_service_settings_admin_update on public.self_service_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Evenimentele existente au pachetul complet.
alter table public.events
  add constraint events_package_fk foreign key (package_id) references public.packages (id) on delete restrict;

update public.events set package_id = (select id from public.packages where code = 'complete')
 where package_id is null;

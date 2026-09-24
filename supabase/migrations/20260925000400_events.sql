-- Evenimente (data-model.md › events; FR-001–FR-010, FR-038–FR-047).

create table public.events (
  id uuid primary key default gen_random_uuid(),
  -- 128 biți aleatori, base64url fără padding (22 caractere) — FR-004.
  public_token text not null unique
    default translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'),
  name text check (name is null or char_length(name) between 1 and 120 and name = btrim(name)),
  event_date date not null,
  organizer_email extensions.citext
    check (organizer_email is null or organizer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  upload_starts_at timestamptz not null,
  upload_ends_at timestamptz not null,
  max_files_per_guest int not null default 50 check (max_files_per_guest between 1 and 1000),
  max_photo_bytes bigint not null default 52428800 check (max_photo_bytes between 1 and 52428800),
  max_video_bytes bigint not null default 1073741824 check (max_video_bytes between 1 and 1073741824),
  base_price_minor bigint not null check (base_price_minor >= 0),
  retention_option_id uuid not null references public.retention_options (id) on delete restrict,
  -- Snapshot-ul opțiunii la momentul alegerii (FR-039); setat de trigger.
  retention_months int not null default 1 check (retention_months between 1 and 60),
  retention_surcharge_minor bigint not null default 0 check (retention_surcharge_minor >= 0),
  final_price_minor bigint generated always as (base_price_minor + retention_surcharge_minor) stored,
  purge_at timestamptz not null default now(),
  expired_at timestamptz,
  anonymized_at timestamptz,
  status public.event_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_upload_window check (upload_ends_at > upload_starts_at),
  constraint events_identity_until_anonymized
    check (anonymized_at is not null or (name is not null and organizer_email is not null)),
  constraint events_anonymized_only_expired
    check (anonymized_at is null or status = 'expired')
);

create index events_organizer_email_idx on public.events (organizer_email);
create index events_purge_at_active_idx on public.events (purge_at) where status = 'active';

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- Snapshot-ul opțiunii de retenție și data ștergerii automate (FR-040).
-- „+N luni” se calculează în ora locală (Europe/Bucharest), ca ziua calendaristică să rămână aceeași.
create function public.compute_purge_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_months int;
  v_surcharge bigint;
  v_active boolean;
begin
  if tg_op = 'INSERT' or new.retention_option_id is distinct from old.retention_option_id then
    select ro.months, ro.surcharge_minor, ro.active
      into v_months, v_surcharge, v_active
      from public.retention_options ro
     where ro.id = new.retention_option_id;
    if not found or not v_active then
      perform public.raise_app_error('OPTION_INACTIVE');
    end if;
    new.retention_months := v_months;
    new.retention_surcharge_minor := v_surcharge;
  end if;

  if tg_op = 'UPDATE' and old.status <> 'active' and (
       new.upload_ends_at is distinct from old.upload_ends_at
    or new.retention_option_id is distinct from old.retention_option_id
    or new.base_price_minor is distinct from old.base_price_minor) then
    perform public.raise_app_error('EVENT_NOT_ACTIVE');
  end if;

  new.purge_at := ((new.upload_ends_at at time zone 'Europe/Bucharest')
                   + make_interval(months => new.retention_months))
                  at time zone 'Europe/Bucharest';

  if tg_op = 'UPDATE' and new.purge_at is distinct from old.purge_at and new.purge_at <= now() then
    perform public.raise_app_error('RETENTION_DATE_IN_PAST');
  end if;

  return new;
end;
$$;

create trigger events_compute_purge_at
  before insert or update on public.events
  for each row execute function public.compute_purge_at();

-- Acces (data-model.md › events › RLS). Organizatorul nu vede public_token (privilegii pe coloane).
alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant insert, update on table public.events to authenticated;
grant select (
  id, name, event_date, organizer_email, upload_starts_at, upload_ends_at,
  max_files_per_guest, max_photo_bytes, max_video_bytes, base_price_minor,
  retention_option_id, retention_months, retention_surcharge_minor, final_price_minor,
  purge_at, expired_at, anonymized_at, status, created_at, updated_at
) on table public.events to authenticated;

create policy events_admin_select on public.events
  for select to authenticated using (public.is_admin());
create policy events_admin_insert on public.events
  for insert to authenticated with check (public.is_admin());
create policy events_admin_update on public.events
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy events_organizer_select on public.events
  for select to authenticated
  using (
    organizer_email = (auth.jwt() ->> 'email')::extensions.citext
    and status in ('active', 'expiring', 'expired')
  );

-- Vedere fără token pentru organizator (RLS-ul tabelului se aplică prin security_invoker).
create view public.organizer_events
with (security_invoker = true) as
  select id, name, event_date, upload_starts_at, upload_ends_at, final_price_minor,
         retention_months, purge_at, expired_at, status
    from public.events;

revoke all on public.organizer_events from anon, authenticated;
grant select on public.organizer_events to authenticated;

-- Tokenul public, doar pentru administrator (link de upload și cod QR).
create function public.admin_event_token(p_event_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  select e.public_token into v_token from public.events e where e.id = p_event_id;
  if v_token is null then
    perform public.raise_app_error('NOT_FOUND');
  end if;
  return v_token;
end;
$$;

revoke execute on function public.admin_event_token(uuid) from public;
grant execute on function public.admin_event_token(uuid) to authenticated;

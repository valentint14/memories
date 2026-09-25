-- 002: coloanele noi ale evenimentului (data-model.md › Modificări la events).

alter table public.events
  add column origin public.event_origin not null default 'admin',
  add column package_id uuid,
  add column activated_at timestamptz,
  -- Doar pentru `awaiting_activation`: sfârșitul zilei event_date + 30 (FR-019).
  add column pending_purge_at timestamptz,
  -- Ștergerea cerută de organizator păstrează rândul de facturare al unui eveniment activat (FR-035).
  add column deletion_keeps_billing boolean not null default false;

-- Evenimentele din 001 erau active de la creare.
update public.events set activated_at = created_at where activated_at is null;

-- Câmpurile comerciale se stabilesc la activare (FR-016, FR-025).
alter table public.events
  alter column upload_starts_at drop not null,
  alter column upload_ends_at drop not null,
  alter column base_price_minor drop not null,
  alter column retention_option_id drop not null,
  alter column purge_at drop not null,
  alter column purge_at drop default;

alter table public.events
  add constraint events_activation_fields check (
    status in ('unconfirmed', 'awaiting_activation')
    or (upload_starts_at is not null and upload_ends_at is not null and base_price_minor is not null
        and retention_option_id is not null and purge_at is not null)
  ),
  add constraint events_pending_purge_only_awaiting check (
    pending_purge_at is null or status = 'awaiting_activation'
  );

create index events_pending_purge_idx on public.events (pending_purge_at) where status = 'awaiting_activation';
create index events_unconfirmed_created_idx on public.events (created_at) where status = 'unconfirmed';

-- Snapshot-ul opțiunii de retenție și data ștergerii automate (001/FR-040), doar după activare.
create or replace function public.compute_purge_at()
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
  if new.retention_option_id is null or new.upload_ends_at is null then
    new.purge_at := null;
    return new;
  end if;

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

  -- După activare, doar evenimentele active își pot schimba fereastra, prețul sau opțiunea.
  if tg_op = 'UPDATE' and old.status not in ('active', 'unconfirmed', 'awaiting_activation') and (
       new.upload_ends_at is distinct from old.upload_ends_at
    or new.retention_option_id is distinct from old.retention_option_id
    or new.base_price_minor is distinct from old.base_price_minor) then
    perform public.raise_app_error('EVENT_NOT_ACTIVE');
  end if;

  new.purge_at := ((new.upload_ends_at at time zone 'Europe/Bucharest')
                   + make_interval(months => new.retention_months))
                  at time zone 'Europe/Bucharest';

  if tg_op = 'UPDATE' and old.purge_at is not null and new.purge_at is distinct from old.purge_at
     and new.purge_at <= now() then
    perform public.raise_app_error('RETENTION_DATE_IN_PAST');
  end if;

  return new;
end;
$$;

-- Coloanele noi, vizibile administratorului; organizatorul le vede prin `organizer_events`.
grant select (origin, package_id, activated_at, pending_purge_at) on table public.events to authenticated;

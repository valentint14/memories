-- Activarea și prelungirea plătite (003: FR-002, FR-005, FR-020, FR-022; research R6). Prețul și
-- opțiunea vin din plata înghețată la pregătire, nu din pachetul și catalogul curente: se aplică
-- exact ce s-a încasat.

-- Snapshot-ul opțiunii de retenție (001/FR-040, 002): ca în 20261001000200, plus suprascrierea
-- din plată. `app.payment_snapshot` = {"months": n, "surcharge": m}, setat local tranzacției de
-- funcțiile de plată; opțiunea plătită se aplică și dacă a fost dezactivată între timp.
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
  v_snapshot jsonb := nullif(current_setting('app.payment_snapshot', true), '')::jsonb;
begin
  if new.retention_option_id is null or new.upload_ends_at is null then
    new.purge_at := null;
    return new;
  end if;

  if tg_op = 'INSERT' or new.retention_option_id is distinct from old.retention_option_id then
    if v_snapshot is not null then
      new.retention_months := (v_snapshot ->> 'months')::int;
      new.retention_surcharge_minor := (v_snapshot ->> 'surcharge')::bigint;
    else
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

drop function public.activate_event(uuid, public.status_change_source, text, text);

-- Ca în 20261001002000, plus `p_payment_id`: obligatoriu pentru sursa `payment`, interzis pentru
-- `admin`. Cu plată, prețul de bază, opțiunea și snapshot-ul suplimentului vin din plată.
create function public.activate_event(
  p_event_id uuid,
  p_source public.status_change_source,
  p_reason text default null,
  p_external_ref text default null,
  p_payment_id uuid default null
)
returns table (already_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  pkg public.packages;
  pay public.payments;
  v_end date;
begin
  if p_source = 'admin' then
    if not public.is_admin() or p_payment_id is not null then
      perform public.raise_app_error('FORBIDDEN');
    end if;
  elsif p_source = 'payment' then
    if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
      perform public.raise_app_error('FORBIDDEN');
    end if;
    select * into pay from public.payments p where p.id = p_payment_id;
    if not found or pay.event_id is distinct from p_event_id or pay.purpose <> 'activation' then
      perform public.raise_app_error('FORBIDDEN');
    end if;
  else
    perform public.raise_app_error('FORBIDDEN');
  end if;
  select * into e from public.events ev where ev.id = p_event_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND');
  end if;

  if p_external_ref is not null and exists (
    select 1 from public.event_status_changes c where c.event_id = p_event_id and c.external_ref = p_external_ref
  ) then
    return query select true;
    return;
  end if;

  if e.status = 'active' then
    perform public.transition_event(p_event_id, 'active', p_source, auth.uid(), p_reason, p_external_ref, 'activare repetată');
    return query select true;
    return;
  end if;
  if e.status <> 'awaiting_activation' then
    perform public.raise_app_error('INVALID_TRANSITION');
  end if;

  select * into pkg from public.packages p where p.code = 'complete';
  if not found then
    perform public.raise_app_error('OPTION_INACTIVE');
  end if;
  if p_payment_id is null and (pkg.retention_option_id is null
     or not exists (select 1 from public.retention_options ro where ro.id = pkg.retention_option_id and ro.active)) then
    perform public.raise_app_error('OPTION_INACTIVE');
  end if;

  if p_payment_id is not null then
    perform set_config('app.payment_snapshot',
      jsonb_build_object('months', pay.retention_months, 'surcharge', pay.surcharge_minor)::text, true);
    perform set_config('app.retention_actor', 'payment', true);
  end if;

  -- Uploadul se închide la sfârșitul zilei de după eveniment, dar cel puțin o zi după activare (FR-034).
  v_end := greatest(e.event_date, (now() at time zone 'Europe/Bucharest')::date) + 2;
  perform public.allow_event_write();
  update public.events
     set package_id = pkg.id,
         base_price_minor = case when p_payment_id is null then pkg.price_minor else pay.base_price_minor end,
         max_files_per_guest = pkg.max_files_per_guest,
         max_photo_bytes = pkg.max_photo_bytes,
         max_video_bytes = pkg.max_video_bytes,
         retention_option_id = case when p_payment_id is null then pkg.retention_option_id else pay.retention_option_id end,
         upload_starts_at = now(),
         upload_ends_at = v_end::timestamp at time zone 'Europe/Bucharest',
         activated_at = now(),
         pending_purge_at = null
   where id = p_event_id;

  if p_payment_id is not null then
    perform set_config('app.payment_snapshot', '', true);
    perform set_config('app.retention_actor', '', true);
  end if;
  perform public.transition_event(p_event_id, 'active', p_source, auth.uid(), p_reason, p_external_ref);
  return query select false;
end;
$$;

revoke execute on function public.activate_event(uuid, public.status_change_source, text, text, uuid) from public, anon;
grant execute on function public.activate_event(uuid, public.status_change_source, text, text, uuid) to authenticated, service_role;

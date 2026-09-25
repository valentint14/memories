-- 002: activarea pachetului complet, suspendarea și editarea evenimentelor neactivate de către
-- administrator (FR-016, FR-020, FR-025, FR-026, FR-028; contracts/database-functions.md › Stări).

create function public.assert_reason(p_reason text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    perform public.raise_app_error('REASON_REQUIRED');
  end if;
end;
$$;

revoke execute on function public.assert_reason(text) from public, anon, authenticated;

-- Aceeași operație pentru administrator și, ulterior, pentru sistemul de plăți (FR-025).
-- Idempotentă (FR-026): pe un eveniment deja activ scrie doar istoricul; o referință de plată deja
-- înregistrată nu mai scrie nimic.
create function public.activate_event(
  p_event_id uuid,
  p_source public.status_change_source,
  p_reason text,
  p_external_ref text default null
)
returns table (already_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  pkg public.packages;
  v_end date;
begin
  if p_source = 'admin' then
    if not public.is_admin() then
      perform public.raise_app_error('FORBIDDEN');
    end if;
  elsif p_source = 'payment' then
    if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
      perform public.raise_app_error('FORBIDDEN');
    end if;
  else
    perform public.raise_app_error('FORBIDDEN');
  end if;
  perform public.assert_reason(p_reason);

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
  if not found or pkg.retention_option_id is null
     or not exists (select 1 from public.retention_options ro where ro.id = pkg.retention_option_id and ro.active) then
    perform public.raise_app_error('OPTION_INACTIVE');
  end if;

  -- Uploadul se închide la sfârșitul zilei de după eveniment, dar cel puțin o zi după activare (FR-034).
  v_end := greatest(e.event_date, (now() at time zone 'Europe/Bucharest')::date) + 2;
  perform public.allow_event_write();
  update public.events
     set package_id = pkg.id,
         base_price_minor = pkg.price_minor,
         max_files_per_guest = pkg.max_files_per_guest,
         max_photo_bytes = pkg.max_photo_bytes,
         max_video_bytes = pkg.max_video_bytes,
         retention_option_id = pkg.retention_option_id,
         upload_starts_at = now(),
         upload_ends_at = v_end::timestamp at time zone 'Europe/Bucharest',
         activated_at = now(),
         pending_purge_at = null
   where id = p_event_id;
  perform public.transition_event(p_event_id, 'active', p_source, auth.uid(), p_reason, p_external_ref);
  return query select false;
end;
$$;

revoke execute on function public.activate_event(uuid, public.status_change_source, text, text) from public, anon;
grant execute on function public.activate_event(uuid, public.status_change_source, text, text) to authenticated, service_role;

create function public.suspend_event(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  perform public.assert_reason(p_reason);
  perform public.transition_event(p_event_id, 'suspended', 'admin', auth.uid(), p_reason);
end;
$$;

create function public.reactivate_event(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  perform public.assert_reason(p_reason);
  select e.status into v_status from public.events e where e.id = p_event_id;
  if v_status is distinct from 'suspended' then
    perform public.raise_app_error('INVALID_TRANSITION');
  end if;
  perform public.transition_event(p_event_id, 'active', 'admin', auth.uid(), p_reason);
end;
$$;

-- Numele și data unui eveniment neactivat (FR-028); restul se stabilește la activare.
create function public.admin_update_pending_event(p_event_id uuid, p_name text, p_event_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  select e.status into v_status from public.events e where e.id = p_event_id for update;
  if v_status is distinct from 'awaiting_activation' then
    perform public.raise_app_error('INVALID_TRANSITION');
  end if;
  perform public.assert_event_input(p_name, p_event_date);
  perform public.allow_event_write();
  update public.events
     set name = btrim(p_name),
         event_date = p_event_date,
         pending_purge_at = ((p_event_date + 31)::timestamp) at time zone 'Europe/Bucharest'
   where id = p_event_id;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'suspend_event(uuid, text)',
    'reactivate_event(uuid, text)',
    'admin_update_pending_event(uuid, text, date)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

-- Prelungirea retenției doar pentru evenimentele active (FR-020, FR-028a): un eveniment suspendat
-- sau neactivat primește un cod clar, nu „expirat”.
do $$
declare
  def text := pg_get_functiondef('public.extend_retention(uuid, uuid, bigint)'::regprocedure);
  patched text;
begin
  patched := replace(
    def,
    $q$  if e.status <> 'active' or now() >= e.purge_at then$q$,
    $q$  if e.status in ('suspended', 'awaiting_activation') then
    perform public.raise_app_error('EVENT_NOT_ACTIVE');
  end if;
  if e.status <> 'active' or now() >= e.purge_at then$q$
  );
  if patched = def then
    raise exception 'Condiția de stare nu a fost găsită în extend_retention';
  end if;
  execute patched;
end;
$$;

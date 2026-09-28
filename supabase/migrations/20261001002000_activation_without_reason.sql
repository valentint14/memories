-- Activarea nu mai cere motiv: administratorul confirmă evenimentul (nume, organizator) într-un
-- dialog, iar istoricul păstrează sursa, autorul și momentul (FR-024, FR-028). Suspendarea și
-- reactivarea rămân cu motiv obligatoriu. Corpul e cel din 20261001001500, fără `assert_reason`.

drop function public.activate_event(uuid, public.status_change_source, text, text);

create function public.activate_event(
  p_event_id uuid,
  p_source public.status_change_source,
  p_reason text default null,
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

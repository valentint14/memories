-- 002: organizatorul își modifică și își șterge evenimentele (FR-033–FR-035, FR-028a).

-- Numele și data (FR-033). Pentru self-service, perioada de upload se recalculează cât timp nu s-a
-- încheiat (FR-034); pentru un eveniment neactivat, data ștergerii automate (FR-019).
create function public.organizer_update_event(p_event_id uuid, p_name text, p_event_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_end timestamptz;
begin
  select * into e from public.events ev
   where ev.id = p_event_id
     and ev.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
   for update;
  if not found or e.status not in ('awaiting_activation', 'active', 'suspended') then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  if e.status = 'suspended' then
    perform public.raise_app_error('EVENT_SUSPENDED');
  end if;
  perform public.assert_event_input(p_name, p_event_date);

  perform public.allow_event_write();
  perform set_config('app.retention_actor', 'organizer', true);
  if e.status = 'awaiting_activation' then
    update public.events
       set name = btrim(p_name),
           event_date = p_event_date,
           pending_purge_at = ((p_event_date + 31)::timestamp) at time zone 'Europe/Bucharest'
     where id = p_event_id;
    return;
  end if;

  v_end := e.upload_ends_at;
  if e.origin = 'self_service' and now() <= e.upload_ends_at then
    v_end := (greatest(p_event_date, (e.activated_at at time zone 'Europe/Bucharest')::date) + 2)::timestamp
             at time zone 'Europe/Bucharest';
  end if;
  update public.events
     set name = btrim(p_name),
         event_date = p_event_date,
         upload_ends_at = v_end
   where id = p_event_id;
end;
$$;

revoke execute on function public.organizer_update_event(uuid, text, date) from public, anon;
grant execute on function public.organizer_update_event(uuid, text, date) to authenticated;

-- Ștergerea (001/FR-006b), acum și pentru organizatorul proprietar (FR-035). Un eveniment niciodată
-- activat nu are fișiere și nici facturare: dispare direct. Unul activat trece prin `deleting`;
-- dacă ștergerea o cere organizatorul, rândul de facturare rămâne (complete_event_expiry).
create or replace function public.request_event_deletion(p_event_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_source public.status_change_source;
  v_orphan uuid;
begin
  select * into e from public.events ev where ev.id = p_event_id for update;
  if public.is_admin() then
    v_source := 'admin';
  elsif found and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
        and e.status in ('awaiting_activation', 'active', 'suspended') then
    v_source := 'organizer';
  else
    perform public.raise_app_error('FORBIDDEN');
  end if;
  if not found or e.status in ('deleting', 'unconfirmed') then
    perform public.raise_app_error('NOT_FOUND');
  end if;
  -- Evenimentele anonimizate nu mai au nume; se confirmă cu textul „șterge”.
  if coalesce(e.name, 'șterge') is distinct from p_confirm_name then
    perform public.raise_app_error('CONFIRMATION_MISMATCH');
  end if;

  if e.activated_at is null then
    delete from public.events where id = p_event_id;
    v_orphan := public.orphan_organizer_user_id(e.organizer_email);
    if v_orphan is not null then
      perform pgmq.send('media_jobs', jsonb_build_object('type', 'delete_organizer_user', 'user_id', v_orphan));
    end if;
    return;
  end if;

  if v_source = 'organizer' then
    perform public.allow_event_write();
    update public.events set deletion_keeps_billing = true where id = p_event_id;
  end if;
  perform public.transition_event(p_event_id, 'deleting', v_source, auth.uid());
  update public.archive_jobs set status = 'expired'
   where archive_jobs.event_id = p_event_id and status in ('pending', 'building', 'ready');
  perform pgmq.send('media_jobs', jsonb_build_object('type', 'purge_event', 'event_id', p_event_id));
end;
$$;

-- 002: ștergerea evenimentelor neactivate la 30 de zile după data lor și avertizarea de 7 zile
-- (FR-019, SC-013; research R6). Evenimentele neactivate nu au fișiere, deci nu e nevoie de Storage.

create function public.purge_unactivated_events(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_orphan uuid;
  v_count int := 0;
begin
  for r in
    select e.id, e.organizer_email, e.pending_purge_at
      from public.events e
     where e.status = 'awaiting_activation' and e.pending_purge_at <= p_now
     for update skip locked
  loop
    -- Istoricul dispare odată cu evenimentul; ștergerea rămâne în jurnalul de audit.
    insert into public.app_audit_log (event_id, action, details)
    values (r.id, 'auto_deleted_unactivated', jsonb_build_object('pending_purge_at', r.pending_purge_at));
    delete from public.events where id = r.id;
    v_orphan := public.orphan_organizer_user_id(r.organizer_email);
    if v_orphan is not null then
      perform pgmq.send('media_jobs', jsonb_build_object('type', 'delete_organizer_user', 'user_id', v_orphan));
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- O singură avertizare per eveniment și per dată de ștergere (unicitatea din retention_notices).
create function public.enqueue_activation_notices(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    insert into public.retention_notices (event_id, threshold, purge_at)
    select e.id, 'activation_7d', e.pending_purge_at
      from public.events e
     where e.status = 'awaiting_activation'
       and e.pending_purge_at > p_now
       and e.pending_purge_at <= p_now + interval '7 days'
    on conflict (event_id, threshold, purge_at) do nothing
    returning event_id, purge_at
  loop
    perform pgmq.send('media_jobs', jsonb_build_object(
      'type', 'retention_notice', 'event_id', r.event_id, 'threshold', 'activation_7d', 'purge_at', r.purge_at
    ));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.purge_unactivated_events(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_unactivated_events(timestamptz) to service_role;
revoke execute on function public.enqueue_activation_notices(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_activation_notices(timestamptz) to service_role;

select cron.schedule('purge-unactivated', '5 * * * *', $$select public.purge_unactivated_events()$$);
select cron.schedule('activation-notices', '10 * * * *', $$select public.enqueue_activation_notices()$$);

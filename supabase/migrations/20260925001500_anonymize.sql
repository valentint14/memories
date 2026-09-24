-- Anonimizarea datelor de facturare la 3 ani după expirare (FR-047, research.md R17).

create function public.anonymize_expired_events(p_now timestamptz default now())
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
    select ev.id, ev.organizer_email
      from public.events ev
     where ev.status = 'expired'
       and ev.anonymized_at is null
       and ev.expired_at < p_now - interval '3 years'
     for update skip locked
  loop
    update public.events set name = null, organizer_email = null, anonymized_at = p_now where id = r.id;
    update public.event_retention_changes set actor_user_id = null where event_id = r.id;
    v_orphan := public.orphan_organizer_user_id(r.organizer_email);
    if v_orphan is not null then
      perform pgmq.send('media_jobs', jsonb_build_object('type', 'delete_organizer_user', 'user_id', v_orphan));
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.anonymize_expired_events(timestamptz) from public, anon, authenticated;
grant execute on function public.anonymize_expired_events(timestamptz) to service_role;

select cron.schedule('anonymize_expired_events', '30 3 * * *', $$select public.anonymize_expired_events()$$);

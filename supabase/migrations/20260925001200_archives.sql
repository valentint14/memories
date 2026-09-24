-- Arhive ZIP pentru descărcarea în masă (US4, research.md R9).

-- Organizatorul cere arhiva evenimentului; reutilizează jobul activ, dacă există (FR-030).
create function public.request_archive(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_id uuid;
begin
  select * into e from public.events ev
   where ev.id = p_event_id
     and ev.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
   for update;
  if not found then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  if e.status <> 'active' then
    perform public.raise_app_error('EVENT_EXPIRED');
  end if;
  if not exists (select 1 from public.media_items m where m.event_id = p_event_id and m.status = 'ready') then
    perform public.raise_app_error('EMPTY_EVENT');
  end if;

  select a.id into v_id from public.archive_jobs a
   where a.event_id = p_event_id and a.status in ('pending', 'building');
  if found then
    return v_id;
  end if;

  insert into public.archive_jobs (event_id, requested_by, status)
  values (p_event_id, auth.uid(), 'pending')
  returning id into v_id;
  perform pgmq.send('media_jobs', jsonb_build_object('type', 'build_archive', 'archive_job_id', v_id));
  return v_id;
end;
$$;

revoke execute on function public.request_archive(uuid) from public, anon;
grant execute on function public.request_archive(uuid) to authenticated;

-- Arhivele expiră după 24 h: obiectul se șterge de worker (`delete_archive`).
create function public.expire_archives()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    update public.archive_jobs set status = 'expired'
     where status = 'ready' and expires_at < now()
     returning id
  loop
    perform pgmq.send('media_jobs', jsonb_build_object('type', 'delete_archive', 'archive_job_id', v_id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.expire_archives() from public, anon, authenticated;

select cron.schedule('expire_archives', '*/15 * * * *', $$select public.expire_archives()$$);

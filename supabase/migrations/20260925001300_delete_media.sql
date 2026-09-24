-- Ștergerea definitivă a fișierelor de către organizator (US5, FR-031, FR-032, research.md R11).

-- Marchează fișierele `deleting` (dispar imediat din galerie și din arhivele noi), invalidează
-- arhivele evenimentului și întoarce căile de șters prin Storage API. Worker-ul golește apoi
-- prefixul fiecărui fișier (inclusiv variante produse după ștergere) — `purge_media`.
create function public.delete_media(p_event_id uuid, p_media_ids uuid[])
returns table (media_id uuid, paths text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_ids uuid[];
  r record;
begin
  select * into e from public.events ev
   where ev.id = p_event_id
     and ev.organizer_email = (auth.jwt() ->> 'email')::extensions.citext;
  if not found then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  if e.status <> 'active' then
    perform public.raise_app_error('EVENT_EXPIRED');
  end if;
  if coalesce(array_length(p_media_ids, 1), 0) > 500 then
    perform public.raise_app_error('VALIDATION');
  end if;

  with marked as (
    update public.media_items m set status = 'deleting'
     where m.event_id = p_event_id
       and m.id = any(p_media_ids)
       and m.status in ('uploaded', 'processing', 'ready', 'failed')
     returning m.id
  )
  select array_agg(id) into v_ids from marked;

  if v_ids is null then
    return;
  end if;

  -- Nicio arhivă nu poate conține fișiere șterse: jobul în lucru se oprește, cea gata se șterge.
  for r in
    update public.archive_jobs a set status = 'expired'
     where a.event_id = p_event_id and a.status in ('pending', 'building', 'ready')
     returning a.id, a.archive_path
  loop
    if r.archive_path is not null then
      perform pgmq.send('media_jobs', jsonb_build_object('type', 'delete_archive', 'archive_job_id', r.id));
    end if;
  end loop;

  perform pgmq.send('media_jobs', jsonb_build_object(
    'type', 'purge_media', 'media_ids', to_jsonb(v_ids), 'event_id', p_event_id
  ));

  return query
    select m.id,
           array_remove(array[m.original_path, m.display_path, m.thumb_path, m.playback_path], null)
      from public.media_items m
     where m.id = any(v_ids)
     order by m.uploaded_at, m.id;
end;
$$;

-- După ștergerea obiectelor din Storage, rândurile `deleting` se șterg imediat.
create function public.finalize_media_deletion(p_media_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.media_items m
   using public.events e
   where m.id = any(p_media_ids)
     and m.status = 'deleting'
     and e.id = m.event_id
     and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.delete_media(uuid, uuid[]) from public, anon;
grant execute on function public.delete_media(uuid, uuid[]) to authenticated;
revoke execute on function public.finalize_media_deletion(uuid[]) from public, anon;
grant execute on function public.finalize_media_deletion(uuid[]) to authenticated;

-- Reconciliere: rândurile rămase `deleting` (ex. Storage indisponibil) se reiau prin worker.
create function public.reconcile_deletions()
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
    select m.event_id, array_agg(m.id) as ids
      from public.media_items m
     where m.status = 'deleting' and m.updated_at < now() - interval '5 minutes'
     group by m.event_id
  loop
    perform pgmq.send('media_jobs', jsonb_build_object(
      'type', 'purge_media', 'media_ids', to_jsonb(r.ids), 'event_id', r.event_id
    ));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.reconcile_deletions() from public, anon, authenticated;

select cron.schedule('reconcile_deletions', '*/10 * * * *', $$select public.reconcile_deletions()$$);

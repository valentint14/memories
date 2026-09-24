-- Funcții de administrare (US1): statistici agregate, ștergerea evenimentului, conturi orfane.

-- Doar agregate, niciodată căi sau nume de fișiere (FR-007).
create function public.admin_event_stats(p_event_id uuid default null)
returns table (event_id uuid, file_count int, total_bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  return query
    select e.id,
           count(m.id)::int,
           coalesce(sum(coalesce(m.actual_bytes, m.declared_bytes)), 0)::bigint
      from public.events e
      left join public.media_items m
        on m.event_id = e.id and m.status in ('uploaded', 'processing', 'ready', 'failed')
     where p_event_id is null or e.id = p_event_id
     group by e.id;
end;
$$;

revoke execute on function public.admin_event_stats(uuid) from public, anon;
grant execute on function public.admin_event_stats(uuid) to authenticated;

-- Ștergerea definitivă a unui eveniment (FR-006b): linkul devine invalid imediat, apoi worker-ul
-- golește Storage-ul (`purge_event`) și șterge rândurile în cascadă.
create function public.request_event_deletion(p_event_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_status public.event_status;
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  select e.name, e.status into v_name, v_status from public.events e where e.id = p_event_id for update;
  if not found or v_status = 'deleting' then
    perform public.raise_app_error('NOT_FOUND');
  end if;
  -- Evenimentele anonimizate nu mai au nume; se confirmă cu textul „șterge”.
  if coalesce(v_name, 'șterge') is distinct from p_confirm_name then
    perform public.raise_app_error('CONFIRMATION_MISMATCH');
  end if;
  update public.events set status = 'deleting' where id = p_event_id;
  update public.archive_jobs set status = 'expired'
   where archive_jobs.event_id = p_event_id and status in ('pending', 'building', 'ready');
  perform pgmq.send('media_jobs', jsonb_build_object('type', 'purge_event', 'event_id', p_event_id));
end;
$$;

revoke execute on function public.request_event_deletion(uuid, text) from public, anon;
grant execute on function public.request_event_deletion(uuid, text) to authenticated;

-- Contul Auth al unui organizator care nu mai are niciun eveniment și nu e admin (FR-047).
create function public.orphan_organizer_user_id(p_email extensions.citext)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
   where u.email::extensions.citext = p_email
     and not exists (select 1 from public.events e where e.organizer_email = p_email)
     and not exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
   limit 1;
$$;

revoke execute on function public.orphan_organizer_user_id(extensions.citext) from public, anon, authenticated;
grant execute on function public.orphan_organizer_user_id(extensions.citext) to service_role;

-- Folosit de worker după `purge_event`: emailul organizatorului înainte de ștergerea rândului.
create function public.event_organizer_email(p_event_id uuid)
returns extensions.citext
language sql
stable
security definer
set search_path = ''
as $$
  select e.organizer_email from public.events e where e.id = p_event_id;
$$;

revoke execute on function public.event_organizer_email(uuid) from public, anon, authenticated;
grant execute on function public.event_organizer_email(uuid) to service_role;

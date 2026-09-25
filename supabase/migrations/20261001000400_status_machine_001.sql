-- 002: funcțiile din 001 care schimbau starea direct trec prin transition_event (research R5).

-- Ștergerea definitivă (001/FR-006b), sursa `admin`.
create or replace function public.request_event_deletion(p_event_id uuid, p_confirm_name text)
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
  perform public.transition_event(p_event_id, 'deleting', 'admin', auth.uid());
  update public.archive_jobs set status = 'expired'
   where archive_jobs.event_id = p_event_id and status in ('pending', 'building', 'ready');
  perform pgmq.send('media_jobs', jsonb_build_object('type', 'purge_event', 'event_id', p_event_id));
end;
$$;

-- Expirarea automată (001/FR-044), inclusiv pentru evenimentele suspendate.
create or replace function public.expire_due_events(p_now timestamptz default now())
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
    select ev.id, ev.status from public.events ev
     where (ev.status in ('active', 'suspended') and ev.purge_at <= p_now)
        or (ev.status = 'expiring' and ev.updated_at < p_now - interval '1 hour')
     for update skip locked
  loop
    if r.status <> 'expiring' then
      perform public.transition_event(r.id, 'expiring', 'system', null);
    end if;
    update public.archive_jobs set status = 'expired'
     where event_id = r.id and status in ('pending', 'building', 'ready');
    perform pgmq.send('media_jobs', jsonb_build_object('type', 'expire_event', 'event_id', r.id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Finalizarea expirării (001/FR-044) sau a ștergerii care păstrează facturarea (002/FR-035):
-- rămâne doar rândul de facturare.
create or replace function public.complete_event_expiry(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_keeps_billing boolean;
begin
  select e.status, e.deletion_keeps_billing into v_status, v_keeps_billing
    from public.events e where e.id = p_event_id for update;
  if not found or not (v_status = 'expiring' or (v_status = 'deleting' and v_keeps_billing)) then
    return;
  end if;
  delete from public.media_items where event_id = p_event_id;
  delete from public.archive_jobs where event_id = p_event_id;
  delete from public.guest_sessions where event_id = p_event_id;
  delete from public.retention_notices where event_id = p_event_id;
  perform public.transition_event(p_event_id, 'expired', 'system', null);
  perform public.allow_event_write();
  update public.events
     set expired_at = now(),
         deletion_keeps_billing = false,
         public_token = translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')
   where id = p_event_id;
end;
$$;

-- Anonimizarea (001/FR-047) golește și autorul și motivul din istoricul stărilor.
create or replace function public.anonymize_expired_events(p_now timestamptz default now())
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
    perform public.allow_event_write();
    update public.events set name = null, organizer_email = null, anonymized_at = p_now where id = r.id;
    update public.event_retention_changes set actor_user_id = null where event_id = r.id;
    update public.event_status_changes set actor_user_id = null, reason = null where event_id = r.id;
    v_orphan := public.orphan_organizer_user_id(r.organizer_email);
    if v_orphan is not null then
      perform pgmq.send('media_jobs', jsonb_build_object('type', 'delete_organizer_user', 'user_id', v_orphan));
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

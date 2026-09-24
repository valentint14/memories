-- Retenție și preț (US8, FR-038–FR-046, research.md R17).

-- Oferta de prelungire: pentru fiecare opțiune activă, prețul final și data de ștergere rezultate.
create function public.retention_quote(p_event_id uuid)
returns table (
  option_id uuid, months int, surcharge_minor bigint, final_price_minor bigint, purge_at timestamptz, selectable boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events ev
   where ev.id = p_event_id
     and (public.is_admin() or ev.organizer_email = (auth.jwt() ->> 'email')::extensions.citext);
  if not found then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  return query
    select ro.id, ro.months, ro.surcharge_minor, e.base_price_minor + ro.surcharge_minor,
           ((e.upload_ends_at at time zone 'Europe/Bucharest') + make_interval(months => ro.months))
             at time zone 'Europe/Bucharest',
           e.status = 'active' and ro.months > e.retention_months
      from public.retention_options ro
     where ro.active
     order by ro.months;
end;
$$;

-- Prelungirea de către organizator: doar spre o opțiune mai lungă, la prețul confirmat (FR-041, FR-042).
create function public.extend_retention(p_event_id uuid, p_option_id uuid, p_expected_final_price_minor bigint)
returns table (final_price_minor bigint, purge_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  o public.retention_options;
begin
  select * into e from public.events ev
   where ev.id = p_event_id
     and ev.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
   for update;
  if not found then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  if e.status <> 'active' or now() >= e.purge_at then
    perform public.raise_app_error('RETENTION_EXPIRED');
  end if;

  select * into o from public.retention_options ro where ro.id = p_option_id;
  if not found or not o.active then
    perform public.raise_app_error('OPTION_INACTIVE');
  end if;
  if o.months <= e.retention_months then
    perform public.raise_app_error('RETENTION_NOT_LONGER');
  end if;
  if e.base_price_minor + o.surcharge_minor <> p_expected_final_price_minor then
    perform public.raise_app_error('PRICE_CHANGED', jsonb_build_object('finalPriceMinor', e.base_price_minor + o.surcharge_minor));
  end if;

  perform set_config('app.retention_actor', 'organizer', true);
  update public.events ev set retention_option_id = p_option_id where ev.id = p_event_id;
  return query select ev.final_price_minor, ev.purge_at from public.events ev where ev.id = p_event_id;
end;
$$;

revoke execute on function public.retention_quote(uuid) from public, anon;
grant execute on function public.retention_quote(uuid) to authenticated;
revoke execute on function public.extend_retention(uuid, uuid, bigint) from public, anon;
grant execute on function public.extend_retention(uuid, uuid, bigint) to authenticated;

-- Expirarea automată (FR-044): evenimentele scadente trec în `expiring`, apoi worker-ul golește
-- Storage-ul și apelează complete_event_expiry. Reia și evenimentele blocate în `expiring` (job pierdut).
create function public.expire_due_events(p_now timestamptz default now())
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
    select ev.id from public.events ev
     where (ev.status = 'active' and ev.purge_at <= p_now)
        or (ev.status = 'expiring' and ev.updated_at < p_now - interval '1 hour')
     for update skip locked
  loop
    update public.events set status = 'expiring' where id = v_id and status = 'active';
    update public.archive_jobs set status = 'expired'
     where event_id = v_id and status in ('pending', 'building', 'ready');
    perform pgmq.send('media_jobs', jsonb_build_object('type', 'expire_event', 'event_id', v_id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Avertizările de 30 de zile / 7 zile / 1 zi (FR-045): una per prag și per dată de ștergere; dacă
-- mai multe praguri sunt depășite, doar cel mai apropiat de data ștergerii.
create function public.enqueue_retention_notices(p_now timestamptz default now())
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
    select ev.id,
           case
             when p_now >= ev.purge_at - interval '1 day' then '1d'
             when p_now >= ev.purge_at - interval '7 days' then '7d'
             else '30d'
           end::public.notice_threshold,
           ev.purge_at
      from public.events ev
     where ev.status = 'active'
       and p_now >= ev.purge_at - interval '30 days'
       and p_now < ev.purge_at
    on conflict (event_id, threshold, purge_at) do nothing
    returning event_id, threshold, purge_at
  loop
    perform pgmq.send('media_jobs', jsonb_build_object(
      'type', 'retention_notice', 'event_id', r.event_id, 'threshold', r.threshold, 'purge_at', r.purge_at
    ));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Finalizarea expirării, după golirea Storage: rămâne doar rândul de facturare (FR-044).
create function public.complete_event_expiry(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.media_items where event_id = p_event_id;
  delete from public.archive_jobs where event_id = p_event_id;
  delete from public.guest_sessions where event_id = p_event_id;
  delete from public.retention_notices where event_id = p_event_id;
  update public.events
     set status = 'expired',
         expired_at = now(),
         public_token = translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')
   where id = p_event_id and status = 'expiring';
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'expire_due_events(timestamptz)',
    'enqueue_retention_notices(timestamptz)',
    'complete_event_expiry(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end;
$$;

select cron.schedule('expire_due_events', '5 * * * *', $$select public.expire_due_events()$$);
select cron.schedule('enqueue_retention_notices', '20 * * * *', $$select public.enqueue_retention_notices()$$);

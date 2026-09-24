-- Funcțiile invitaților (US2, contracts/database-functions.md). Apelate doar de server (service role).

-- Starea paginii de upload: open | not_started | ended | not_found (FR-020).
create function public.resolve_event_for_guest(p_token text)
returns table (event_id uuid, name text, state text, upload_starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
begin
  select ev.id, ev.name, ev.status, ev.upload_starts_at, ev.upload_ends_at
    into e
    from public.events ev
   where ev.public_token = p_token;
  if not found or e.status <> 'active' then
    return query select null::uuid, null::text, 'not_found'::text, null::timestamptz;
    return;
  end if;
  return query select
    e.id,
    e.name,
    case
      when now() < e.upload_starts_at then 'not_started'
      when now() > e.upload_ends_at then 'ended'
      else 'open'
    end,
    e.upload_starts_at;
end;
$$;

-- Evenimentul activ al unui token, blocat pentru actualizare; ridică eroarea stabilă potrivită.
create function public.guest_open_event(p_token text)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events ev where ev.public_token = p_token;
  if not found or e.status <> 'active' then
    perform public.raise_app_error('EVENT_NOT_FOUND');
  end if;
  if now() < e.upload_starts_at then
    perform public.raise_app_error('UPLOAD_NOT_STARTED');
  end if;
  if now() > e.upload_ends_at then
    perform public.raise_app_error('UPLOAD_ENDED');
  end if;
  return e;
end;
$$;

-- Limite (research.md R13, revizuite: 200 de invitați de pe același Wi-Fi — SC-006).
create function public.guest_rate_limit(p_key text, p_limit int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.check_rate_limit(p_key, p_limit, interval '1 minute') then
    perform public.raise_app_error(
      'RATE_LIMITED',
      jsonb_build_object('retryAfterSec', public.rate_limit_retry_after(interval '1 minute'))
    );
  end if;
end;
$$;

-- Creează sesiunea anonimă a unui dispozitiv (FR-018). Numele e opțional, max 50 de caractere.
create function public.start_guest_session(p_token text, p_ip_hash text, p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_id uuid;
begin
  e := public.guest_open_event(p_token);
  if v_name is not null and char_length(v_name) > 50 then
    perform public.raise_app_error('NAME_TOO_LONG');
  end if;
  perform public.guest_rate_limit('guest_session:event:' || e.id, 300);
  perform public.guest_rate_limit('guest_session:ip:' || p_ip_hash, 300);
  insert into public.guest_sessions (event_id, display_name) values (e.id, v_name) returning id into v_id;
  return v_id;
end;
$$;

-- Actualizează numele afișat al unei sesiuni existente (idempotență pentru startGuestSession).
create function public.update_guest_name(p_session_id uuid, p_token text, p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_name is not null and char_length(v_name) > 50 then
    perform public.raise_app_error('NAME_TOO_LONG');
  end if;
  update public.guest_sessions gs
     set display_name = v_name, last_seen_at = now()
    from public.events ev
   where gs.id = p_session_id and ev.id = gs.event_id and ev.public_token = p_token;
  if not found then
    perform public.raise_app_error('SESSION_MISSING');
  end if;
end;
$$;

-- Rezervă un fișier: toate verificările de admitere într-o singură tranzacție (FR-017).
-- `p_replace_media_id` reia o rezervare nefinalizată a aceleiași sesiuni (reselectare după
-- reîncărcarea paginii — FR-016a), fără a consuma din nou limita.
create function public.reserve_upload(
  p_session_id uuid,
  p_token text,
  p_filename text,
  p_mime text,
  p_bytes bigint,
  p_replace_media_id uuid default null
)
returns table (media_id uuid, path text, remaining int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  s public.guest_sessions;
  v_kind public.media_kind;
  v_max bigint;
  v_id uuid;
  v_path text;
begin
  e := public.guest_open_event(p_token);

  select * into s from public.guest_sessions gs where gs.id = p_session_id for update;
  if not found or s.event_id <> e.id then
    perform public.raise_app_error('SESSION_MISSING');
  end if;

  if p_mime in ('image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp') then
    v_kind := 'photo';
    v_max := e.max_photo_bytes;
  elsif p_mime in ('video/mp4', 'video/quicktime') then
    v_kind := 'video';
    v_max := e.max_video_bytes;
  else
    perform public.raise_app_error('FILE_TYPE_NOT_ALLOWED');
  end if;

  if p_bytes is null or p_bytes <= 0 or p_bytes > v_max then
    perform public.raise_app_error('FILE_TOO_LARGE', jsonb_build_object('maxBytes', v_max));
  end if;

  perform public.guest_rate_limit('reserve:session:' || s.id, 30);
  perform public.guest_rate_limit('reserve:event:' || e.id, 2000);

  if p_replace_media_id is not null then
    select m.id, m.incoming_path into v_id, v_path
      from public.media_items m
     where m.id = p_replace_media_id and m.guest_session_id = s.id and m.status = 'reserved';
    if found then
      update public.media_items
         set original_filename = left(coalesce(nullif(btrim(p_filename), ''), 'fisier'), 255),
             declared_mime = p_mime, declared_bytes = p_bytes, kind = v_kind
       where id = v_id;
      return query select v_id, v_path, (e.max_files_per_guest - s.files_reserved)::int;
      return;
    end if;
  end if;

  if s.files_reserved >= e.max_files_per_guest then
    perform public.raise_app_error('FILE_LIMIT_REACHED', jsonb_build_object('limit', e.max_files_per_guest));
  end if;

  v_id := gen_random_uuid();
  v_path := e.id || '/' || v_id;
  insert into public.media_items (
    id, event_id, guest_session_id, guest_name, kind, declared_mime, original_filename, declared_bytes, incoming_path
  ) values (
    v_id, e.id, s.id, s.display_name, v_kind, p_mime,
    left(coalesce(nullif(btrim(p_filename), ''), 'fisier'), 255), p_bytes, v_path
  );
  update public.guest_sessions set files_reserved = files_reserved + 1, last_seen_at = now() where id = s.id;
  return query select v_id, v_path, (e.max_files_per_guest - s.files_reserved - 1)::int;
end;
$$;

-- Fișierele sesiunii curente — niciodată ale altor invitați (FR-016a, FR-022).
create function public.guest_uploads(p_session_id uuid)
returns table (media_id uuid, name text, status public.media_status, remaining int)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.original_filename, m.status, (e.max_files_per_guest - s.files_reserved)::int
    from public.guest_sessions s
    join public.events e on e.id = s.event_id
    join public.media_items m on m.guest_session_id = s.id
   where s.id = p_session_id and m.status not in ('rejected', 'deleting')
   order by m.created_at;
$$;

-- Numărul de fișiere rămase pentru o sesiune (fără fișiere încă).
create function public.guest_remaining(p_session_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (e.max_files_per_guest - s.files_reserved)::int
    from public.guest_sessions s join public.events e on e.id = s.event_id
   where s.id = p_session_id;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'resolve_event_for_guest(text)',
    'guest_open_event(text)',
    'guest_rate_limit(text, int)',
    'start_guest_session(text, text, text)',
    'update_guest_name(uuid, text, text)',
    'reserve_upload(uuid, text, text, text, bigint, uuid)',
    'guest_uploads(uuid)',
    'guest_remaining(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end;
$$;

-- Finalizarea uploadului TUS: rândul apare în storage.objects (research.md R7).
create function public.on_incoming_object_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  if new.bucket_id <> 'incoming' then
    return new;
  end if;
  select mi.id, mi.status, ev.status as event_status, ev.upload_ends_at
    into m
    from public.media_items mi
    join public.events ev on ev.id = mi.event_id
   where mi.incoming_path = new.name;
  if not found or m.status <> 'reserved' then
    return new;
  end if;

  if m.event_status = 'active' and now() <= m.upload_ends_at + interval '15 minutes' then
    update public.media_items
       set status = 'uploaded',
           actual_bytes = nullif(new.metadata ->> 'size', '')::bigint,
           uploaded_at = now()
     where id = m.id;
    perform pgmq.send('media_jobs', jsonb_build_object('type', 'process', 'media_id', m.id));
  else
    update public.media_items set status = 'rejected', processing_error = 'UPLOAD_ENDED' where id = m.id;
    perform pgmq.send('media_jobs', jsonb_build_object('type', 'purge_media', 'media_ids', jsonb_build_array(m.id)));
  end if;
  return new;
end;
$$;

create trigger on_incoming_object_created
  after insert on storage.objects
  for each row execute function public.on_incoming_object_created();

-- Curățenie periodică (contracts/database-functions.md › Joburi pg_cron).
select cron.schedule(
  'cleanup_reservations',
  '7 * * * *',
  $$delete from public.media_items where status = 'reserved' and created_at < now() - interval '24 hours'$$
);
select cron.schedule(
  'cleanup_rate_limits',
  '17 * * * *',
  $$delete from public.rate_limit_counters where window_start < now() - interval '1 hour'$$
);

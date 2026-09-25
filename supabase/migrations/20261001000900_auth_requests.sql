-- 002: cererile de confirmare și autentificare, crearea self-service (FR-003–FR-011, FR-021,
-- FR-036, FR-040; research R4, R8; contracts/database-functions.md › Creare și confirmare).

create type public.auth_request_purpose as enum ('create', 'login');
create type public.auth_request_status as enum ('pending', 'used', 'invalidated');

create table public.auth_requests (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  purpose public.auth_request_purpose not null,
  event_id uuid references public.events (id) on delete cascade,
  status public.auth_request_status not null default 'pending',
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz,
  constraint auth_requests_event_for_create check ((purpose = 'create') = (event_id is not null))
);

create index auth_requests_email_pending_idx on public.auth_requests (email) where status = 'pending';

alter table public.auth_requests enable row level security;
revoke all on table public.auth_requests from anon, authenticated;

-- Limitele de emailuri (FR-036): 3 / 15 min și 10 / 24 h per adresă, `p_ip_limit` / oră per IP.
-- Cheia de IP include limita, ca serverele de test cu limite diferite să nu-și împartă contorul.
create function public.auth_mail_allowed(p_email extensions.citext, p_ip_hash text, p_ip_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_key text := 'authmail:email:' || encode(extensions.digest(lower(p_email::text), 'sha256'), 'hex');
  v_short boolean;
  v_day boolean;
  v_ip boolean := true;
begin
  v_short := public.check_rate_limit(v_email_key || ':15m', 3, interval '15 minutes');
  v_day := public.check_rate_limit(v_email_key || ':24h', 10, interval '24 hours');
  if p_ip_hash is not null then
    v_ip := public.check_rate_limit('authmail:ip:' || p_ip_limit || ':' || p_ip_hash, p_ip_limit, interval '1 hour');
  end if;
  return v_short and v_day and v_ip;
end;
$$;

revoke execute on function public.auth_mail_allowed(extensions.citext, text, int) from public, anon, authenticated;

-- O cerere nouă o invalidează pe cea anterioară (tokenul Auth se înlocuiește la fel, FR-006).
create function public.new_auth_request(p_email extensions.citext, p_purpose public.auth_request_purpose, p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.auth_requests set status = 'invalidated'
   where email = p_email and status = 'pending';
  insert into public.auth_requests (email, purpose, event_id)
  values (p_email, p_purpose, p_event_id)
  returning id into v_id;
  perform pgmq.send('media_jobs', jsonb_build_object(
    'type', 'auth_email', 'request_id', v_id, 'email', p_email::text, 'purpose', p_purpose
  ));
  return v_id;
end;
$$;

revoke execute on function public.new_auth_request(extensions.citext, public.auth_request_purpose, uuid) from public, anon, authenticated;

-- Versiunile curente trimise de formular (FR-041).
create function public.assert_current_legal_versions(p_terms_version text, p_privacy_version text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_terms_version is distinct from (select v.version from public.current_legal_versions() v where v.kind = 'terms')
     or p_privacy_version is distinct from (select v.version from public.current_legal_versions() v where v.kind = 'privacy') then
    perform public.raise_app_error('TERMS_OUTDATED');
  end if;
end;
$$;

revoke execute on function public.assert_current_legal_versions(text, text) from public, anon, authenticated;

-- Datele evenimentului (FR-002): nume 1–120, dată între azi și +2 ani (ora României).
create function public.assert_event_input(p_name text, p_event_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Bucharest')::date;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    perform public.raise_app_error('VALIDATION');
  end if;
  if p_event_date is null or p_event_date < v_today or p_event_date > (v_today + interval '2 years')::date then
    perform public.raise_app_error('VALIDATION');
  end if;
end;
$$;

revoke execute on function public.assert_event_input(text, date) from public, anon, authenticated;

-- Evenimentul trimis de un vizitator neautentificat (FR-003). Întoarce `null` (fără cerere și
-- fără email) când limitele sunt depășite; serverul răspunde identic în ambele cazuri.
create function public.request_self_service_event(
  p_email extensions.citext,
  p_name text,
  p_event_date date,
  p_terms_version text,
  p_privacy_version text,
  p_ip_hash text default null,
  p_ip_limit int default 20
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := lower(btrim(p_email::text));
  v_event_id uuid;
begin
  perform public.assert_event_input(p_name, p_event_date);
  perform public.assert_current_legal_versions(p_terms_version, p_privacy_version);
  if not public.auth_mail_allowed(v_email, p_ip_hash, p_ip_limit) then
    return null;
  end if;

  perform public.allow_event_write();
  insert into public.events (name, event_date, organizer_email, origin, status)
  values (btrim(p_name), p_event_date, v_email, 'self_service', 'unconfirmed')
  returning id into v_event_id;

  insert into public.terms_acceptances (email, event_id, document_kind, version) values
    (v_email, v_event_id, 'terms', p_terms_version),
    (v_email, v_event_id, 'privacy', p_privacy_version);

  return public.new_auth_request(v_email, 'create', v_event_id);
end;
$$;

-- Autentificarea unui organizator sau administrator care revine (FR-010, FR-011). Nu verifică
-- existența adresei: worker-ul trimite emailul doar dacă utilizatorul există.
create function public.request_login(p_email extensions.citext, p_ip_hash text default null, p_ip_limit int default 20)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := lower(btrim(p_email::text));
begin
  if not public.auth_mail_allowed(v_email, p_ip_hash, p_ip_limit) then
    return null;
  end if;
  return public.new_auth_request(v_email, 'login', null);
end;
$$;

-- Retrimiterea codului pentru aceeași cerere (același eveniment, dacă e încă neconfirmat).
create function public.resend_auth_request(p_request_id uuid, p_ip_hash text default null, p_ip_limit int default 20)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.auth_requests;
begin
  select * into r from public.auth_requests a where a.id = p_request_id;
  if not found or (r.purpose = 'create' and not exists (
       select 1 from public.events e where e.id = r.event_id and e.status = 'unconfirmed')) then
    return null;
  end if;
  if not public.auth_mail_allowed(r.email, p_ip_hash, p_ip_limit) then
    return null;
  end if;
  return public.new_auth_request(r.email, r.purpose, r.event_id);
end;
$$;

-- Cod greșit (FR-008): la a 5-a greșeală cererea se invalidează și codul Auth se rotește.
create function public.register_failed_code(p_request_id uuid)
returns public.auth_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.auth_requests;
begin
  update public.auth_requests a
     set failed_attempts = least(a.failed_attempts + 1, 5),
         status = case when a.failed_attempts + 1 >= 5 then 'invalidated'::public.auth_request_status else a.status end
   where a.id = p_request_id and a.status = 'pending'
  returning a.* into r;
  if not found then
    return 'invalidated';
  end if;
  if r.status = 'invalidated' then
    perform pgmq.send('media_jobs', jsonb_build_object('type', 'auth_rotate', 'email', r.email::text, 'request_id', r.id));
  end if;
  return r.status;
end;
$$;

-- Emailul unei cereri utilizabile (pentru verificarea codului pe server); null altfel.
create function public.auth_request_email(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.email::text from public.auth_requests a
   where a.id = p_request_id and a.status = 'pending' and a.expires_at > now();
$$;

-- Numele evenimentului pentru pagina de confirmare (R2); doar pentru cereri utilizabile.
create function public.auth_request_preview(p_request_id uuid)
returns table (purpose public.auth_request_purpose, event_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.purpose, e.name
    from public.auth_requests a
    left join public.events e on e.id = a.event_id
   where a.id = p_request_id and a.status = 'pending' and a.expires_at > now();
$$;

-- Finalizarea după verifyOtp reușit (FR-009). Adresa cererii trebuie să fie a utilizatorului.
create function public.complete_auth_request(p_request_id uuid)
returns table (purpose public.auth_request_purpose, event_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.auth_requests;
  v_email extensions.citext := (auth.jwt() ->> 'email')::extensions.citext;
  v_limit int;
  v_awaiting int;
begin
  select * into r from public.auth_requests a
   where a.id = p_request_id and a.status = 'pending' and a.expires_at > now()
   for update;
  if not found or v_email is null or r.email <> v_email then
    perform public.raise_app_error('REQUEST_EXPIRED');
  end if;
  update public.auth_requests set status = 'used', used_at = now() where id = r.id;

  if r.purpose = 'login' then
    return query select r.purpose, null::uuid, 'login'::text;
    return;
  end if;

  select s.max_awaiting_events_per_organizer into v_limit from public.self_service_settings s;
  select count(*) into v_awaiting from public.events e
   where e.organizer_email = v_email and e.status = 'awaiting_activation';
  if v_awaiting >= v_limit then
    return query select r.purpose, r.event_id, 'limit_reached'::text;
    return;
  end if;

  perform public.transition_event(r.event_id, 'awaiting_activation', 'organizer', auth.uid());
  perform public.allow_event_write();
  update public.events e
     set pending_purge_at = ((e.event_date + 31)::timestamp) at time zone 'Europe/Bucharest'
   where e.id = r.event_id;
  update public.terms_acceptances t set user_id = auth.uid()
   where t.event_id = r.event_id and t.user_id is null;
  return query select r.purpose, r.event_id, 'confirmed'::text;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'request_self_service_event(extensions.citext, text, date, text, text, text, int)',
    'request_login(extensions.citext, text, int)',
    'resend_auth_request(uuid, text, int)',
    'register_failed_code(uuid)',
    'auth_request_email(uuid)',
    'auth_request_preview(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end;
$$;

revoke execute on function public.complete_auth_request(uuid) from public, anon;
grant execute on function public.complete_auth_request(uuid) to authenticated;

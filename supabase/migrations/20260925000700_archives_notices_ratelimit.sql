-- Arhive, avertizări de retenție și rate limiting (data-model.md).

create table public.archive_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status public.archive_status not null default 'pending',
  archive_path text,
  file_count int,
  skipped_count int,
  total_bytes bigint,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz
);

-- Cel mult un job activ per eveniment.
create unique index archive_jobs_one_active_idx
  on public.archive_jobs (event_id) where status in ('pending', 'building');

alter table public.archive_jobs enable row level security;
revoke all on table public.archive_jobs from anon, authenticated;
grant select on table public.archive_jobs to authenticated;

create policy archive_jobs_organizer_select on public.archive_jobs
  for select to authenticated
  using (
    exists (
      select 1 from public.events e
       where e.id = archive_jobs.event_id
         and e.status = 'active'
         and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
    )
  );

create table public.retention_notices (
  event_id uuid not null references public.events (id) on delete cascade,
  threshold public.notice_threshold not null,
  purge_at timestamptz not null,
  enqueued_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  primary key (event_id, threshold, purge_at)
);

alter table public.retention_notices enable row level security;
revoke all on table public.retention_notices from anon, authenticated;

create table public.rate_limit_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket_key, window_start)
);

alter table public.rate_limit_counters enable row level security;
revoke all on table public.rate_limit_counters from anon, authenticated;

-- Fereastră fixă: true dacă cererea curentă se încadrează în limită (research.md R13).
create function public.check_rate_limit(p_key text, p_limit int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.rate_limit_counters as c (bucket_key, window_start, count)
  values (p_key, date_bin(p_window, now(), timestamptz '2000-01-01'), 1)
  on conflict (bucket_key, window_start) do update set count = c.count + 1
  returning c.count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, interval) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, interval) to service_role;

-- Secunde până la următoarea fereastră (pentru mesajul „reîncearcă în X secunde”).
create function public.rate_limit_retry_after(p_window interval)
returns int
language sql
stable
set search_path = ''
as $$
  select ceil(extract(epoch from (date_bin(p_window, now(), timestamptz '2000-01-01') + p_window - now())))::int;
$$;

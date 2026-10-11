-- Limitele de frecvență pe ferestre lungi (24 de ore) se resetau aproximativ din oră în oră:
-- jobul de curățenie ștergea rândurile cu `window_start` mai vechi de o oră, deci un contor de 24 de ore
-- dispărea la prima trecere a jobului după începutul ferestrei. Fiecare rând își păstrează acum
-- sfârșitul ferestrei, iar jobul șterge doar ferestrele încheiate.

alter table public.rate_limit_counters add column window_end timestamptz;

-- Rândurile existente: cea mai lungă fereastră folosită este de 24 de ore.
update public.rate_limit_counters set window_end = window_start + interval '24 hours';

alter table public.rate_limit_counters alter column window_end set not null;

-- Fereastră fixă: true dacă cererea curentă se încadrează în limită (research.md R13).
create or replace function public.check_rate_limit(p_key text, p_limit int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01');
  v_count int;
begin
  insert into public.rate_limit_counters as c (bucket_key, window_start, window_end, count)
  values (p_key, v_start, v_start + p_window, 1)
  on conflict (bucket_key, window_start) do update set count = c.count + 1
  returning c.count into v_count;
  return v_count <= p_limit;
end;
$$;

-- Aceeași denumire a jobului: pg_cron îi înlocuiește comanda.
select cron.schedule(
  'cleanup_rate_limits',
  '17 * * * *',
  $$delete from public.rate_limit_counters where window_end < now()$$
);

-- Opțiunile de păstrare la plata activării (003: FR-001): prețul final și data ștergerii pentru
-- fiecare opțiune activă, cu aceeași regulă ca `activate_event` (uploadul se închide la
-- sfârșitul zilei de după eveniment, dar cel puțin o zi după activare; 002/FR-034, 001/FR-040).
create function public.activation_quote(p_event_id uuid)
returns table (option_id uuid, months int, surcharge_minor bigint, amount_minor bigint, purge_at timestamptz, included boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.events;
  pkg public.packages;
  v_end timestamptz;
begin
  select * into e from public.events ev
   where ev.id = p_event_id
     and ev.organizer_email = (auth.jwt() ->> 'email')::extensions.citext;
  if not found or e.status <> 'awaiting_activation' then
    return;
  end if;
  select * into pkg from public.packages p where p.code = 'complete';
  v_end := (greatest(e.event_date, (now() at time zone 'Europe/Bucharest')::date) + 2)::timestamp at time zone 'Europe/Bucharest';
  return query
    select ro.id, ro.months, ro.surcharge_minor, pkg.price_minor + ro.surcharge_minor,
           ((v_end at time zone 'Europe/Bucharest') + make_interval(months => ro.months)) at time zone 'Europe/Bucharest',
           ro.id = pkg.retention_option_id
      from public.retention_options ro
     where ro.active
     order by ro.months;
end;
$$;

revoke execute on function public.activation_quote(uuid) from public, anon;
grant execute on function public.activation_quote(uuid) to authenticated;

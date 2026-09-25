-- 002: ștergerea evenimentelor neconfirmate după 24 de ore (FR-004, SC-005; research R6).

create function public.purge_unconfirmed_events(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with deleted as (
    delete from public.events e
     where e.status = 'unconfirmed' and e.created_at < p_now - interval '24 hours'
    returning e.id
  )
  select count(*) into v_count from deleted;
  if v_count > 0 then
    insert into public.app_audit_log (action, details)
    values ('auto_deleted_unconfirmed_count', jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

-- Cererile închise sau expirate de peste 7 zile.
create function public.purge_auth_requests(p_now timestamptz default now())
returns int
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.auth_requests a
     where a.created_at < p_now - interval '7 days'
    returning 1
  )
  select count(*)::int from deleted;
$$;

revoke execute on function public.purge_unconfirmed_events(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_unconfirmed_events(timestamptz) to service_role;
revoke execute on function public.purge_auth_requests(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_auth_requests(timestamptz) to service_role;

select cron.schedule('purge-unconfirmed', '*/15 * * * *', $$select public.purge_unconfirmed_events()$$);
select cron.schedule('purge-auth-requests', '40 3 * * *', $$select public.purge_auth_requests()$$);

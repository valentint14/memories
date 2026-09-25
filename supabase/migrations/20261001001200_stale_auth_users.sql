-- 002: conturile Auth create pentru o cerere neconfirmată și rămase fără evenimente se șterg după
-- 24 de ore (research R6). Ștergerea o face worker-ul prin API-ul administrativ (delete_organizer_user),
-- care reverifică adresa înainte.

create function public.purge_stale_auth_users(p_now timestamptz default now())
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
    select u.id
      from auth.users u
     where u.email_confirmed_at is null
       and u.created_at < p_now - interval '24 hours'
       and not exists (select 1 from public.events e where e.organizer_email = u.email::extensions.citext)
       and not exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
  loop
    perform pgmq.send('media_jobs', jsonb_build_object('type', 'delete_organizer_user', 'user_id', r.id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.purge_stale_auth_users(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_stale_auth_users(timestamptz) to service_role;

select cron.schedule('purge-stale-auth-users', '30 3 * * *', $$select public.purge_stale_auth_users()$$);

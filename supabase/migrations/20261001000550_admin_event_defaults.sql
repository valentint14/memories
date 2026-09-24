-- 002: evenimentele create de administrator pornesc active, cu pachetul complet și cu prima
-- intrare în istoric (FR-023, FR-024; data-model.md › Modificări la events).

create function public.events_admin_insert_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Prin API (politica events_admin_insert), un administrator creează doar evenimente active.
  if session_user <> 'postgres' and coalesce(current_setting('app.event_write', true), '') <> 'on' then
    new.origin := 'admin';
    new.status := 'active';
    new.pending_purge_at := null;
    new.deletion_keeps_billing := false;
    new.package_id := null;
  end if;
  if new.origin = 'admin' then
    new.package_id := coalesce(new.package_id, (select p.id from public.packages p where p.code = 'complete'));
    new.activated_at := coalesce(new.activated_at, now());
  end if;
  return new;
end;
$$;

create trigger events_admin_insert_defaults
  before insert on public.events
  for each row execute function public.events_admin_insert_defaults();

create function public.events_admin_insert_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origin = 'admin' then
    insert into public.event_status_changes (event_id, from_status, to_status, source, actor_user_id, reason)
    values (new.id, null, new.status, 'admin', auth.uid(), 'creat de administrator');
  end if;
  return new;
end;
$$;

create trigger events_admin_insert_history
  after insert on public.events
  for each row execute function public.events_admin_insert_history();

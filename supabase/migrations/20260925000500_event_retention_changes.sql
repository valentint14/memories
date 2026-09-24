-- Istoricul schimbărilor de retenție și preț (FR-043). Append-only.

create table public.event_retention_changes (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  actor_kind public.retention_actor not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  from_months int,
  to_months int not null,
  from_final_price_minor bigint,
  to_final_price_minor bigint not null,
  to_purge_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index event_retention_changes_event_idx
  on public.event_retention_changes (event_id, created_at);

alter table public.event_retention_changes enable row level security;
revoke all on table public.event_retention_changes from anon, authenticated;
grant select on table public.event_retention_changes to authenticated;

create policy event_retention_changes_admin_select on public.event_retention_changes
  for select to authenticated using (public.is_admin());

-- Autorul: `app.retention_actor` setat în tranzacție de extend_retention, altfel admin sau sistem.
create function public.log_retention_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.retention_actor;
begin
  if tg_op = 'INSERT' then
    v_actor := 'system';
  elsif nullif(current_setting('app.retention_actor', true), '') is not null then
    v_actor := current_setting('app.retention_actor', true)::public.retention_actor;
  elsif public.is_admin() then
    v_actor := 'admin';
  else
    v_actor := 'system';
  end if;

  if tg_op = 'UPDATE' and
     new.retention_option_id is not distinct from old.retention_option_id and
     new.retention_surcharge_minor is not distinct from old.retention_surcharge_minor and
     new.base_price_minor is not distinct from old.base_price_minor and
     new.purge_at is not distinct from old.purge_at then
    return new;
  end if;

  insert into public.event_retention_changes (
    event_id, actor_kind, actor_user_id, from_months, to_months,
    from_final_price_minor, to_final_price_minor, to_purge_at
  ) values (
    new.id, v_actor, auth.uid(),
    case when tg_op = 'UPDATE' then old.retention_months end, new.retention_months,
    case when tg_op = 'UPDATE' then old.final_price_minor end, new.final_price_minor,
    new.purge_at
  );
  return new;
end;
$$;

create trigger events_log_retention_change
  after insert or update on public.events
  for each row execute function public.log_retention_change();

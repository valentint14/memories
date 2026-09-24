-- 002: mașina de stări a evenimentului și istoricul imuabil (FR-022, FR-024, FR-026; research R5).

-- Tranzițiile permise (data-model.md › Mașina de stări).
create table public.event_status_transitions (
  from_status public.event_status not null,
  to_status public.event_status not null,
  primary key (from_status, to_status)
);

insert into public.event_status_transitions (from_status, to_status) values
  ('unconfirmed', 'awaiting_activation'),
  ('awaiting_activation', 'active'),
  ('active', 'suspended'),
  ('suspended', 'active'),
  ('active', 'expiring'),
  ('suspended', 'expiring'),
  ('expiring', 'expired'),
  ('active', 'deleting'),
  ('suspended', 'deleting'),
  ('expired', 'deleting'),
  -- Ștergerea cerută de organizator a unui eveniment activat păstrează rândul de facturare (FR-035).
  ('deleting', 'expired'),
  -- Activare repetată (FR-026): doar istoric.
  ('active', 'active');

alter table public.event_status_transitions enable row level security;
revoke all on table public.event_status_transitions from anon, authenticated;

-- Istoricul schimbărilor de stare (FR-024).
create table public.event_status_changes (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  from_status public.event_status,
  to_status public.event_status not null,
  source public.status_change_source not null,
  actor_user_id uuid,
  reason text check (reason is null or char_length(reason) between 1 and 500),
  external_ref text check (external_ref is null or char_length(external_ref) between 1 and 200),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index event_status_changes_event_idx on public.event_status_changes (event_id, created_at);
create unique index event_status_changes_external_ref_idx
  on public.event_status_changes (event_id, external_ref) where external_ref is not null;

alter table public.event_status_changes enable row level security;
revoke all on table public.event_status_changes from anon, authenticated;
grant select on table public.event_status_changes to authenticated;

create policy event_status_changes_admin_select on public.event_status_changes
  for select to authenticated using (public.is_admin());

-- Scriere de încredere: funcțiile care schimbă starea sau câmpurile de activare pornesc acest
-- marcaj, local tranzacției.
create function public.allow_event_write()
returns void
language sql
set search_path = ''
as $$
  select set_config('app.event_write', 'on', true);
$$;

-- Imuabilitatea istoricului: doar anonimizarea (cu marcaj) poate goli autorul și motivul;
-- ștergerea vine doar din cascada evenimentului.
create function public.event_status_changes_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.events e where e.id = old.event_id) then
      raise exception 'event_status_changes este imuabil';
    end if;
    return old;
  end if;
  if coalesce(current_setting('app.event_write', true), '') = 'on'
     and new.event_id = old.event_id and new.from_status is not distinct from old.from_status
     and new.to_status = old.to_status and new.source = old.source
     and new.external_ref is not distinct from old.external_ref and new.created_at = old.created_at
     and new.actor_user_id is null and new.reason is null then
    return new;
  end if;
  raise exception 'event_status_changes este imuabil';
end;
$$;

create trigger event_status_changes_immutable
  before update or delete on public.event_status_changes
  for each row execute function public.event_status_changes_immutable();

-- Garda: starea și câmpurile de activare se schimbă doar prin funcțiile de încredere.
create function public.events_guard_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Sesiunile conectate direct ca `postgres` (migrații, teste SQL, pg_cron) au acces complet;
  -- apelurile prin API (inclusiv service role) trec doar prin funcțiile de încredere.
  if coalesce(current_setting('app.event_write', true), '') = 'on' or session_user = 'postgres' then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.origin is distinct from old.origin
     or new.activated_at is distinct from old.activated_at
     or new.package_id is distinct from old.package_id
     or new.pending_purge_at is distinct from old.pending_purge_at
     or new.deletion_keeps_billing is distinct from old.deletion_keeps_billing then
    perform public.raise_app_error('INVALID_TRANSITION');
  end if;
  return new;
end;
$$;

create trigger events_guard_protected_columns
  before update on public.events
  for each row execute function public.events_guard_protected_columns();

-- Singura cale de schimbare a stării (research R5). Validează perechea și scrie istoricul.
create function public.transition_event(
  p_event_id uuid,
  p_to public.event_status,
  p_source public.status_change_source,
  p_actor uuid default null,
  p_reason text default null,
  p_external_ref text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.event_status;
begin
  select e.status into v_from from public.events e where e.id = p_event_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND');
  end if;
  if not exists (
    select 1 from public.event_status_transitions t where t.from_status = v_from and t.to_status = p_to
  ) then
    perform public.raise_app_error('INVALID_TRANSITION');
  end if;

  perform public.allow_event_write();
  if v_from <> p_to then
    update public.events set status = p_to where id = p_event_id;
  end if;
  insert into public.event_status_changes (event_id, from_status, to_status, source, actor_user_id, reason, external_ref, note)
  values (p_event_id, v_from, p_to, p_source, p_actor, nullif(btrim(p_reason), ''), p_external_ref, p_note);
end;
$$;

revoke execute on function public.transition_event(uuid, public.event_status, public.status_change_source, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_event(uuid, public.event_status, public.status_change_source, uuid, text, text, text)
  to service_role;

-- Istoricul pentru organizator: fără autor și motiv (data-model.md › event_status_changes).
create function public.organizer_status_history(p_event_id uuid)
returns table (from_status public.event_status, to_status public.event_status, source public.status_change_source, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.from_status, c.to_status, c.source, c.created_at
    from public.event_status_changes c
    join public.events e on e.id = c.event_id
   where c.event_id = p_event_id
     and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
     and e.status not in ('unconfirmed', 'deleting')
   order by c.created_at, c.id;
$$;

revoke execute on function public.organizer_status_history(uuid) from public, anon;
grant execute on function public.organizer_status_history(uuid) to authenticated;

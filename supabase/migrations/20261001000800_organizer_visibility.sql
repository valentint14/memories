-- 002: ce vede organizatorul în stările noi (FR-012, FR-028a; data-model.md › Politici RLS).

-- Evenimentele vizibile: fără `unconfirmed` (FR-004) și fără `deleting`.
drop policy events_organizer_select on public.events;
create policy events_organizer_select on public.events
  for select to authenticated
  using (
    organizer_email = (auth.jwt() ->> 'email')::extensions.citext
    and status in ('awaiting_activation', 'active', 'suspended', 'expiring', 'expired')
  );

create or replace view public.organizer_events
with (security_invoker = true) as
  select id, name, event_date, upload_starts_at, upload_ends_at, final_price_minor,
         retention_months, purge_at, expired_at, status,
         origin, activated_at, pending_purge_at, created_at
    from public.events;

-- În `suspended`, organizatorul își vede, descarcă și șterge fișierele (FR-028a).
drop policy media_items_organizer_select on public.media_items;
create policy media_items_organizer_select on public.media_items
  for select to authenticated
  using (
    status in ('uploaded', 'processing', 'ready', 'failed')
    and exists (
      select 1 from public.events e
       where e.id = media_items.event_id
         and e.status in ('active', 'suspended')
         and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
    )
  );

create or replace function public.organizer_owns_active_event(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id::text = (storage.foldername(p_object_name))[1]
       and e.status in ('active', 'suspended')
       and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
  );
$$;

-- Arhiva și ștergerea fișierelor rămân disponibile în `suspended` (FR-028a). Doar condiția de stare
-- se schimbă; restul corpului din 001 rămâne identic.
do $$
declare
  fn regprocedure;
  def text;
  patched text;
begin
  foreach fn in array array[
    'public.request_archive(uuid)'::regprocedure,
    'public.delete_media(uuid, uuid[])'::regprocedure
  ] loop
    def := pg_get_functiondef(fn);
    patched := replace(def, $q$if e.status <> 'active' then$q$, $q$if e.status not in ('active', 'suspended') then$q$);
    if patched = def then
      raise exception 'Condiția de stare nu a fost găsită în %', fn;
    end if;
    execute patched;
  end loop;
end;
$$;

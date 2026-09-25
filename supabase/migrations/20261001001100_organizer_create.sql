-- 002: crearea din cont, fără email de confirmare (FR-005, FR-021, FR-041).
-- `request_login` e definită împreună cu cererile de confirmare (20261001000900).

create function public.create_event_as_organizer(
  p_name text,
  p_event_date date,
  p_terms_version text default null,
  p_privacy_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := (auth.jwt() ->> 'email')::extensions.citext;
  v_user uuid := auth.uid();
  v_limit int;
  v_awaiting int;
  v_terms text;
  v_privacy text;
  v_event_id uuid;
begin
  if v_user is null or v_email is null then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  perform public.assert_event_input(p_name, p_event_date);

  select v.version into v_terms from public.current_legal_versions() v where v.kind = 'terms';
  select v.version into v_privacy from public.current_legal_versions() v where v.kind = 'privacy';
  -- Versiunile trebuie trimise (și să fie cele curente) dacă utilizatorul nu le-a acceptat deja.
  if p_terms_version is not null or p_privacy_version is not null then
    perform public.assert_current_legal_versions(p_terms_version, p_privacy_version);
  elsif not exists (select 1 from public.terms_acceptances t where t.user_id = v_user and t.document_kind = 'terms' and t.version = v_terms)
     or not exists (select 1 from public.terms_acceptances t where t.user_id = v_user and t.document_kind = 'privacy' and t.version = v_privacy) then
    perform public.raise_app_error('TERMS_OUTDATED');
  end if;

  select s.max_awaiting_events_per_organizer into v_limit from public.self_service_settings s;
  select count(*) into v_awaiting from public.events e
   where e.organizer_email = v_email and e.status = 'awaiting_activation';
  if v_awaiting >= v_limit then
    perform public.raise_app_error('AWAITING_LIMIT_REACHED', jsonb_build_object('limit', v_limit));
  end if;

  perform public.allow_event_write();
  insert into public.events (name, event_date, organizer_email, origin, status, pending_purge_at)
  values (
    btrim(p_name), p_event_date, v_email, 'self_service', 'awaiting_activation',
    ((p_event_date + 31)::timestamp) at time zone 'Europe/Bucharest'
  )
  returning id into v_event_id;

  insert into public.event_status_changes (event_id, from_status, to_status, source, actor_user_id)
  values (v_event_id, null, 'awaiting_activation', 'organizer', v_user);

  if p_terms_version is not null then
    insert into public.terms_acceptances (email, user_id, event_id, document_kind, version) values
      (v_email, v_user, v_event_id, 'terms', p_terms_version),
      (v_email, v_user, v_event_id, 'privacy', p_privacy_version);
  end if;
  return v_event_id;
end;
$$;

revoke execute on function public.create_event_as_organizer(text, date, text, text) from public, anon;
grant execute on function public.create_event_as_organizer(text, date, text, text) to authenticated;

-- Dacă organizatorul trebuie să accepte versiunea curentă înainte de a crea un eveniment (FR-041).
create function public.organizer_needs_terms()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.current_legal_versions() v
     where not exists (
       select 1 from public.terms_acceptances t
        where t.user_id = auth.uid() and t.document_kind = v.kind and t.version = v.version
     )
  );
$$;

revoke execute on function public.organizer_needs_terms() from public, anon;
grant execute on function public.organizer_needs_terms() to authenticated;

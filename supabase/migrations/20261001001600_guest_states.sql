-- 002: pagina invitatului pentru evenimentele neactivate și suspendate (FR-031, FR-032).
-- Doar condițiile de stare se schimbă; restul corpului funcțiilor din 001 rămâne identic.

do $$
declare
  def text;
  patched text;
begin
  -- resolve_event_for_guest: starea și numele pentru `awaiting_activation` și `suspended`; restul
  -- stărilor non-active rămân `not_found` (inclusiv `unconfirmed`, fără nume).
  def := pg_get_functiondef('public.resolve_event_for_guest(text)'::regprocedure);
  patched := replace(def,
    $q$  if not found or e.status <> 'active' then
    return query select null::uuid, null::text, 'not_found'::text, null::timestamptz;
    return;
  end if;$q$,
    $q$  if found and e.status = 'awaiting_activation' then
    return query select e.id, e.name, 'not_activated'::text, null::timestamptz;
    return;
  end if;
  if found and e.status = 'suspended' then
    return query select e.id, e.name, 'suspended'::text, e.upload_starts_at;
    return;
  end if;
  if not found or e.status <> 'active' then
    return query select null::uuid, null::text, 'not_found'::text, null::timestamptz;
    return;
  end if;$q$);
  if patched = def then
    raise exception 'resolve_event_for_guest: condiția de stare nu a fost găsită';
  end if;
  execute patched;

  -- guest_open_event (sesiune și rezervare): coduri distincte pentru stările noi.
  def := pg_get_functiondef('public.guest_open_event(text)'::regprocedure);
  patched := replace(def,
    $q$  if not found or e.status <> 'active' then
    perform public.raise_app_error('EVENT_NOT_FOUND');
  end if;$q$,
    $q$  if found and e.status = 'awaiting_activation' then
    perform public.raise_app_error('EVENT_NOT_ACTIVATED');
  end if;
  if found and e.status = 'suspended' then
    perform public.raise_app_error('EVENT_SUSPENDED');
  end if;
  if not found or e.status <> 'active' then
    perform public.raise_app_error('EVENT_NOT_FOUND');
  end if;$q$);
  if patched = def then
    raise exception 'guest_open_event: condiția de stare nu a fost găsită';
  end if;
  execute patched;

  -- Finalizarea uploadului: un fișier terminat după suspendare e respins cu motivul corect.
  def := pg_get_functiondef('public.on_incoming_object_created()'::regprocedure);
  patched := replace(def,
    $q$    update public.media_items set status = 'rejected', processing_error = 'UPLOAD_ENDED' where id = m.id;$q$,
    $q$    update public.media_items
       set status = 'rejected',
           processing_error = case when m.event_status = 'suspended' then 'EVENT_SUSPENDED' else 'UPLOAD_ENDED' end
     where id = m.id;$q$);
  if patched = def then
    raise exception 'on_incoming_object_created: respingerea nu a fost găsită';
  end if;
  execute patched;
end;
$$;

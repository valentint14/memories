-- Prelungirea păstrării plătită online (003: FR-020–FR-022; contracts/database-functions.md).
-- `prepare_payment` calculează diferența (20261002000400); aici se aplică plata confirmată.

-- Aplică opțiunea plătită, dacă prelungirea mai e posibilă. Întoarce null la succes, altfel
-- motivul pentru care plata ajunge la administrator (FR-021). Prețul și snapshot-ul vin din
-- plată, nu din catalogul curent (FR-022, research R6).
create or replace function public.apply_paid_extension(p_payment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  e public.events;
begin
  select * into pay from public.payments p where p.id = p_payment_id;
  select * into e from public.events ev where ev.id = pay.event_id for update;
  if not found or e.status <> 'active' or now() >= e.purge_at or pay.retention_months <= e.retention_months then
    return 'EXTENSION_NOT_POSSIBLE';
  end if;

  perform set_config('app.payment_snapshot',
    jsonb_build_object('months', pay.retention_months, 'surcharge', pay.surcharge_minor)::text, true);
  perform set_config('app.retention_actor', 'payment', true);
  update public.events set retention_option_id = pay.retention_option_id where id = e.id;
  perform set_config('app.payment_snapshot', '', true);
  perform set_config('app.retention_actor', '', true);
  return null;
end;
$$;

revoke execute on function public.apply_paid_extension(uuid) from public, anon, authenticated;

-- Organizatorul nu mai prelungește fără plată (FR-020); administratorul schimbă opțiunea din
-- editarea evenimentului (001/FR-042), fără plată.
revoke execute on function public.extend_retention(uuid, uuid, bigint) from authenticated;

-- Administrarea după plata online (003: FR-013–FR-016a). Plățile se citesc direct din `payments`
-- (RLS: doar administratorii aal2), deci nu e nevoie de o funcție de citire separată.

-- Contestarea plății la bancă (FR-016a): evenimentul activ se suspendă automat, iar administratorii
-- sunt anunțați; rezultatul disputei nu schimbă automat starea (reactivarea e manuală).
create function public.register_dispute(p_payment_intent_id text)
returns table (outcome text, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  v_status public.event_status;
begin
  select * into pay from public.payments p where p.stripe_payment_intent_id = p_payment_intent_id for update;
  if not found then
    return query select 'ignored'::text, null::uuid;
    return;
  end if;
  if pay.disputed_at is not null then
    return query select 'ignored'::text, pay.event_id;
    return;
  end if;

  update public.payments set disputed_at = now() where id = pay.id;
  perform pgmq.send('media_jobs', jsonb_build_object('type', 'admin_payment_notice', 'payment_id', pay.id, 'reason', 'DISPUTE'));

  select ev.status into v_status from public.events ev where ev.id = pay.event_id for update;
  if v_status = 'active' then
    perform public.transition_event(pay.event_id, 'suspended', 'payment', null, 'Plată contestată', p_payment_intent_id);
    return query select 'suspended'::text, pay.event_id;
    return;
  end if;
  return query select 'unchanged'::text, pay.event_id;
end;
$$;

revoke execute on function public.register_dispute(text) from public, anon, authenticated;
grant execute on function public.register_dispute(text) to service_role;

-- Cererea de activare e înlocuită de plată (FR-015); funcția rămâne pentru istoric.
revoke execute on function public.request_activation(uuid) from authenticated;

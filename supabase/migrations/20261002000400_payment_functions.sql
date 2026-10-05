-- Pregătirea și finalizarea plății activării (003: FR-001–FR-012a, FR-007, FR-008, FR-011;
-- contracts/database-functions.md). Suma se calculează și se îngheață aici (research R6);
-- aplicația web doar creează sesiunea Checkout și transmite confirmările verificate.

-- Organizatorul pregătește plata: verifică proprietarul, starea, opțiunea și suma așteptată,
-- reia plata deschisă identică sau o înlocuiește (R5) și întoarce plata de folosit.
create function public.prepare_payment(
  p_event_id uuid,
  p_purpose public.payment_purpose,
  p_option_id uuid,
  p_expected_amount_minor bigint
)
returns table (payment_id uuid, amount_minor bigint, reuse_url text, expires_at timestamptz, replaced_session_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  o public.retention_options;
  pkg public.packages;
  open_pay public.payments;
  v_base bigint;
  v_surcharge bigint;
  v_amount bigint;
  v_deadline timestamptz;
  v_expires timestamptz;
  v_replaced text;
  v_id uuid;
begin
  select * into e from public.events ev
   where ev.id = p_event_id
     and ev.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
   for update;
  if not found then
    perform public.raise_app_error('PAYMENT_NOT_ALLOWED');
  end if;

  select * into o from public.retention_options ro where ro.id = p_option_id;
  if not found or not o.active then
    perform public.raise_app_error('OPTION_INACTIVE');
  end if;

  if p_purpose = 'activation' then
    if e.status <> 'awaiting_activation' then
      perform public.raise_app_error('PAYMENT_NOT_ALLOWED');
    end if;
    select * into pkg from public.packages p where p.code = 'complete';
    v_base := pkg.price_minor;
    v_surcharge := o.surcharge_minor;
    v_amount := v_base + v_surcharge;
    v_deadline := e.pending_purge_at;
  else
    -- Prelungirea plătită (FR-020): diferența față de prețul final deja plătit.
    if e.status <> 'active' or now() >= e.purge_at then
      perform public.raise_app_error('PAYMENT_NOT_ALLOWED');
    end if;
    if o.months <= e.retention_months then
      perform public.raise_app_error('RETENTION_NOT_LONGER');
    end if;
    v_base := e.base_price_minor;
    v_surcharge := o.surcharge_minor;
    v_amount := v_base + v_surcharge - e.final_price_minor;
    v_deadline := e.purge_at;
  end if;

  if v_amount <> p_expected_amount_minor then
    perform public.raise_app_error('PRICE_CHANGED', jsonb_build_object('amountMinor', v_amount));
  end if;
  if v_amount <= 0 then
    perform public.raise_app_error('PAYMENT_NOT_ALLOWED');
  end if;

  -- Cel mult 23 h și cu cel puțin 1 h înainte de ștergere (FR-008). Stripe cere între 30 de minute
  -- și strict sub 24 h de la crearea sesiunii, după ceasul lui: 24 h exact e respins.
  v_expires := least(now() + interval '23 hours', coalesce(v_deadline, now() + interval '25 hours') - interval '1 hour');
  if v_expires < now() + interval '30 minutes' then
    perform public.raise_app_error('PAYMENT_WINDOW_CLOSED');
  end if;

  select * into open_pay from public.payments p
   where p.event_id = p_event_id and p.purpose = p_purpose and p.status = 'open'
   for update;
  if found then
    if open_pay.retention_option_id = p_option_id and open_pay.amount_minor = v_amount
       and open_pay.expires_at >= now() + interval '10 minutes' and open_pay.checkout_url is not null then
      return query select open_pay.id, open_pay.amount_minor, open_pay.checkout_url, open_pay.expires_at, null::text;
      return;
    end if;
    update public.payments set status = 'expired', checkout_url = null where id = open_pay.id;
    v_replaced := open_pay.stripe_session_id;
  end if;

  insert into public.payments (
    event_id, event_name, organizer_email, created_by, purpose, retention_option_id, retention_months,
    base_price_minor, surcharge_minor, amount_minor, expires_at
  ) values (
    e.id, coalesce(e.name, ''), e.organizer_email, auth.uid(), p_purpose, o.id, o.months,
    v_base, v_surcharge, v_amount, v_expires
  )
  returning id into v_id;

  return query select v_id, v_amount, null::text, v_expires, v_replaced;
end;
$$;

-- Serverul atașează sesiunea Checkout creată pentru plată.
create function public.attach_checkout_session(p_payment_id uuid, p_session_id text, p_checkout_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments
     set stripe_session_id = p_session_id, checkout_url = p_checkout_url
   where id = p_payment_id and status = 'open' and stripe_session_id is null;
  if not found then
    perform public.raise_app_error('NOT_FOUND');
  end if;
end;
$$;

-- Plata nu a putut fi pornită la Stripe sau a fost înlocuită: se închide.
create function public.expire_payment_by_id(p_payment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set status = 'expired', checkout_url = null where id = p_payment_id and status = 'open';
$$;

-- Plata confirmată de Stripe (webhook sau întoarcere): idempotentă, cu blocare pe rândul plății.
create function public.complete_payment(p_session_id text, p_payment_intent_id text, p_billing jsonb)
returns table (outcome text, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  e public.events;
  v_reason text;
begin
  select * into pay from public.payments p where p.stripe_session_id = p_session_id for update;
  if not found then
    return query select 'ignored'::text, null::uuid;
    return;
  end if;
  if pay.status = 'paid' then
    return query select (case when pay.purpose = 'activation' then 'activated' else 'extended' end)::text, pay.event_id;
    return;
  end if;
  if pay.status = 'refund_due' then
    return query select 'refund_due'::text, pay.event_id;
    return;
  end if;

  update public.payments p
     set paid_at = now(),
         stripe_payment_intent_id = p_payment_intent_id,
         checkout_url = null,
         billing_name = nullif(p_billing ->> 'name', ''),
         billing_address = case when jsonb_typeof(p_billing -> 'address') = 'object' then p_billing -> 'address' end,
         billing_company = nullif(p_billing ->> 'company', ''),
         billing_tax_id = nullif(p_billing ->> 'tax_id', '')
   where p.id = pay.id;

  if pay.event_id is null then
    v_reason := 'EVENT_DELETED';
  elsif pay.purpose = 'activation' then
    select * into e from public.events ev where ev.id = pay.event_id for update;
    if exists (
      select 1 from public.payments p where p.event_id = pay.event_id and p.purpose = 'activation' and p.status = 'paid'
    ) then
      v_reason := 'DUPLICATE_PAYMENT';
    elsif e.status <> 'awaiting_activation' then
      v_reason := 'EVENT_NOT_AWAITING';
    else
      perform public.activate_event(pay.event_id, 'payment', null, p_session_id, pay.id);
      update public.payments set status = 'paid' where id = pay.id;
      perform pgmq.send('media_jobs', jsonb_build_object('type', 'payment_confirmation', 'payment_id', pay.id));
      return query select 'activated'::text, pay.event_id;
      return;
    end if;
  else
    v_reason := public.apply_paid_extension(pay.id);
    if v_reason is null then
      update public.payments set status = 'paid' where id = pay.id;
      perform pgmq.send('media_jobs', jsonb_build_object('type', 'payment_confirmation', 'payment_id', pay.id));
      return query select 'extended'::text, pay.event_id;
      return;
    end if;
  end if;

  update public.payments set status = 'refund_due', refund_reason = v_reason where id = pay.id;
  perform pgmq.send('media_jobs', jsonb_build_object('type', 'admin_payment_notice', 'payment_id', pay.id, 'reason', v_reason));
  return query select 'refund_due'::text, pay.event_id;
end;
$$;

-- Prelungirea plătită (FR-020–FR-022): aplicată de User Story 4 (20261002000700). Până atunci,
-- orice plată de prelungire ajunge la administrator pentru rambursare.
create function public.apply_paid_extension(p_payment_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select 'EXTENSION_NOT_POSSIBLE'::text;
$$;

-- Starea plății pentru pagina organizatorului (FR-009): ultima plată, fără sume sau facturare.
create function public.organizer_payment_state(p_event_id uuid)
returns table (status public.payment_status, purpose public.payment_purpose, paid_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.status, p.purpose, p.paid_at, p.updated_at
    from public.payments p
    join public.events ev on ev.id = p.event_id
   where p.event_id = p_event_id
     and ev.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
   order by p.created_at desc
   limit 1;
$$;

revoke execute on function public.prepare_payment(uuid, public.payment_purpose, uuid, bigint) from public, anon;
grant execute on function public.prepare_payment(uuid, public.payment_purpose, uuid, bigint) to authenticated;
revoke execute on function public.organizer_payment_state(uuid) from public, anon;
grant execute on function public.organizer_payment_state(uuid) to authenticated;

revoke execute on function public.attach_checkout_session(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.expire_payment_by_id(uuid) from public, anon, authenticated;
revoke execute on function public.complete_payment(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_paid_extension(uuid) from public, anon, authenticated;
grant execute on function public.attach_checkout_session(uuid, text, text) to service_role;
grant execute on function public.expire_payment_by_id(uuid) to service_role;
grant execute on function public.complete_payment(text, text, jsonb) to service_role;

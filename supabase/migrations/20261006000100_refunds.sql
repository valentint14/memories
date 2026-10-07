-- Rambursările plăților Stripe (004: FR-001–FR-012; data-model.md; contracts/database-functions.md).
-- Suma rambursată se reține cumulat pe plată (doar crescător), iar efectul asupra evenimentului se
-- aplică o singură dată, la prima rambursare integrală (research R2, R3).

alter table public.payments
  add column refunded_minor bigint not null default 0,
  add column refunded_at timestamptz,
  add column refund_effect text,
  -- Opțiunea de dinaintea unei prelungiri plătite, pentru revenire la rambursare (research R5).
  add column previous_retention_option_id uuid references public.retention_options (id) on delete restrict,
  add column previous_retention_months int,
  add column previous_surcharge_minor bigint;

alter table public.payments
  add constraint payments_refunded_range check (refunded_minor between 0 and amount_minor),
  add constraint payments_refund_effect check (
    refund_effect is null or refund_effect in ('suspended', 'retention_reverted', 'manual_adjustment', 'none')
  ),
  add constraint payments_refund_effect_full check (refund_effect is null or refunded_minor = amount_minor),
  add constraint payments_previous_retention check (
    (previous_retention_option_id is null and previous_retention_months is null and previous_surcharge_minor is null)
    or (purpose = 'retention_extension'
        and previous_retention_option_id is not null
        and previous_retention_months between 1 and 60
        and previous_surcharge_minor >= 0)
  );

-- Anunțul de rambursare din webhook (`charge.refunded`): suma cumulată rambursată pentru intenția
-- de plată. Întoarce efectul aplicat (contracts/database-functions.md › register_refund).
create function public.register_refund(p_payment_intent_id text, p_refunded_minor bigint, p_refunded_at timestamptz)
returns table (outcome text, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  v_effect text;
begin
  if p_refunded_minor is null or p_refunded_minor < 0 then
    perform public.raise_app_error('VALIDATION');
  end if;

  select * into pay from public.payments p where p.stripe_payment_intent_id = p_payment_intent_id for update;
  if not found then
    return query select 'ignored'::text, null::uuid;
    return;
  end if;
  -- Repetare sau anunț mai vechi decât cel înregistrat: suma nu scade, efectul nu se reaplică.
  if p_refunded_minor <= pay.refunded_minor then
    return query select 'ignored'::text, pay.event_id;
    return;
  end if;

  update public.payments
     set refunded_minor = least(p_refunded_minor, amount_minor), refunded_at = p_refunded_at
   where id = pay.id
  returning * into pay;

  if pay.refunded_minor < pay.amount_minor then
    return query select 'partial'::text, pay.event_id;
    return;
  end if;
  if pay.refund_effect is not null then
    return query select 'ignored'::text, pay.event_id;
    return;
  end if;

  if pay.status <> 'paid' then
    -- Plată neaplicată (`refund_due`): evenimentul nu se schimbă (FR-011).
    v_effect := 'none';
  elsif pay.purpose = 'activation' then
    v_effect := public.refund_activation_effect(pay);
  else
    v_effect := public.refund_extension_effect(pay);
  end if;

  update public.payments set refund_effect = v_effect where id = pay.id;
  return query select v_effect, pay.event_id;
end;
$$;

-- Rambursarea integrală a activării (US1, FR-004): evenimentul activ se suspendă ca la contestații
-- (003/FR-016a, research R4); reactivarea rămâne manuală. Altfel nicio schimbare.
create function public.refund_activation_effect(pay public.payments)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  select ev.status into v_status from public.events ev where ev.id = pay.event_id for update;
  if v_status is distinct from 'active' then
    return 'none';
  end if;
  perform public.transition_event(pay.event_id, 'suspended', 'payment', null, 'Plată rambursată', pay.stripe_payment_intent_id);
  return 'suspended';
end;
$$;

-- Rambursarea integrală a unei prelungiri (US2, FR-007–FR-009; research R5): opțiunea de dinainte
-- revine cu snapshot-ul ei, iar data ștergerii și prețul final se recalculează (compute_purge_at),
-- doar dacă revenirea e sigură; altfel administratorii ajustează manual.
create function public.refund_extension_effect(pay public.payments)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events ev where ev.id = pay.event_id for update;
  if not found or e.status <> 'active' then
    return 'none';
  end if;

  if pay.previous_retention_option_id is null
     or exists (
       select 1 from public.event_retention_changes c where c.event_id = e.id and c.created_at > pay.paid_at
     )
     or ((e.upload_ends_at at time zone 'Europe/Bucharest') + make_interval(months => pay.previous_retention_months))
        at time zone 'Europe/Bucharest' <= now() + interval '7 days' then
    perform pgmq.send('media_jobs', jsonb_build_object(
      'type', 'admin_payment_notice', 'payment_id', pay.id, 'reason', 'RETENTION_MANUAL'));
    return 'manual_adjustment';
  end if;

  perform set_config('app.payment_snapshot',
    jsonb_build_object('months', pay.previous_retention_months, 'surcharge', pay.previous_surcharge_minor)::text, true);
  perform set_config('app.retention_actor', 'payment', true);
  update public.events set retention_option_id = pay.previous_retention_option_id where id = e.id;
  perform set_config('app.payment_snapshot', '', true);
  perform set_config('app.retention_actor', '', true);
  return 'retention_reverted';
end;
$$;

-- Ca în 20261002000700, plus opțiunea de dinainte reținută pe plată, pentru revenirea la
-- rambursare (FR-007). Semnătura și drepturile neschimbate.
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

  update public.payments
     set previous_retention_option_id = e.retention_option_id,
         previous_retention_months = e.retention_months,
         previous_surcharge_minor = e.retention_surcharge_minor
   where id = pay.id;

  perform set_config('app.payment_snapshot',
    jsonb_build_object('months', pay.retention_months, 'surcharge', pay.surcharge_minor)::text, true);
  perform set_config('app.retention_actor', 'payment', true);
  update public.events set retention_option_id = pay.retention_option_id where id = e.id;
  perform set_config('app.payment_snapshot', '', true);
  perform set_config('app.retention_actor', '', true);
  return null;
end;
$$;

revoke execute on function public.register_refund(text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.register_refund(text, bigint, timestamptz) to service_role;
revoke execute on function public.refund_activation_effect(public.payments) from public, anon, authenticated;
revoke execute on function public.refund_extension_effect(public.payments) from public, anon, authenticated;

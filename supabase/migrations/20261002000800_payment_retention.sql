-- Păstrarea datelor de plată (003: FR-018; data-model.md › Retenție). Plățile rămân cât rămân
-- datele de facturare ale evenimentului și se anonimizează odată cu el (001/FR-047); plățile
-- neterminate fără eveniment și jurnalul webhook-urilor se șterg după 90 de zile.

alter table public.payments alter column event_name drop not null;
alter table public.payments alter column organizer_email drop not null;

-- La anonimizarea evenimentului (anonymize_expired_events), plățile pierd datele personale;
-- suma, data și referințele Stripe rămân pentru contabilitate.
create function public.anonymize_event_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments
     set event_name = null, organizer_email = null,
         billing_name = null, billing_address = null, billing_company = null, billing_tax_id = null
   where event_id = new.id;
  return new;
end;
$$;

create trigger events_anonymize_payments
  after update of anonymized_at on public.events
  for each row
  when (old.anonymized_at is null and new.anonymized_at is not null)
  execute function public.anonymize_event_payments();

create function public.purge_payment_noise()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.stripe_webhook_events where received_at < now() - interval '90 days';
  delete from public.payments
   where event_id is null and status in ('open', 'expired', 'failed') and created_at < now() - interval '90 days';
$$;

revoke execute on function public.purge_payment_noise() from public, anon, authenticated;

select cron.schedule('purge-payment-noise', '50 3 * * *', $$select public.purge_payment_noise()$$);

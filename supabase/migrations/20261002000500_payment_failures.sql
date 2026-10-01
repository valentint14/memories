-- Plățile eșuate și expirate (003: FR-007, FR-008; contracts/database-functions.md). Reluarea și
-- înlocuirea plății deschise sunt deja în `prepare_payment` (20261002000400).

-- `checkout.session.async_payment_failed`: doar o plată deschisă devine eșuată.
create function public.fail_payment(p_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set status = 'failed', checkout_url = null
   where stripe_session_id = p_session_id and status = 'open';
$$;

-- `checkout.session.expired`: doar o plată deschisă devine expirată.
create function public.expire_payment(p_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set status = 'expired', checkout_url = null
   where stripe_session_id = p_session_id and status = 'open';
$$;

-- Plasă de siguranță dacă webhook-ul de expirare lipsește: plățile deschise cu peste o oră după
-- termen (Stripe nu le mai poate încasa) se închid.
create function public.expire_stale_payments()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.payments set status = 'expired', checkout_url = null
   where status = 'open' and expires_at < now() - interval '1 hour';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.fail_payment(text) from public, anon, authenticated;
revoke execute on function public.expire_payment(text) from public, anon, authenticated;
revoke execute on function public.expire_stale_payments() from public, anon, authenticated;
grant execute on function public.fail_payment(text) to service_role;
grant execute on function public.expire_payment(text) to service_role;

select cron.schedule('expire-open-payments', '*/15 * * * *', $$select public.expire_stale_payments()$$);

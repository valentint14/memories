-- Jurnalul webhook-urilor Stripe (003: contracts/database-functions.md). Stripe livrează „cel puțin
-- o dată”: un eveniment deja procesat nu se mai tratează. Un eveniment primit, dar netratat
-- (eroare), rămâne cu `processed_at` null și se reia la următoarea livrare.

create function public.record_webhook_event(p_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_processed timestamptz;
begin
  insert into public.stripe_webhook_events (id, type) values (p_id, p_type)
  on conflict (id) do nothing;
  select w.processed_at into v_processed from public.stripe_webhook_events w where w.id = p_id;
  return v_processed is null;
end;
$$;

create function public.finish_webhook_event(p_id text, p_outcome text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.stripe_webhook_events set processed_at = now(), outcome = p_outcome where id = p_id;
$$;

revoke execute on function public.record_webhook_event(text, text) from public, anon, authenticated;
revoke execute on function public.finish_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.record_webhook_event(text, text) to service_role;
grant execute on function public.finish_webhook_event(text, text) to service_role;

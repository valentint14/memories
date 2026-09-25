-- `organizer_events` este vederea organizatorului: doar evenimentele adresei sale.
-- Prin RLS, un admin aal2 vede toate evenimentele; fără filtrul de mai jos, un admin autentificat
-- în același browser deschidea pagina organizatorului cu galeria goală (media_items nu are politică
-- de citire pentru admin).

create or replace view public.organizer_events
with (security_invoker = true) as
  select id, name, event_date, upload_starts_at, upload_ends_at, final_price_minor,
         retention_months, purge_at, expired_at, status,
         origin, activated_at, pending_purge_at, created_at
    from public.events
   where organizer_email = (auth.jwt() ->> 'email')::extensions.citext;

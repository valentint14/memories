-- 002: organizatorul își descarcă singur codul QR (FR-009; 001 îl rezerva administratorului).
-- Tokenul rămâne ascuns în tabele (privilegii pe coloane); se obține doar prin această funcție.

create function public.organizer_event_token(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.public_token from public.events e
   where e.id = p_event_id
     and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
     and e.status in ('awaiting_activation', 'active', 'suspended');
$$;

revoke execute on function public.organizer_event_token(uuid) from public, anon;
grant execute on function public.organizer_event_token(uuid) to authenticated;

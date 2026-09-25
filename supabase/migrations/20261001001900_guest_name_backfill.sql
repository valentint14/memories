-- Numele invitatului completat sau schimbat după primele fișiere ajunge și pe fișierele deja
-- încărcate din aceeași sesiune (galeria organizatorului afișa „Invitat anonim” pentru ele).

create or replace function public.update_guest_name(p_session_id uuid, p_token text, p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_name is not null and char_length(v_name) > 50 then
    perform public.raise_app_error('NAME_TOO_LONG');
  end if;
  update public.guest_sessions gs
     set display_name = v_name, last_seen_at = now()
    from public.events ev
   where gs.id = p_session_id and ev.id = gs.event_id and ev.public_token = p_token;
  if not found then
    perform public.raise_app_error('SESSION_MISSING');
  end if;
  update public.media_items
     set guest_name = v_name
   where guest_session_id = p_session_id
     and guest_name is distinct from v_name;
end;
$$;

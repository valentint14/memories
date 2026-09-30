-- Linkul invitatului lizibil (FR-004, revizuit): slug din numele evenimentului + un sufix aleator de
-- 6 caractere, de ex. `nunta-ana-si-mihai-k7p2x9`. Un link doar din nume ar putea fi ghicit de
-- oricine știe de eveniment; sufixul îl face imposibil de ghicit doar din nume, iar încercările
-- sunt oricum limitate (rate limits pe sesiuni și rezervări).
--
-- Tokenul se fixează la creare și nu urmează redenumirile: codul QR tipărit rămâne valid. La
-- expirare, `complete_event_expiry` îl înlocuiește în continuare cu o valoare aleatoare (linkul
-- vechi → not_found), ca până acum.

-- Slug-ul unui nume: litere mici fără diacritice, cifre și cratime, cel mult ~40 de caractere
-- (tăiat la ultima cratimă), „eveniment” dacă nu rămâne nimic.
create or replace function public.event_slug(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text;
begin
  s := translate(lower(coalesce(p_name, '')),
                 'ăâîșşțţáàäãåéèëêíìïóòöõôőúùüûűçñ',
                 'aaissttaaaaaeeeeiiiooooouuuuucn');
  s := btrim(regexp_replace(s, '[^a-z0-9]+', '-', 'g'), '-');
  if char_length(s) > 40 then
    s := left(s, 41);
    -- Tăiat la cuvânt, dacă se poate; altfel, la 40 de caractere.
    s := case when position('-' in s) > 0 then regexp_replace(s, '-[^-]*$', '') else left(s, 40) end;
  end if;
  return coalesce(nullif(s, ''), 'eveniment');
end;
$$;

-- Un token nou pentru un nume: slug + '-' + 6 caractere din 31 (fără 0/o, 1/l/i), unic.
create or replace function public.new_event_token(p_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  slug constant text := public.event_slug(p_name);
  bytes bytea;
  suffix text;
  candidate text;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    suffix := '';
    for i in 0..5 loop
      suffix := suffix || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    candidate := slug || '-' || suffix;
    exit when not exists (select 1 from public.events e where e.public_token = candidate);
  end loop;
  return candidate;
end;
$$;

revoke all on function public.event_slug(text) from public, anon, authenticated;
revoke all on function public.new_event_token(text) from public, anon, authenticated;

-- La creare, tokenul se derivă din nume (indiferent de calea de creare: admin, self-service).
-- `security definer`: adminul inserează cu rolul `authenticated`, care nu poate apela
-- `new_event_token` și nu vede toate evenimentele (verificarea de unicitate trebuie să le vadă).
create or replace function public.events_readable_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is not null then
    new.public_token := public.new_event_token(new.name);
  end if;
  return new;
end;
$$;

create trigger events_readable_token
  before insert on public.events
  for each row execute function public.events_readable_token();

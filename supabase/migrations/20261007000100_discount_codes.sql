-- Codurile de reducere (005: FR-001–FR-015; data-model.md; contracts/database-functions.md).
-- Utilizările unui cod sunt plățile lui `open` / `paid` / `refund_due` (research R2): o plată eșuată
-- sau expirată eliberează codul fără altă stare de sincronizat.

create type public.discount_kind as enum ('personal', 'campaign');
create type public.discount_type as enum ('fixed', 'percent');

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  -- 8 caractere fără simboluri ambigue (0/O, 1/I/L), stocate normalizat (research R1).
  code text not null unique constraint discount_codes_code check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  kind public.discount_kind not null,
  discount_type public.discount_type not null,
  -- `fixed`: bani; `percent`: procent întreg.
  discount_value bigint not null,
  max_uses int not null,
  expires_at timestamptz,
  disabled_at timestamptz,
  note text constraint discount_codes_note check (note is null or char_length(note) <= 200),
  batch_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint discount_codes_value check (
    (discount_type = 'fixed' and discount_value > 0)
    or (discount_type = 'percent' and discount_value between 1 and 99)
  ),
  constraint discount_codes_uses check (
    (kind = 'personal' and max_uses = 1) or (kind = 'campaign' and max_uses between 2 and 1000)
  )
);

create index discount_codes_created_idx on public.discount_codes (created_at desc);

alter table public.discount_codes enable row level security;
revoke all on table public.discount_codes from anon, authenticated;
grant select on table public.discount_codes to authenticated;
create policy discount_codes_admin_select on public.discount_codes
  for select to authenticated using (public.is_admin());

-- Plata reține codul, prețul întreg și reducerea, înghețate la pregătire (FR-009, FR-014).
alter table public.payments
  add column discount_code_id uuid references public.discount_codes (id) on delete restrict,
  add column full_amount_minor bigint,
  add column discount_minor bigint;

alter table public.payments
  add constraint payments_discount check (
    (discount_code_id is null and full_amount_minor is null and discount_minor is null)
    or (discount_code_id is not null
        and purpose = 'activation'
        and discount_minor > 0
        and amount_minor = full_amount_minor - discount_minor
        and amount_minor >= 300)
  );

create index payments_discount_code_idx on public.payments (discount_code_id)
  where status in ('open', 'paid', 'refund_due');

-- „k7qm 3xpa”, „K7QM-3XPA” → „K7QM3XPA” (FR-012).
create function public.normalize_discount_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
$$;

-- Reducerea aplicată unui preț întreg (research R4): suma de plată nu coboară sub 3,00 lei.
create function public.discount_amount(p_code public.discount_codes, p_full bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select least(
    case when p_code.discount_type = 'fixed' then p_code.discount_value
         else round(p_full * p_code.discount_value / 100.0)::bigint end,
    greatest(p_full - 300, 0)
  );
$$;

-- Utilizările (rezervate și definitive) ale unui cod, fără plata `p_ignore_payment`.
create function public.discount_code_uses(p_code_id uuid, p_ignore_payment uuid default null)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.payments p
   where p.discount_code_id = p_code_id
     and p.status in ('open', 'paid', 'refund_due')
     and p.id is distinct from p_ignore_payment;
$$;

-- Poate fi aplicat codul de organizatorul `p_email`? Ridică eroarea potrivită (FR-004, FR-006, FR-011).
-- `p_ignore_payment`: plata deschisă a evenimentului, pe care noua plată o va înlocui.
create function public.check_discount_code(p_code public.discount_codes, p_email extensions.citext, p_ignore_payment uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_used int;
  v_all int;
begin
  if p_code.id is null or p_code.disabled_at is not null or (p_code.expires_at is not null and p_code.expires_at <= now()) then
    perform public.raise_app_error('DISCOUNT_INVALID');
  end if;
  select count(*) filter (where p.status in ('paid', 'refund_due')), count(*)
    into v_used, v_all
    from public.payments p
   where p.discount_code_id = p_code.id
     and p.status in ('open', 'paid', 'refund_due')
     and p.id is distinct from p_ignore_payment;
  if v_used >= p_code.max_uses then
    perform public.raise_app_error('DISCOUNT_UNAVAILABLE');
  end if;
  if p_code.kind = 'campaign' and exists (
    select 1 from public.payments p
     where p.discount_code_id = p_code.id
       and p.status in ('paid', 'refund_due')
       and p.organizer_email = p_email
  ) then
    perform public.raise_app_error('DISCOUNT_UNAVAILABLE');
  end if;
  if v_all >= p_code.max_uses or (p_code.kind = 'campaign' and exists (
    select 1 from public.payments p
     where p.discount_code_id = p_code.id
       and p.status = 'open'
       and p.organizer_email = p_email
       and p.id is distinct from p_ignore_payment
  )) then
    perform public.raise_app_error('DISCOUNT_RESERVED');
  end if;
end;
$$;

revoke execute on function public.discount_amount(public.discount_codes, bigint) from public, anon, authenticated;
revoke execute on function public.discount_code_uses(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.check_discount_code(public.discount_codes, extensions.citext, uuid) from public, anon, authenticated;

-- „K7QM3XPA” → „K7QM-3XPA”, pentru afișare.
create function public.format_discount_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substr(p_code, 1, 4) || '-' || substr(p_code, 5, 4);
$$;

-- Generarea de către administrator (US1: FR-001–FR-003). Codurile personale în lot, codul de
-- campanie unul singur, cu maximul de utilizări; caracterele vin din generatorul criptografic.
create function public.generate_discount_codes(
  p_kind public.discount_kind,
  p_discount_type public.discount_type,
  p_discount_value bigint,
  p_count int,
  p_max_uses int,
  p_expires_at timestamptz,
  p_note text
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_batch uuid := gen_random_uuid();
  v_max int;
  v_code text;
  v_bytes bytea;
  v_id uuid;
  i int;
  k int;
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  v_max := case when p_kind = 'personal' then 1 else p_max_uses end;
  if (p_kind = 'personal' and (p_count is null or p_count not between 1 and 100))
     or (p_kind = 'campaign' and (p_count is distinct from 1 or v_max is null or v_max not between 2 and 1000))
     or p_discount_value is null
     or (p_discount_type = 'fixed' and p_discount_value <= 0)
     or (p_discount_type = 'percent' and p_discount_value not between 1 and 99)
     or (p_expires_at is not null and p_expires_at <= now())
     or (p_note is not null and char_length(p_note) > 200) then
    perform public.raise_app_error('VALIDATION');
  end if;

  for i in 1..p_count loop
    loop
      -- Doar octeții sub 248 (8 × 31): fiecare simbol are aceeași probabilitate.
      v_bytes := extensions.gen_random_bytes(32);
      v_code := '';
      for k in 0..31 loop
        exit when char_length(v_code) = 8;
        if get_byte(v_bytes, k) < 248 then
          v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, k) % 31) + 1, 1);
        end if;
      end loop;
      continue when char_length(v_code) < 8;
      begin
        insert into public.discount_codes (code, kind, discount_type, discount_value, max_uses, expires_at, note, batch_id, created_by)
        values (v_code, p_kind, p_discount_type, p_discount_value, v_max, p_expires_at, nullif(btrim(p_note), ''), v_batch, auth.uid())
        returning discount_codes.id into v_id;
        exit;
      exception when unique_violation then
        -- Coliziune (rară): alt cod.
      end;
    end loop;
    id := v_id;
    code := public.format_discount_code(v_code);
    return next;
  end loop;
end;
$$;

create function public.disable_discount_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  update public.discount_codes set disabled_at = coalesce(disabled_at, now()) where id = p_id;
  if not found then
    perform public.raise_app_error('NOT_FOUND');
  end if;
end;
$$;

-- Lista pentru administrare (US1, US3: FR-013), cu starea derivată (data-model.md) și utilizările.
create function public.admin_discount_codes()
returns table (
  id uuid, code text, kind public.discount_kind, discount_type public.discount_type, discount_value bigint,
  max_uses int, uses int, status text, expires_at timestamptz, disabled_at timestamptz, note text,
  created_at timestamptz, redemptions jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  return query
    select c.id, public.format_discount_code(c.code), c.kind, c.discount_type, c.discount_value, c.max_uses,
           coalesce(u.uses, 0),
           case when c.disabled_at is not null then 'disabled'
                when c.expires_at is not null and c.expires_at <= now() then 'expired'
                when coalesce(u.uses, 0) >= c.max_uses then 'exhausted'
                else 'available' end,
           c.expires_at, c.disabled_at, c.note, c.created_at,
           coalesce(u.redemptions, '[]'::jsonb)
      from public.discount_codes c
      left join lateral (
        select count(*)::int as uses,
               jsonb_agg(jsonb_build_object(
                 'payment_id', p.id, 'event_id', p.event_id, 'event_name', p.event_name,
                 'organizer_email', p.organizer_email, 'status', p.status, 'paid_at', p.paid_at,
                 'created_at', p.created_at) order by p.created_at) as redemptions
          from public.payments p
         where p.discount_code_id = c.id and p.status in ('open', 'paid', 'refund_due')
      ) u on true
     order by c.created_at desc, c.code;
end;
$$;

revoke execute on function public.generate_discount_codes(public.discount_kind, public.discount_type, bigint, int, int, timestamptz, text) from public, anon;
grant execute on function public.generate_discount_codes(public.discount_kind, public.discount_type, bigint, int, int, timestamptz, text) to authenticated;
revoke execute on function public.disable_discount_code(uuid) from public, anon;
grant execute on function public.disable_discount_code(uuid) to authenticated;
revoke execute on function public.admin_discount_codes() from public, anon;
grant execute on function public.admin_discount_codes() to authenticated;

-- Codul aplicat cu succes pe un eveniment (butonul „Aplică”). `prepare_payment` acceptă doar un cod
-- aplicat: altfel, apelată direct, ar fi o cale de încercare a codurilor fără limită (FR-011).
create table public.discount_applications (
  event_id uuid primary key references public.events (id) on delete cascade,
  discount_code_id uuid not null references public.discount_codes (id) on delete cascade,
  applied_at timestamptz not null default now()
);

alter table public.discount_applications enable row level security;
revoke all on table public.discount_applications from anon, authenticated;

-- Prețurile cu codul aplicat (US2: FR-007, FR-011, FR-012). Încercările se numără înainte de
-- validare, iar refuzul vine în coloana `error`, nu ca excepție: o excepție ar anula și numărarea.
-- Doar serverul o apelează, cu emailul verificat al utilizatorului și IP-ul real: un client care ar
-- apela-o direct și-ar putea alege adresa IP, ocolind limita.
create function public.discount_quote(p_event_id uuid, p_code text, p_email extensions.citext, p_ip_hash text, p_ip_limit int)
returns table (
  option_id uuid, months int, full_amount_minor bigint, discount_minor bigint, amount_minor bigint,
  purge_at timestamptz, included boolean, code text, error text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  c public.discount_codes;
  v_email extensions.citext := p_email;
  v_open uuid;
  v_ok boolean;
  pkg public.packages;
  v_end timestamptz;
begin
  select * into e from public.events ev where ev.id = p_event_id and ev.organizer_email = v_email;
  if not found or e.status <> 'awaiting_activation' then
    return;
  end if;

  v_ok := public.check_rate_limit('discount:email:' || encode(extensions.digest(lower(v_email::text), 'sha256'), 'hex'), 10, interval '1 hour');
  if p_ip_hash is not null then
    v_ok := public.check_rate_limit('discount:ip:' || p_ip_limit || ':' || p_ip_hash, p_ip_limit, interval '1 hour') and v_ok;
  end if;
  if not v_ok then
    return query select null::uuid, null::int, null::bigint, null::bigint, null::bigint, null::timestamptz, null::boolean, null::text, 'RATE_LIMITED'::text;
    return;
  end if;

  select * into c from public.discount_codes dc where dc.code = public.normalize_discount_code(p_code);
  select p.id into v_open from public.payments p
   where p.event_id = p_event_id and p.purpose = 'activation' and p.status = 'open';
  begin
    perform public.check_discount_code(c, v_email, v_open);
  exception when raise_exception then
    return query select null::uuid, null::int, null::bigint, null::bigint, null::bigint, null::timestamptz, null::boolean, null::text, sqlerrm;
    return;
  end;

  insert into public.discount_applications (event_id, discount_code_id) values (p_event_id, c.id)
  on conflict (event_id) do update set discount_code_id = excluded.discount_code_id, applied_at = now();

  -- Opțiunile ca în `activation_quote` (003), aceeași regulă de dată; aici apelantul e serverul,
  -- deci proprietarul s-a verificat mai sus după emailul primit.
  select * into pkg from public.packages p where p.code = 'complete';
  v_end := (greatest(e.event_date, (now() at time zone 'Europe/Bucharest')::date) + 2)::timestamp at time zone 'Europe/Bucharest';
  return query
    select ro.id, ro.months, pkg.price_minor + ro.surcharge_minor,
           public.discount_amount(c, pkg.price_minor + ro.surcharge_minor),
           pkg.price_minor + ro.surcharge_minor - public.discount_amount(c, pkg.price_minor + ro.surcharge_minor),
           ((v_end at time zone 'Europe/Bucharest') + make_interval(months => ro.months)) at time zone 'Europe/Bucharest',
           ro.id = pkg.retention_option_id,
           public.format_discount_code(c.code), null::text
      from public.retention_options ro
     where ro.active
     order by ro.months;
end;
$$;

revoke execute on function public.discount_quote(uuid, text, extensions.citext, text, int) from public, anon, authenticated;
grant execute on function public.discount_quote(uuid, text, extensions.citext, text, int) to service_role;

-- Ca în 20261002000400 (expirarea la 23 h), plus codul de reducere (US2: FR-006–FR-010; research
-- R3, R4): doar la activare, doar un cod aplicat pe eveniment, cu rândul codului blocat cât se
-- numără utilizările; reducerea se îngheață pe plată alături de prețul întreg.
drop function public.prepare_payment(uuid, public.payment_purpose, uuid, bigint);

create function public.prepare_payment(
  p_event_id uuid,
  p_purpose public.payment_purpose,
  p_option_id uuid,
  p_expected_amount_minor bigint,
  p_discount_code text default null
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
  c public.discount_codes;
  open_pay public.payments;
  v_base bigint;
  v_surcharge bigint;
  v_full bigint;
  v_discount bigint;
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
    v_full := v_base + v_surcharge;
    v_deadline := e.pending_purge_at;
  else
    -- Prelungirea plătită (003/FR-020): diferența față de prețul final deja plătit, fără reducere.
    if p_discount_code is not null then
      perform public.raise_app_error('PAYMENT_NOT_ALLOWED');
    end if;
    if e.status <> 'active' or now() >= e.purge_at then
      perform public.raise_app_error('PAYMENT_NOT_ALLOWED');
    end if;
    if o.months <= e.retention_months then
      perform public.raise_app_error('RETENTION_NOT_LONGER');
    end if;
    v_base := e.base_price_minor;
    v_surcharge := o.surcharge_minor;
    v_full := v_base + v_surcharge - e.final_price_minor;
    v_deadline := e.purge_at;
  end if;

  select * into open_pay from public.payments p
   where p.event_id = p_event_id and p.purpose = p_purpose and p.status = 'open'
   for update;

  v_discount := 0;
  if p_discount_code is not null then
    select * into c from public.discount_codes dc
     where dc.code = public.normalize_discount_code(p_discount_code)
       and exists (
         select 1 from public.discount_applications a
          where a.event_id = p_event_id and a.discount_code_id = dc.id and a.applied_at > now() - interval '24 hours'
       )
     for update;
    if not found then
      perform public.raise_app_error('DISCOUNT_INVALID');
    end if;
    perform public.check_discount_code(c, e.organizer_email, open_pay.id);
    v_discount := public.discount_amount(c, v_full);
    -- Fără reducere efectivă (preț deja sub minim), plata nu reține codul.
    if v_discount = 0 then
      c := null;
    end if;
  end if;
  v_amount := v_full - v_discount;

  if v_amount <> p_expected_amount_minor then
    perform public.raise_app_error('PRICE_CHANGED', jsonb_build_object('amountMinor', v_amount));
  end if;
  if v_amount <= 0 then
    perform public.raise_app_error('PAYMENT_NOT_ALLOWED');
  end if;

  -- Cel mult 23 h și cu cel puțin 1 h înainte de ștergere (003/FR-008; Stripe: sub 24 h).
  v_expires := least(now() + interval '23 hours', coalesce(v_deadline, now() + interval '25 hours') - interval '1 hour');
  if v_expires < now() + interval '30 minutes' then
    perform public.raise_app_error('PAYMENT_WINDOW_CLOSED');
  end if;

  if open_pay.id is not null then
    if open_pay.retention_option_id = p_option_id and open_pay.amount_minor = v_amount
       and open_pay.discount_code_id is not distinct from c.id
       and open_pay.expires_at >= now() + interval '10 minutes' and open_pay.checkout_url is not null then
      return query select open_pay.id, open_pay.amount_minor, open_pay.checkout_url, open_pay.expires_at, null::text;
      return;
    end if;
    update public.payments set status = 'expired', checkout_url = null where id = open_pay.id;
    v_replaced := open_pay.stripe_session_id;
  end if;

  insert into public.payments (
    event_id, event_name, organizer_email, created_by, purpose, retention_option_id, retention_months,
    base_price_minor, surcharge_minor, amount_minor, expires_at, discount_code_id, full_amount_minor, discount_minor
  ) values (
    e.id, coalesce(e.name, ''), e.organizer_email, auth.uid(), p_purpose, o.id, o.months,
    v_base, v_surcharge, v_amount, v_expires,
    c.id, case when c.id is null then null else v_full end, case when c.id is null then null else v_discount end
  )
  returning id into v_id;

  return query select v_id, v_amount, null::text, v_expires, v_replaced;
end;
$$;

revoke execute on function public.prepare_payment(uuid, public.payment_purpose, uuid, bigint, text) from public, anon;
grant execute on function public.prepare_payment(uuid, public.payment_purpose, uuid, bigint, text) to authenticated;

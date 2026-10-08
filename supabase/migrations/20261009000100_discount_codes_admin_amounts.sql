-- Registrul codurilor de reducere din administrare: fiecare utilizare aduce și reducerea acordată
-- (`discount_minor`), ca pagina să arate totalul reducerilor. Aceeași semnătură; doar obiectul JSON
-- al utilizării primește câmpul nou.
create or replace function public.admin_discount_codes()
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
                 'created_at', p.created_at, 'discount_minor', p.discount_minor) order by p.created_at) as redemptions
          from public.payments p
         where p.discount_code_id = c.id and p.status in ('open', 'paid', 'refund_due')
      ) u on true
     order by c.created_at desc, c.code;
end;
$$;

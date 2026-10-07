-- Ștergerea unui cod de reducere (005, completare): doar dacă n-a fost folosit niciodată. O plată
-- reușită sau în curs cu acel cod îl păstrează (evidența facturării), iar codul se poate doar
-- dezactiva; plățile abandonate (expirate, eșuate) pierd legătura cu el.
create function public.delete_discount_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  perform 1 from public.discount_codes c where c.id = p_id for update;
  if not found then
    perform public.raise_app_error('NOT_FOUND');
  end if;
  if exists (
    select 1 from public.payments p where p.discount_code_id = p_id and p.status in ('open', 'paid', 'refund_due')
  ) then
    perform public.raise_app_error('DISCOUNT_UNAVAILABLE');
  end if;

  update public.payments
     set discount_code_id = null, full_amount_minor = null, discount_minor = null
   where discount_code_id = p_id;
  delete from public.discount_codes where id = p_id;
end;
$$;

revoke execute on function public.delete_discount_code(uuid) from public, anon;
grant execute on function public.delete_discount_code(uuid) to authenticated;

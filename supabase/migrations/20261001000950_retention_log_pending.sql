-- 002: istoricul retenției (001/FR-043) începe la activare; evenimentele neconfirmate sau
-- neactivate nu au încă opțiune de retenție și preț (FR-016, FR-025).

create or replace function public.log_retention_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.retention_actor;
  v_had_option boolean;
begin
  if new.retention_option_id is null then
    return new;
  end if;
  v_had_option := tg_op = 'UPDATE' and old.retention_option_id is not null;

  if tg_op = 'INSERT' then
    v_actor := 'system';
  elsif nullif(current_setting('app.retention_actor', true), '') is not null then
    v_actor := current_setting('app.retention_actor', true)::public.retention_actor;
  elsif public.is_admin() then
    v_actor := 'admin';
  else
    v_actor := 'system';
  end if;

  if v_had_option and
     new.retention_option_id is not distinct from old.retention_option_id and
     new.retention_surcharge_minor is not distinct from old.retention_surcharge_minor and
     new.base_price_minor is not distinct from old.base_price_minor and
     new.purge_at is not distinct from old.purge_at then
    return new;
  end if;

  insert into public.event_retention_changes (
    event_id, actor_kind, actor_user_id, from_months, to_months,
    from_final_price_minor, to_final_price_minor, to_purge_at
  ) values (
    new.id, v_actor, auth.uid(),
    case when v_had_option then old.retention_months end, new.retention_months,
    case when v_had_option then old.final_price_minor end, new.final_price_minor,
    new.purge_at
  );
  return new;
end;
$$;

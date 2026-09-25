-- 002: cererea de activare a pachetului complet (FR-018a).

create table public.activation_requests (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index activation_requests_event_idx on public.activation_requests (event_id, requested_at desc);

alter table public.activation_requests enable row level security;
revoke all on table public.activation_requests from anon, authenticated;
grant select on table public.activation_requests to authenticated;

create policy activation_requests_owner_select on public.activation_requests
  for select to authenticated
  using (exists (
    select 1 from public.events e
     where e.id = activation_requests.event_id
       and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
  ));
create policy activation_requests_admin_select on public.activation_requests
  for select to authenticated using (public.is_admin());

create function public.request_activation(p_event_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_last timestamptz;
  v_now timestamptz := now();
begin
  select e.status into v_status from public.events e
   where e.id = p_event_id
     and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
     and e.status not in ('unconfirmed', 'deleting')
   for update;
  if not found then
    perform public.raise_app_error('FORBIDDEN');
  end if;
  if v_status <> 'awaiting_activation' then
    perform public.raise_app_error('INVALID_TRANSITION');
  end if;

  select max(r.requested_at) into v_last from public.activation_requests r where r.event_id = p_event_id;
  if v_last is not null and v_last > v_now - interval '24 hours' then
    perform public.raise_app_error('ACTIVATION_REQUEST_TOO_SOON', jsonb_build_object('retryAt', v_last + interval '24 hours'));
  end if;

  insert into public.activation_requests (event_id, requested_at) values (p_event_id, v_now);
  perform pgmq.send('media_jobs', jsonb_build_object('type', 'admin_activation_notice', 'event_id', p_event_id));
  return v_now;
end;
$$;

revoke execute on function public.request_activation(uuid) from public, anon;
grant execute on function public.request_activation(uuid) to authenticated;

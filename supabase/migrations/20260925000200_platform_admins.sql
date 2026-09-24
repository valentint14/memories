-- Administratori platformei (FR-006a). Populat doar prin seed/SQL, niciodată din aplicație.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon, authenticated;
-- Nicio politică: clientul nu citește tabelul; doar is_admin() (SECURITY DEFINER).

-- True doar pentru un administrator cu al doilea factor validat (aal2).
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

-- True pentru un utilizator din platform_admins, indiferent de aal (pentru redirecționarea la MFA).
create function public.is_platform_admin_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_platform_admin_user() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_platform_admin_user() to authenticated;

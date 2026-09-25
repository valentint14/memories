-- 002: documentele legale versionate și acceptările (FR-039–FR-041; research R9).

create type public.legal_document_kind as enum ('terms', 'privacy');

create table public.legal_documents (
  kind public.legal_document_kind not null,
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  effective_at timestamptz not null,
  -- SHA-256 al fișierului din apps/web/content/legal/{kind}/{version}.md (LF), verificat în teste.
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (kind, version)
);

alter table public.legal_documents enable row level security;
revoke all on table public.legal_documents from anon, authenticated;
grant select on table public.legal_documents to anon, authenticated;
create policy legal_documents_read on public.legal_documents for select to anon, authenticated using (true);

insert into public.legal_documents (kind, version, effective_at, content_sha256) values
  ('terms', '2026-10-01', '2026-09-24T00:00:00+03:00', '9f83248a7b3a6091b3046e6f9948fdd0e91e9b18164b3a226ab58547effe541f'),
  ('privacy', '2026-10-01', '2026-09-24T00:00:00+03:00', '4a9a6dc5e302a87de513426fa0fa3bbecb7358747a3671f5c3d9551a5e84b68b');

-- Versiunea în vigoare a fiecărui document.
create function public.current_legal_versions()
returns table (kind public.legal_document_kind, version text, effective_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (d.kind) d.kind, d.version, d.effective_at
    from public.legal_documents d
   where d.effective_at <= now()
   order by d.kind, d.effective_at desc;
$$;

grant execute on function public.current_legal_versions() to anon, authenticated;

create table public.terms_acceptances (
  id bigint generated always as identity primary key,
  email extensions.citext,
  user_id uuid,
  event_id uuid references public.events (id) on delete set null,
  document_kind public.legal_document_kind not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  foreign key (document_kind, version) references public.legal_documents (kind, version)
);

create index terms_acceptances_email_idx on public.terms_acceptances (email);
create index terms_acceptances_user_idx on public.terms_acceptances (user_id);
create index terms_acceptances_event_idx on public.terms_acceptances (event_id);

alter table public.terms_acceptances enable row level security;
revoke all on table public.terms_acceptances from anon, authenticated;
grant select on table public.terms_acceptances to authenticated;

create policy terms_acceptances_own on public.terms_acceptances
  for select to authenticated using (user_id = auth.uid());
create policy terms_acceptances_admin on public.terms_acceptances
  for select to authenticated using (public.is_admin());

-- Acceptările unui eveniment neconfirmat dispar odată cu el (FR-040); după confirmare rămân.
create function public.delete_unconfirmed_acceptances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'unconfirmed' then
    delete from public.terms_acceptances where event_id = old.id and user_id is null;
  end if;
  return old;
end;
$$;

create trigger events_delete_unconfirmed_acceptances
  before delete on public.events
  for each row execute function public.delete_unconfirmed_acceptances();

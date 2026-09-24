-- Sesiuni de invitat și fișiere media (data-model.md › guest_sessions, media_items).

create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  display_name text check (display_name is null or (char_length(display_name) <= 50 and display_name = btrim(display_name))),
  files_reserved int not null default 0 check (files_reserved >= 0),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index guest_sessions_event_idx on public.guest_sessions (event_id);

alter table public.guest_sessions enable row level security;
revoke all on table public.guest_sessions from anon, authenticated;
-- Nicio politică: doar funcții SECURITY DEFINER și service role.

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_session_id uuid not null references public.guest_sessions (id) on delete cascade,
  guest_name text check (guest_name is null or char_length(guest_name) <= 50),
  kind public.media_kind not null,
  declared_mime text not null check (declared_mime in (
    'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'video/mp4', 'video/quicktime'
  )),
  detected_mime text,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  declared_bytes bigint not null check (declared_bytes > 0),
  actual_bytes bigint,
  incoming_path text not null unique,
  original_path text,
  display_path text,
  thumb_path text,
  playback_path text,
  width int,
  height int,
  duration_ms int,
  status public.media_status not null default 'reserved',
  processing_error text,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index media_items_event_created_idx on public.media_items (event_id, created_at);
create index media_items_event_uploaded_idx on public.media_items (event_id, uploaded_at, id);
create index media_items_event_updated_idx on public.media_items (event_id, updated_at);
create index media_items_session_idx on public.media_items (guest_session_id);

create trigger media_items_updated_at
  before update on public.media_items
  for each row execute function public.set_updated_at();

alter table public.media_items enable row level security;
revoke all on table public.media_items from anon, authenticated;
grant select on table public.media_items to authenticated;

-- Organizatorul vede fișierele vizibile doar pe evenimentele sale active (FR-009, FR-044).
create policy media_items_organizer_select on public.media_items
  for select to authenticated
  using (
    status in ('uploaded', 'processing', 'ready', 'failed')
    and exists (
      select 1 from public.events e
       where e.id = media_items.event_id
         and e.status = 'active'
         and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
    )
  );
-- Administratorul nu are nicio politică pe media_items (FR-007); vede doar agregate.

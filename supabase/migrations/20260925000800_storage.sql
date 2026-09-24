-- Bucket-uri private și politici pe storage.objects (data-model.md › Storage).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('incoming', 'incoming', false, 1073741824, array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime'
  ]),
  ('media', 'media', false, 1073741824, array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime'
  ]),
  ('archives', 'archives', false, null, array['application/zip']);

-- Organizatorul poate citi și șterge doar în prefixul unui eveniment propriu, activ (FR-044).
create function public.organizer_owns_active_event(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id::text = (storage.foldername(p_object_name))[1]
       and e.status = 'active'
       and e.organizer_email = (auth.jwt() ->> 'email')::extensions.citext
  );
$$;

revoke execute on function public.organizer_owns_active_event(text) from public, anon;
grant execute on function public.organizer_owns_active_event(text) to authenticated;

create policy storage_organizer_select on storage.objects
  for select to authenticated
  using (bucket_id in ('media', 'archives') and public.organizer_owns_active_event(name));

create policy storage_organizer_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('media', 'archives') and public.organizer_owns_active_event(name));

-- Niciun INSERT/UPDATE pentru utilizatori; `incoming` primește fișiere doar prin token de upload
-- semnat (emis de server după rezervare), iar `media`/`archives` doar de la worker (service role).

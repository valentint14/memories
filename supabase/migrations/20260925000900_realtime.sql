-- Realtime pentru galeria organizatorului (research.md R10). RLS se aplică per abonat.

alter table public.media_items replica identity full;
alter table public.archive_jobs replica identity full;

alter publication supabase_realtime add table public.media_items, public.archive_jobs;

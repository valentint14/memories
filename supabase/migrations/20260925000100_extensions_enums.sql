-- Extensii, enumerări și coada de joburi (data-model.md › Enumerări; research.md R7).

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron with schema pg_catalog;

create type public.event_status as enum ('active', 'expiring', 'expired', 'deleting');
create type public.media_kind as enum ('photo', 'video');
create type public.media_status as enum (
  'reserved', 'uploaded', 'processing', 'ready', 'failed', 'rejected', 'deleting'
);
create type public.archive_status as enum ('pending', 'building', 'ready', 'failed', 'expired');
create type public.retention_actor as enum ('admin', 'organizer', 'system');
create type public.notice_threshold as enum ('30d', '7d', '1d');

select pgmq.create('media_jobs');

-- Trigger comun pentru `updated_at`.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Ridică o eroare cu un cod stabil (packages/shared/src/errors.ts) și detalii opționale în JSON.
create function public.raise_app_error(p_code text, p_detail jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    detail = coalesce(p_detail::text, '');
end;
$$;

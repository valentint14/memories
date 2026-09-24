-- 002: jurnal de audit pentru ștergerile automate (research R9). Fără date personale.

create table public.app_audit_log (
  id bigint generated always as identity primary key,
  event_id uuid,
  action text not null check (action in ('auto_deleted_unactivated', 'auto_deleted_unconfirmed_count')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_audit_log enable row level security;
revoke all on table public.app_audit_log from anon, authenticated;

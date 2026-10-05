-- Plățile online prin Stripe (003: data-model.md). Scrierea se face doar prin funcțiile din
-- contracts/database-functions.md; clienții nu au drept de scriere, iar citirea e doar a
-- administratorilor (constituția III).

create type public.payment_purpose as enum ('activation', 'retention_extension');
create type public.payment_status as enum ('open', 'paid', 'failed', 'expired', 'refund_due');

-- Autorul unei prelungiri plătite în istoricul păstrării (001/FR-043).
alter type public.retention_actor add value if not exists 'payment';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- Rândul rămâne după ștergerea evenimentului, pentru facturare (FR-018).
  event_id uuid references public.events (id) on delete set null,
  event_name text not null,
  organizer_email extensions.citext not null,
  created_by uuid references auth.users (id) on delete set null,
  purpose public.payment_purpose not null,
  retention_option_id uuid not null references public.retention_options (id) on delete restrict,
  retention_months int not null check (retention_months between 1 and 60),
  base_price_minor bigint not null check (base_price_minor >= 0),
  surcharge_minor bigint not null check (surcharge_minor >= 0),
  amount_minor bigint not null constraint payments_amount check (amount_minor > 0),
  currency text not null default 'ron' constraint payments_currency check (currency = 'ron'),
  status public.payment_status not null default 'open',
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  checkout_url text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  refund_reason text check (
    refund_reason is null
    or refund_reason in ('EVENT_NOT_AWAITING', 'DUPLICATE_PAYMENT', 'EXTENSION_NOT_POSSIBLE', 'EVENT_DELETED')
  ),
  disputed_at timestamptz,
  billing_name text,
  billing_address jsonb,
  billing_company text,
  billing_tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_paid_complete check (
    status not in ('paid', 'refund_due') or (paid_at is not null and stripe_payment_intent_id is not null)
  ),
  constraint payments_refund_reason check (status <> 'refund_due' or refund_reason is not null)
);

-- O singură plată deschisă per (eveniment, scop) (FR-007, research R5).
create unique index payments_one_open on public.payments (event_id, purpose) where status = 'open';
-- Cel mult o activare plătită: a doua plată reușită devine `refund_due` (FR-011).
create unique index payments_one_paid_activation on public.payments (event_id)
  where purpose = 'activation' and status = 'paid';
create index payments_event_idx on public.payments (event_id, created_at);
create index payments_open_expiry_idx on public.payments (expires_at) where status = 'open';

create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
create policy payments_admin_select on public.payments
  for select to authenticated using (public.is_admin());

revoke all on table public.payments from anon, authenticated;
grant select on table public.payments to authenticated;

-- Jurnalul webhook-urilor: o singură procesare per eveniment Stripe (livrare „cel puțin o dată”).
-- Nu se păstrează corpul evenimentului, doar identificatorul și rezultatul.
create table public.stripe_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text
);

alter table public.stripe_webhook_events enable row level security;
create policy stripe_webhook_events_admin_select on public.stripe_webhook_events
  for select to authenticated using (public.is_admin());

revoke all on table public.stripe_webhook_events from anon, authenticated;
grant select on table public.stripe_webhook_events to authenticated;

# Contract: funcții SQL (003)

Completează contractele din [001](../../001-event-qr-upload/contracts/database-functions.md) și
[002](../../002-self-service-events/contracts/database-functions.md). Toate funcțiile sunt
`security definer`, cu `set search_path = ''`, și ridică erori prin `raise_app_error`.
„Server” = cheia service role, folosită doar în Server Actions și în handler-ul de webhook.

## Pregătirea plății

### `prepare_payment(p_event_id uuid, p_purpose payment_purpose, p_option_id uuid, p_expected_amount_minor bigint) → table(payment_id uuid, amount_minor bigint, reuse_url text, expires_at timestamptz, replaced_session_id text)`

Execuție: `authenticated` (organizatorul). Verifică:
- evenimentul aparține utilizatorului (ca în 002) — altfel `PAYMENT_NOT_ALLOWED`;
- `activation`: stare `awaiting_activation`; opțiunea activă din catalog; sumă = prețul
  pachetului + suplimentul opțiunii; fereastra: ștergerea automată − 1 h ≥ acum + 30 min, altfel
  `PAYMENT_WINDOW_CLOSED`;
- `retention_extension`: stare `active`, acum < `purge_at`, opțiune activă cu mai multe luni
  (`RETENTION_NOT_LONGER`); sumă = (`base_price_minor` + supliment nou) − `final_price_minor`;
  fereastra: `purge_at` − 1 h ≥ acum + 30 min;
- suma calculată = `p_expected_amount_minor`, altfel `PRICE_CHANGED` cu suma nouă (organizatorul
  vede prețul actualizat înainte de plată).

Plata `open` existentă pentru (eveniment, scop):
- aceeași opțiune, aceeași sumă, expiră peste ≥ 10 min și are `checkout_url` → întoarce
  `reuse_url`, fără rând nou;
- altfel → o marchează `expired`, întoarce `replaced_session_id` (serverul o închide la Stripe,
  R5) și inserează plata nouă (`open`, valori înghețate, R6).

### `attach_checkout_session(p_payment_id uuid, p_session_id text, p_checkout_url text) → void`

Execuție: server. Doar pentru o plată `open` fără sesiune. Dacă crearea sesiunii Stripe eșuează,
serverul apelează `expire_payment_by_id(p_payment_id)` și întoarce `PAYMENT_UNAVAILABLE`.

## Finalizarea (webhook și întoarcere)

### `complete_payment(p_session_id text, p_payment_intent_id text, p_billing jsonb) → table(outcome text, event_id uuid)`

Execuție: server. Blochează rândul plății (`for update`). Idempotentă:
- plata nu există → `ignored`;
- plata e deja `paid` / `refund_due` → întoarce rezultatul anterior, fără efecte (FR-006);
- altfel setează `paid_at`, `stripe_payment_intent_id`, datele de facturare (`p_billing`:
  `name`, `address`, `company`, `tax_id`) și:
  - **activare**: dacă evenimentul există, e `awaiting_activation` și nu are altă activare
    plătită → `activate_event(event, 'payment', null, p_session_id, p_payment_id)`, plata
    `paid`, job `payment_confirmation`, `outcome = 'activated'`; dacă e deja `active` din
    aceeași plată → `already_active`; altfel → `refund_due` (`EVENT_NOT_AWAITING`,
    `DUPLICATE_PAYMENT` sau `EVENT_DELETED`), job `admin_payment_notice`, `outcome =
    'refund_due'`;
  - **prelungire**: dacă evenimentul e `active`, acum < `purge_at` și opțiunea plătită are mai
    multe luni decât cea curentă → aplică opțiunea și snapshot-urile din plată cu
    `app.retention_actor = 'payment'`, plata `paid`, job `payment_confirmation`, `outcome =
    'extended'`; altfel → `refund_due` (`EXTENSION_NOT_POSSIBLE`), job `admin_payment_notice`.

### `fail_payment(p_session_id text) → void` / `expire_payment(p_session_id text) → void` / `expire_payment_by_id(p_payment_id uuid) → void`

Execuție: server. Doar dacă plata e `open` (altfel nu face nimic): `failed` / `expired`;
golește `checkout_url`.

### `register_dispute(p_payment_intent_id text) → table(outcome text, event_id uuid)`

Execuție: server. Setează `disputed_at` (dacă nu era setat; altfel `ignored`). Dacă evenimentul
e `active`: `transition_event(event, 'suspended', 'payment', null, 'Plată contestată',
p_payment_intent_id)`, `outcome = 'suspended'`; altfel `outcome = 'unchanged'`. În ambele cazuri,
job `admin_payment_notice` cu motivul `DISPUTE` (FR-016a).

### `record_webhook_event(p_id text, p_type text) → boolean` / `finish_webhook_event(p_id text, p_outcome text) → void`

Execuție: server. `record_webhook_event` inserează `on conflict do nothing` și întoarce `false`
dacă evenimentul a fost deja procesat (`processed_at` nenul), caz în care handler-ul răspunde 200
fără alte efecte.

## Modificate

### `activate_event(p_event_id uuid, p_source status_change_source, p_reason text default null, p_external_ref text default null, p_payment_id uuid default null)`

Nou: `p_payment_id`. Obligatoriu pentru sursa `payment` (altfel `FORBIDDEN`), interzis pentru
`admin`. Cu plată: prețul de bază, opțiunea și snapshot-urile suplimentului vin din plată (R6),
nu din pachetul și catalogul curente. Restul (perioada de upload, `purge_at`, idempotența după
`external_ref`) rămâne ca în 002. Semnătura veche se elimină (`drop function`) și se acordă din
nou `execute` ca în 002.

### `organizer_payment_state(p_event_id uuid) → table(status payment_status, purpose payment_purpose, paid_at timestamptz, updated_at timestamptz)`

Execuție: `authenticated`, proprietarul evenimentului. Ultima plată a evenimentului (pentru
mesajele „plata se confirmă” / „plata nu a reușit”, FR-009). Fără sume sau date de facturare.

### `request_activation` (002)

`revoke execute` de la `authenticated` (FR-015). Funcția rămâne pentru istoric și teste.

### `extend_retention` (001)

`revoke execute` de la `authenticated`: prelungirea organizatorului trece prin plată (FR-020).
Administratorul folosește editarea din 001 (fără plată).

### `enqueue_activation_notices` (002)

Neschimbată; textul emailului `stergere-neactivat` se schimbă (worker).

## Joburi programate (`pg_cron`)

| Job | Frecvență | Funcție |
| --- | --- | --- |
| `expire-open-payments` | `*/15 * * * *` | marchează `expired` plățile `open` cu `expires_at` < acum − 1 h (plasă de siguranță dacă webhook-ul `checkout.session.expired` lipsește) |
| `purge-payment-noise` | `50 3 * * *` | șterge `stripe_webhook_events` > 90 de zile și plățile `open`/`expired`/`failed` > 90 de zile fără eveniment |

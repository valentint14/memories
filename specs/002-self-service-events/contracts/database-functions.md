# Contract: funcții SQL (002)

Completează [contractul din 001](../../001-event-qr-upload/contracts/database-functions.md).
Toate funcțiile sunt `security definer`, cu `set search_path = ''`, și ridică erori prin
`raise_app_error(code, details)` (001). „Server” înseamnă cheia service role, folosită doar în
Server Actions.

## Creare și confirmare

### `request_self_service_event(p_email citext, p_name text, p_event_date date, p_terms_version text, p_privacy_version text) → uuid` (request id)

Execuție: `service_role`. Inserează evenimentul (`unconfirmed`, `origin = self_service`,
token public aleator ca în 001), două rânduri `terms_acceptances` (fără `user_id`) și cererea
`auth_requests` (`create`, expiră în 15 min). Invalidează cererile `pending` anterioare ale
adresei. Validări: FR-002, versiunile curente (`TERMS_OUTDATED`). Nu verifică limita FR-021
(se verifică la confirmare, pentru a nu dezvălui existența adresei).

### `request_login(p_email citext) → uuid`

Execuție: `service_role`. Cerere `login`; invalidează cererile anterioare. Nu verifică
existența adresei.

### `register_failed_code(p_request_id uuid) → auth_request_status`

Execuție: `service_role`. `failed_attempts + 1`; la 5 → `invalidated` și job `auth_rotate`.

### `complete_auth_request(p_request_id uuid) → table(purpose, event_id)`

Execuție: `authenticated` (după `verifyOtp`). Verifică: `pending`, neexpirată, `email =
auth.jwt()->>'email'`. Pentru `create`:
- dacă adresa are deja numărul maxim de evenimente `awaiting_activation`, evenimentul rămâne
  `unconfirmed` (se va șterge), cererea se marchează `used` (autentificarea reușește), iar
  funcția întoarce `AWAITING_LIMIT_REACHED`; utilizatorul ajunge la `/events`, cu mesajul
  despre limită (spec, cazul limită corespunzător);
- altfel `transition_event(event, 'awaiting_activation', 'organizer', auth.uid())`, calculează
  `pending_purge_at` și setează `user_id` pe acceptări.

Marchează cererea `used`.

### `create_event_as_organizer(p_name text, p_event_date date, p_terms_version text default null, p_privacy_version text default null) → uuid`

Execuție: `authenticated`. Creează direct `awaiting_activation` (FR-005). Verifică limita
FR-021 (`AWAITING_LIMIT_REACHED`) și acceptarea versiunii curente (FR-041): dacă ultima
acceptare a utilizatorului nu e cea curentă, versiunile trebuie trimise, altfel
`TERMS_OUTDATED`. Scrie istoricul (`null → awaiting_activation`, sursa `organizer`).

## Stări

### `transition_event(p_event_id uuid, p_to event_status, p_source status_change_source, p_actor uuid, p_reason text default null, p_external_ref text default null, p_note text default null) → void`

Intern (fără `execute` pentru clienți). Blochează rândul (`for update`), verifică perechea în
`event_status_transitions` (`INVALID_TRANSITION`), setează `app.status_transition = 'on'`
local tranzacției, actualizează `status`, inserează în `event_status_changes`.

### `activate_event(p_event_id uuid, p_source status_change_source, p_reason text, p_external_ref text default null) → table(already_active boolean)`

Execuție: `authenticated` cu `is_admin()` pentru sursa `admin`; `service_role` pentru sursa
`payment` (funcționalitate ulterioară). Pentru `awaiting_activation`:
- copiază pachetul în eveniment (`package_id`, preț, limite, `retention_option_id`);
- calculează perioada de upload (FR-034) și `purge_at`;
- setează `activated_at`, golește `pending_purge_at`;
- tranziție spre `active` și istoric.

Pentru `active`: doar istoric `active → active` cu nota „activare repetată” (FR-026). Dacă
`external_ref` există deja pentru eveniment, nu mai scrie nimic și întoarce
`already_active = true`. Alte stări: `INVALID_TRANSITION`.

### `suspend_event(p_event_id uuid, p_reason text) → void` / `reactivate_event(p_event_id uuid, p_reason text) → void`

Execuție: administrator (aal2). `reason` obligatoriu (`REASON_REQUIRED`). Arhivele nu se
modifică: organizatorul poate descărca și cere arhive și în timpul suspendării (FR-028a).

### `admin_update_pending_event(p_event_id uuid, p_name text, p_event_date date) → void`

Execuție: administrator (aal2). Doar pentru `awaiting_activation`; aceleași validări și
recalculări ca `organizer_update_event` (FR-028). Pentru celelalte stări, administratorul
folosește editarea din 001.

## Organizator

### `request_activation(p_event_id uuid) → timestamptz`

Proprietar + stare `awaiting_activation`. Refuză dacă ultima cerere are sub 24 h
(`ACTIVATION_REQUEST_TOO_SOON`, cu `retryAt`). Inserează în `activation_requests` și pune în
coadă `admin_activation_notice`.

### `organizer_update_event(p_event_id uuid, p_name text, p_event_date date) → void`

Proprietar; stare `awaiting_activation` sau `active` (altfel `FORBIDDEN` /
`EVENT_SUSPENDED`). Recalculări conform data-model.md (FR-034, FR-019). Dacă se schimbă
`pending_purge_at`, notificarea `activation_7d` a vechii date nu mai contează (unicitatea e
per dată).

### `request_event_deletion(p_event_id uuid, p_confirm_name text) → void` (extinsă)

Acceptă administratorul **sau** organizatorul proprietar (FR-035):
- dacă `activated_at is null` (niciodată activat), șterge rândul direct;
- altfel, ca în 001: tranziție spre `deleting` (sursa `organizer` / `admin`) și joburile de
  ștergere existente.

## Invitat (modificate)

`resolve_event_for_guest(token)` întoarce și `status`. `start_guest_session` și
`reserve_upload` ridică `EVENT_NOT_ACTIVATED` pentru `awaiting_activation`,
`EVENT_SUSPENDED` pentru `suspended` și `EVENT_NOT_FOUND` pentru `unconfirmed`, `deleting` sau
inexistent. Finalizarea uploadului (trigger din 001) respinge fișierele unui eveniment
`suspended` cu `processing_error = 'EVENT_SUSPENDED'`.

## Joburi programate (`pg_cron`)

| Job | Frecvență | Funcție |
| --- | --- | --- |
| `purge-unconfirmed` | `*/15 * * * *` | `purge_unconfirmed_events()` |
| `purge-unactivated` | `5 * * * *` | `purge_unactivated_events()` (+ `app_audit_log`, + `delete_organizer_user` pentru adresele rămase fără evenimente) |
| `activation-notices` | `10 * * * *` | `enqueue_activation_notices()` (pragul `activation_7d`) |
| `purge-stale-auth-users` | `30 3 * * *` | `purge_stale_auth_users()`: joburi `delete_organizer_user` pentru utilizatorii neconfirmați > 24 h, fără evenimente |
| `purge-auth-requests` | `40 3 * * *` | șterge cererile închise mai vechi de 7 zile |

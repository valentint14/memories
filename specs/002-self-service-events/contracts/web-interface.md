# Contract: interfața web (002)

Completează [contractul web din 001](../../001-event-qr-upload/contracts/web-interface.md).
Toate Server Actions validează intrarea cu zod și întorc `ActionResult<T>` (001). Textele sunt
în română, prin `t()`.

## Rute (pagini)

| Rută | Acces | Conținut |
| --- | --- | --- |
| `/` | public | prezentare + formularul de creare (FR-001); pentru un organizator autentificat, același formular creează direct (FR-005) |
| `/auth/code?request={id}` | public | câmp pentru codul de 6 cifre + „Trimite din nou” (FR-008) |
| `/auth/confirm?request={id}&token_hash={hash}` | public | numele evenimentului (dacă e cerere de creare) și butonul „Confirmă”; `GET` nu consumă tokenul (FR-007) |
| `/login` | public | formularul de autentificare (email + Turnstile), apoi redirecționare la `/auth/code` |
| `/terms`, `/privacy` | public | versiunea curentă, cu versiunea și data intrării în vigoare (FR-039) |
| `/events` | organizator | toate evenimentele adresei, cu starea (FR-012) + butonul „Eveniment nou” |
| `/events/new` | organizator | formularul de creare fără email și fără Turnstile (FR-005) |
| `/events/[eventId]` | organizator | în plus față de 001: panoul de stare (FR-018), „Solicită activarea”, modificarea numelui și a datei, ștergerea evenimentului |
| `/e/[token]` | public | în plus față de 001: mesajele pentru `awaiting_activation` și `suspended` (FR-031, FR-032) |
| `/admin/events` | admin (aal2) | filtre: origine, stare, „activare solicitată”; coloane din FR-027 |
| `/admin/events/[eventId]` | admin (aal2) | acțiunile activare / suspendare / reactivare (cu motiv obligatoriu) și istoricul stărilor (FR-028, FR-029) |
| `/admin/package` | admin (aal2) | pachetul complet și setările self-service (FR-015) |

Rute eliminate: `GET /auth/confirm` ca route handler (înlocuit de pagină).

## Server Actions — public

### `requestEventCreation(formData)`

Câmpuri: `email`, `name`, `eventDate` (`AAAA-LL-ZZ`), `termsVersion`, `privacyVersion`,
`accepted` (`on`), `cf-turnstile-response`, `website` (honeypot, trebuie gol).

Pași (aceeași cale pentru orice adresă):
1. validare zod (FR-002); erorile de câmp se întorc ca `fieldErrors`;
2. verificare Turnstile (`CAPTCHA_FAILED` → mesaj „Verificarea nu a reușit, încearcă din
   nou”; nu dezvăluie nimic despre adresă);
3. versiunile trimise = versiunile curente, altfel `TERMS_OUTDATED` (pagina se reîncarcă cu
   noile linkuri);
4. limitele de frecvență (R8); dacă sunt depășite sau honeypot-ul e completat, se trece direct
   la pasul 6, cu un id aleator neînregistrat;
5. `request_self_service_event` + job `auth_email`;
6. răspuns: `{ status: "sent", requestId }`, apoi redirecționare la `/auth/code?request=…`.

Pentru un organizator autentificat, formularul apelează `create_event_as_organizer` și duce
direct la `/events/[id]`.

### `requestLogin(formData)`

Câmpuri: `email`, `cf-turnstile-response`, `next?`. Aceeași structură ca mai sus, cu
`request_login` și `purpose = 'login'`. Răspuns identic pentru orice adresă (FR-011).

### `submitCode(formData)`

Câmpuri: `requestId`, `email`, `code` (`^\d{6}$`).
1. cererea există, e `pending`, neexpirată și are aceeași adresă; altfel `REQUEST_EXPIRED`
   (mesaj generic + „Cere un cod nou”);
2. `verifyOtp({ email, token: code, type: "email" })`; la eșec `register_failed_code` →
   `INVALID_CODE` sau, la a 5-a greșeală, `REQUEST_INVALIDATED` (FR-008);
3. `complete_auth_request(requestId)` → redirecționare: `/events/[id]` pentru creare,
   `next` sau `/events` pentru autentificare; administratorii merg la `/auth/mfa` (001).

### `confirmFromLink(formData)`

Câmpuri: `requestId`, `tokenHash`. `verifyOtp({ token_hash, type: "email" })`, apoi pașii 3 de
la `submitCode`. Eșec → mesaj clar + „Cere un email nou” (US1, scenariul 7).

### `resendCode(requestId)`

Recreează cererea cu aceeași adresă și același eveniment (dacă e încă `unconfirmed`), sub
aceleași limite de frecvență; răspuns neutru.

## Server Actions — organizator

| Acțiune | Funcție SQL | Erori |
| --- | --- | --- |
| `createEvent({ name, eventDate, termsVersion?, privacyVersion? })` | `create_event_as_organizer` | `AWAITING_LIMIT_REACHED`, `TERMS_OUTDATED` (dacă ultima versiune acceptată nu e cea curentă, FR-041) |
| `updateEvent({ eventId, name, eventDate })` | `organizer_update_event` | `FORBIDDEN`, `EVENT_SUSPENDED`, validări |
| `deleteEvent({ eventId, confirmName })` | `request_event_deletion` | `CONFIRMATION_MISMATCH` |
| `requestActivation({ eventId })` | `request_activation` + job `admin_activation_notice` | `ACTIVATION_REQUEST_TOO_SOON` |

## Server Actions — administrator (aal2 + `platform_admins`)

| Acțiune | Funcție SQL |
| --- | --- |
| `activateEvent({ eventId, reason })` | `activate_event(..., source => 'admin')` |
| `suspendEvent({ eventId, reason })` | `suspend_event` |
| `reactivateEvent({ eventId, reason })` | `reactivate_event` |
| `updatePendingEvent({ eventId, name, eventDate })` | `admin_update_pending_event` (formularul de editare din 001 arată doar numele și data pentru `awaiting_activation`) |
| `updatePackage({ priceMinor, maxFilesPerGuest, maxPhotoBytes, maxVideoBytes, retentionOptionId })` | update pe `packages` (RLS admin) |
| `updateSelfServiceSettings({ maxAwaitingEventsPerOrganizer })` | update pe `self_service_settings` |

`reason`: 1–500 caractere, obligatoriu (`REASON_REQUIRED`).

## Mesajele invitatului (`/e/[token]`)

| Stare | Mesaj (cheie i18n) | Formular de upload |
| --- | --- | --- |
| `awaiting_activation` | `guest.notActivated`: încărcarea nu e încă deschisă; revino mai târziu sau ia legătura cu organizatorul | ascuns |
| `suspended` | `guest.suspended`: evenimentul nu primește momentan fișiere (fără motiv) | ascuns; fișierele în curs primesc același mesaj |
| `unconfirmed`, `deleting`, inexistent | `guest.notFound` (001) | ascuns |

## Headere și CSP

- CSP (proxy, nonce): `script-src` și `frame-src` includ `https://challenges.cloudflare.com`.
- `/auth/confirm` și `/auth/code`: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.

## Variabile de mediu noi

| Variabilă | Unde | Notă |
| --- | --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | web (public) | local/CI: `1x00000000000000000000BB` |
| `TURNSTILE_SECRET_KEY` | web (server), Supabase Auth | local/CI: `1x0000000000000000000000000000000AA` |
| `RATE_LIMIT_IP_PER_HOUR` | web (server) | implicit 20 (FR-036); ridicat pe serverul e2e principal (toată suita rulează de pe `127.0.0.1`) |
| `TURNSTILE_OFFLINE` | web (server) | doar local/CI, doar cu secretul de test: `TurnstileField` nu încarcă scriptul extern și trimite tokenul de test; pornirea eșuează dacă e setat cu alt secret |
| `ADMIN_NOTIFY_EMAILS` | worker | destinatarii cererilor de activare (implicit: adresele din `platform_admins`) |

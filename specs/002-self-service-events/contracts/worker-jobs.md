# Contract: joburi worker și emailuri (002)

Completează [contractul din 001](../../001-event-qr-upload/contracts/worker-jobs.md). Joburile
vin prin aceeași coadă `media_jobs`, cu același format de mesaj
(`{ type, ...payload }`) și aceleași reguli de reîncercare.

## `auth_email`

```json
{ "type": "auth_email", "request_id": "uuid", "email": "ana@exemplu.ro", "purpose": "create" | "login" }
```

1. Cererea trebuie să existe și să fie `pending`, altfel jobul se încheie fără efect
   (a fost înlocuită sau folosită între timp).
2. `purpose = "login"` și adresa nu are utilizator Auth → încheiere fără email, fără utilizator
   creat (FR-011).
3. `purpose = "create"` și adresa nu are utilizator → `auth.admin.createUser({ email,
   email_confirm: false })`.
4. `auth.admin.generateLink({ type: "magiclink", email })` → `email_otp`, `hashed_token`.
5. Trimite emailul `confirmare` (create) sau `autentificare` (login).

Reîncercare: la eroare SMTP sau Auth, backoff-ul din 001. La reîncercare, se generează un
token nou (cel vechi e invalidat automat), deci emailul trimis e mereu cel valid. Loguri: doar
`request_id` și rezultatul, fără adresă, cod sau token.

## `auth_rotate`

```json
{ "type": "auth_rotate", "email": "ana@exemplu.ro" }
```

`generateLink` fără trimitere, pentru invalidarea codului după 5 încercări greșite (FR-008).
Dacă utilizatorul nu există, nu face nimic.

## `admin_activation_notice`

```json
{ "type": "admin_activation_notice", "event_id": "uuid" }
```

Email către administratori (`ADMIN_NOTIFY_EMAILS`, altfel adresele din `platform_admins`) cu
numele și data evenimentului, emailul organizatorului, momentul cererii și linkul
`{APP_URL}/admin/events/{event_id}` (FR-018a).

## `retention_notice` (extins)

Pragul nou `activation_7d`: emailul `stergere-neactivat` către organizator, cu data ștergerii,
prețul pachetului și linkul către eveniment (FR-019).

## `delete_organizer_user` (existent)

Folosit și pentru utilizatorii neconfirmați fără evenimente (R6) și pentru organizatorii
rămași fără evenimente după ștergerea automată a celor neactivate.

## Șabloane de email

Locație: `apps/worker/src/email/templates/`. Fiecare șablon e o funcție pură care întoarce
`{ subject, text, html }`. Textele nu se scriu în șabloane: vin din
`apps/worker/src/email/messages/ro.ts` (structură de localizare pregătită pentru engleză,
constituția VIII), cu interpolare de parametri. Au teste de conținut și de escapare HTML (numele
evenimentului e text introdus de utilizator).

| Șablon | Subiect | Conținut obligatoriu |
| --- | --- | --- |
| `confirmare` | „Confirmă evenimentul tău Memories — cod {cod}” | numele produsului, scopul, numele evenimentului, codul (mare, ușor de copiat), butonul-link, valabil 15 minute, o singură folosință, „ignoră dacă nu tu ai cerut” (FR-013) |
| `autentificare` | „Codul tău de autentificare Memories: {cod}” | aceleași, fără numele evenimentului |
| `activare-solicitata` (admin) | „Cerere de activare: {nume eveniment}” | vezi `admin_activation_notice` |
| `stergere-neactivat` | „Evenimentul {nume} se șterge pe {dată}” | data, cum se activează, link |

Format: `multipart/alternative` (text + HTML simplu, fără imagini externe, fără trackere).
Expeditor: `SMTP_FROM` (existent).

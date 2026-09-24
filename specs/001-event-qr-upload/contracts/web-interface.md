# Contract: interfața web (rute, Server Actions, Route Handlers)

Toate mesajele pentru utilizator sunt chei din `messages/ro.ts`; mai jos apar codurile de
eroare stabile pe care testele le verifică. Toate intrările sunt validate cu `zod` pe server.
Server Actions întorc `{ ok: true, data } | { ok: false, error: ErrorCode, retryAfterSec? }`
— niciodată excepții brute către client.

## Rute (pagini)

| Rută | Acces | Scop | FR |
| --- | --- | --- | --- |
| `/e/[token]` | public | pagina de upload a invitatului | FR-011–FR-022, FR-036 |
| `/login` | public | cerere magic link (organizator și administrator) | FR-008 |
| `/auth/confirm` | public | schimbă tokenul din email pe sesiune, apoi redirecționează | FR-008 |
| `/auth/mfa` | admin `aal1` | înrolare / verificare TOTP | FR-006a |
| `/events` | organizator | lista evenimentelor proprii, cu data ștergerii / eticheta „expirat” | FR-009, FR-041, FR-044 |
| `/events/[eventId]` | organizator | galeria (Realtime, selecție, ștergere, descărcare) + secțiunea „Păstrarea fișierelor” (dată ștergere, opțiune, preț final, prelungire); pentru `expired`: doar datele evenimentului și mesajul că fișierele au fost șterse | FR-027–FR-034, FR-041 |
| `/admin/events` | admin `aal2` | listă + statistici agregate | FR-003, FR-007 |
| `/admin/events/new`, `/admin/events/[eventId]` | admin `aal2` | creare / editare / ștergere eveniment, QR, preț de bază, opțiune de retenție, istoric retenție | FR-001–FR-006b, FR-039–FR-043 |
| `/admin/retention` | admin `aal2` | catalogul de opțiuni de retenție | FR-038 |

`/e/[token]` afișează una dintre stările: `open`, `not_started` (cu data deschiderii),
`ended`, `not_found` (mesaj generic identic pentru token inexistent, eveniment șters sau
`deleting`).

## Server Actions — invitat (`/e/[token]`)

### `startGuestSession(token, displayName?)`
- Creează `guest_sessions`, setează cookie `mg_s` (httpOnly, Secure, SameSite=Lax,
  path `/e/{token}`, expiră la `upload_ends_at + 15 min`). Idempotent dacă cookie-ul există și
  e valid; actualizează `display_name`.
- Erori: `EVENT_NOT_FOUND`, `UPLOAD_NOT_STARTED`, `UPLOAD_ENDED`, `RATE_LIMITED`,
  `NAME_TOO_LONG`.

### `reserveUpload(token, file: { name, type, size })`
- Necesită cookie de sesiune. Apelează `reserve_upload`, apoi `createSignedUploadUrl` în
  `incoming`.
- Răspuns: `{ mediaId, bucket: "incoming", path, signedToken, tusEndpoint, remainingFiles }`.
- Erori: `EVENT_NOT_FOUND`, `UPLOAD_NOT_STARTED`, `UPLOAD_ENDED`, `FILE_LIMIT_REACHED`
  (cu `limit`), `FILE_TOO_LARGE` (cu `maxBytes`), `FILE_TYPE_NOT_ALLOWED`, `RATE_LIMITED`,
  `SESSION_MISSING`.

### `getMyUploads(token)`
- Pentru sesiunea curentă: `{ uploaded: [{ mediaId, name, status }], pending: [{ mediaId,
  name }], remainingFiles }` — fișierele rezervate dar nefinalizate, afișate după reîncărcarea
  paginii pentru reselectare (FR-016a). Nu întoarce niciodată fișiere ale altor sesiuni (FR-022).

### Upload TUS (client → Supabase Storage, fără server-ul aplicației)
- `tus-js-client`, endpoint `{SUPABASE_URL}/storage/v1/upload/resumable`, header
  `x-signature: {signedToken}`, `chunkSize = 6 MiB` (obligatoriu Supabase), metadata
  `bucketName`, `objectName = path`, `contentType`, `cacheControl = 3600`.
- `retryDelays = [0, 1000, 3000, 5000, 10000, 20000, 30000]`, reluare automată la evenimentul
  `online` (FR-016). Fără `urlStorage` persistent între reîncărcări (clarificarea Q5).

## Server Actions — autentificare

### `requestMagicLink(email, next?)`
- Răspuns **întotdeauna** `{ ok: true }` (nu dezvăluie dacă adresa există); intern
  `signInWithOtp({ shouldCreateUser: false })`. Eroare doar `RATE_LIMITED`.

### `verifyTotp(code)` / `enrollTotp()`
- Doar pentru administratori; ridică sesiunea la `aal2`. Erori: `INVALID_CODE`,
  `RATE_LIMITED`.

## Server Actions — organizator (`/events/[eventId]`)

| Acțiune | Intrare | Rezultat | Erori |
| --- | --- | --- | --- |
| `listMedia(eventId, cursor?)` | cursor = `(uploaded_at, id)` | 60 elemente/pagină, cu URL-uri semnate 15 min pentru miniaturi | `FORBIDDEN` |
| `getMediaUrls(mediaId)` | — | `{ viewUrl, downloadUrl }` semnate 15 min; download cu nume de fișier original curățat | `FORBIDDEN`, `NOT_READY` |
| `deleteMedia(eventId, mediaIds[])` | 1–500 id-uri | `{ deleted, failed }` | `FORBIDDEN` |
| `requestArchive(eventId)` | — | `{ archiveJobId, status }` (reutilizează jobul activ) | `FORBIDDEN`, `EMPTY_EVENT` |
| `getArchiveUrl(archiveJobId)` | — | `{ url, fileCount, skippedCount }`, URL semnat 15 min | `FORBIDDEN`, `NOT_READY`, `ARCHIVE_EXPIRED` (expirată la 24 h sau anulată de o ștergere de fișiere) |
| `getRetentionQuote(eventId)` | — | `{ current: { months, finalPriceMinor, purgeAt }, options: [{ optionId, months, finalPriceMinor, purgeAt, selectable }] }` | `FORBIDDEN` |
| `extendRetention(eventId, optionId, expectedFinalPriceMinor)` | valoarea afișată în dialogul de confirmare | `{ finalPriceMinor, purgeAt }` | `FORBIDDEN`, `RETENTION_NOT_LONGER`, `RETENTION_EXPIRED`, `PRICE_CHANGED` (clientul reîncarcă oferta și re-afișează confirmarea), `OPTION_INACTIVE` |

Toate acțiunile de galerie pe un eveniment `expiring`/`expired` întorc `EVENT_EXPIRED`.
Dialogul de prelungire (react-aria `Dialog`, rol `alertdialog`) afișează explicit prețul final
nou, diferența față de cel curent și noua dată de ștergere; butonul de confirmare repetă prețul.

Realtime: canal `event:{eventId}`, `postgres_changes` pe `public.media_items` și
`public.archive_jobs`, filtru `event_id=eq.{eventId}`; după fiecare `SUBSCRIBED` clientul
apelează `listMedia` cu `updatedSince` pentru resincronizare (FR-033).

## Server Actions — administrator (toate cer `aal2` + `platform_admins`)

| Acțiune | Intrare | Rezultat | Erori |
| --- | --- | --- | --- |
| `createEvent(input)` | nume, dată, email organizator, fereastră, limite (FR-001, FR-001a), `basePriceMinor`, `retentionOptionId` (FR-039) | `{ eventId, uploadUrl, finalPriceMinor, purgeAt }`; creează utilizatorul Auth al organizatorului dacă lipsește | `VALIDATION` (per câmp), `OPTION_INACTIVE` |
| `updateEvent(eventId, input)` | idem (opțiunea poate fi schimbată în orice sens, FR-042) | `{ eventId, finalPriceMinor, purgeAt }` | `VALIDATION`, `NOT_FOUND`, `RETENTION_DATE_IN_PAST`, `EVENT_NOT_ACTIVE`, `OPTION_INACTIVE` |
| `listRetentionChanges(eventId)` | — | `[{ at, actorKind, fromMonths, toMonths, fromFinalPriceMinor, toFinalPriceMinor, toPurgeAt }]` | `NOT_FOUND` |
| `listRetentionOptions()` | — | toate opțiunile, inclusiv inactive, cu numărul de evenimente care le folosesc | — |
| `upsertRetentionOption(input)` | `{ id?, months, surchargeMinor, active }` | `{ id }`; schimbarea prețului nu afectează evenimentele existente | `VALIDATION`, `DUPLICATE_MONTHS` |
| `deleteRetentionOption(id)` | — | `{ ok }` | `OPTION_IN_USE` |
| `deleteEvent(eventId, confirmName)` | numele tastat trebuie să fie identic | `{ status: "deleting" }` | `CONFIRMATION_MISMATCH`, `NOT_FOUND` |
| `listEvents()` | — | evenimente + `{ fileCount, totalBytes, status, finalPriceMinor, retentionMonths, purgeAt, anonymizedAt }` (fără media); evenimentele anonimizate au `name` și `organizerEmail` `null` și se afișează „Eveniment anonimizat” | — |

Formularul de eveniment calculează live prețul final și data ștergerii (aceeași formulă ca
`compute_purge_at`, în `packages/shared`, cu test care o compară cu rezultatul SQL); valoarea
salvată este întotdeauna cea din DB.

## Route Handlers

| Metodă și cale | Acces | Răspuns |
| --- | --- | --- |
| `GET /admin/events/[eventId]/qr.svg` | admin `aal2` | `image/svg+xml`, `Content-Disposition: attachment`, corecție de erori Q, zonă liniștită 4 module |
| `GET /admin/events/[eventId]/qr.png` | admin `aal2` | `image/png` 2400×2400 px (≥ 2000, FR-005), atașament |

Nicio rută nu primește conținut de fișiere media (principiul IV).

## Headere de securitate (toate răspunsurile)

CSP strictă cu nonce (`script-src 'self' 'nonce-…'`, `connect-src 'self' {SUPABASE_URL}
wss://{SUPABASE_HOST}`, `img-src 'self' blob: {SUPABASE_URL}`, `media-src {SUPABASE_URL}`,
`frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` pe `/e/*` (tokenul nu scapă prin Referer),
`Permissions-Policy: camera=(self)`.

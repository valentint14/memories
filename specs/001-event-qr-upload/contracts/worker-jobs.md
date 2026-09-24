# Contract: joburile worker-ului media

Coada: `pgmq` `media_jobs`. Worker-ul citește în bucle (`pgmq.read('media_jobs', vt, qty)`),
procesează idempotent (poate primi același mesaj de mai multe ori) și face `pgmq.archive` la
succes. Vizibilitate: 120 s pentru poze, 900 s pentru video și arhive (prelungită prin
`pgmq.set_vt` în timpul lucrului). După `read_ct > 5` → starea finală de eșec.

## Mesaje

```jsonc
{ "type": "process",        "media_id": "uuid" }
{ "type": "build_archive",  "archive_job_id": "uuid" }
{ "type": "delete_archive", "archive_job_id": "uuid" }
{ "type": "purge_media",    "media_ids": ["uuid"] }
{ "type": "purge_event",    "event_id": "uuid" }
{ "type": "expire_event",   "event_id": "uuid" }
{ "type": "delete_organizer_user", "user_id": "uuid" }
{ "type": "retention_notice", "event_id": "uuid", "threshold": "30d|7d|1d", "purge_at": "ISO-8601" }
```

## `process`

| Pas | Poză | Video |
| --- | --- | --- |
| 1. Preluare | `status = processing` (doar din `uploaded`, altfel ignoră) | idem |
| 2. Tip real | `file-type` pe primii 4 KB; nepermis/diferit de `kind` → `rejected` + ștergere | idem |
| 3. Dimensiune reală | `actual_bytes > max_photo_bytes` → `rejected` | `> max_video_bytes` → `rejected` |
| 4. Curățare metadate | ExifTool, copie curățată → `media/{event}/{media}/original.{ext}` | ExifTool (grupuri de locație) → `original.{ext}` |
| 5. Verificare | re-citire: 0 taguri GPS/locație, altfel `failed` | idem |
| 6. Variante | sharp: `display.webp` (2048 px), `thumb.webp` (400 px), rotație aplicată; HEIC prin libheif | ffmpeg: `poster.webp` (1 s), `playback.mp4` (H.264/AAC, ≤1080p, CRF 23, faststart) |
| 7. Finalizare | căi + `width/height` → `ready`; șterge obiectul din `incoming` | + `duration_ms` → `ready`; șterge din `incoming` |

Fișier corupt (decodare imposibilă la pasul 6) după curățare reușită: `ready` cu
`thumb_path = NULL` → galeria arată miniatura generică, originalul rămâne descărcabil (spec,
cazuri limită).

## `build_archive`

`archive_jobs.status = building` → pentru fiecare `media_items` `ready` al evenimentului (la
momentul începerii), în ordinea `uploaded_at`: S3 `GetObject(original)` → intrare `yazl`
(STORE, ZIP64) → S3 multipart `archives/{event}/{job}.zip` → `ready`, `file_count`,
`total_bytes`, `skipped_count` (rânduri `uploaded`/`processing`/`failed` la începere),
`completed_at`, `expires_at = +24 h`. Dacă între timp jobul a devenit `expired`
(o ștergere de fișiere), obiectul parțial se șterge și jobul se încheie.

## `purge_media` / `purge_event` / `delete_archive`

Service role, Storage API `remove()` pe loturi de 100 de căi; apoi șterge rândurile. Pentru
`purge_event`: listează și golește prefixele `{event_id}/` din `incoming`, `media`, `archives`,
apoi `DELETE FROM events` (cascadă) și, dacă emailul organizatorului a rămas fără evenimente,
`delete_organizer_user`. Idempotent: prefix gol = succes.

## `expire_event` (FR-044)

1. Ignoră dacă evenimentul nu e `expiring` (idempotent; `expired` = succes).
2. Golește prefixele `{event_id}/` din `incoming`, `media`, `archives` (aceeași rutină ca
   `purge_event`, loturi de 100, prefix gol = succes).
3. `complete_event_expiry(event_id)` → rândurile media/arhive/sesiuni șterse, token nou,
   `status = 'expired'`. Rândul evenimentului și `event_retention_changes` rămân.
4. Nu se trimite email la expirare (avertizările au fost trimise înainte).

## `delete_organizer_user` (FR-047, FR-006b)

1. Citește emailul utilizatorului din Auth (service role); dacă nu mai există → succes.
2. Re-verifică `orphan_organizer_user_id(email) = user_id` (între timp adminul poate fi creat un
   eveniment nou pentru aceeași adresă); altfel ignoră.
3. `auth.admin.deleteUser(user_id)`. Emailul nu apare în mesaj și nici în loguri.

Trimis de `anonymize_expired_events` și de `purge_event` (după `DELETE FROM events`, dacă
`orphan_organizer_user_id` întoarce un utilizator).

## `retention_notice` (FR-045)

1. Citește evenimentul; ignoră (arhivează mesajul) dacă `status ≠ 'active'`, dacă `purge_at`
   curent ≠ `purge_at` din mesaj (a fost prelungit) sau dacă `retention_notices.sent_at` e setat.
2. Compune emailul în română (șablon text + HTML, fără imagini externe): numele evenimentului,
   data ștergerii în `Europe/Bucharest`, linkul `{APP_URL}/events/{event_id}` (necesită
   autentificare; nu conține token), mențiunea despre descărcarea arhivei și prelungire.
3. `nodemailer` → SMTP Resend UE (`SMTP_HOST/PORT/USER/PASS` din env; în dezvoltare/CI →
   Mailpit-ul Supabase local).
4. După accept SMTP: `retention_notices.sent_at = now()`, apoi `pgmq.archive`. La `read_ct > 5`:
   `failed_at = now()`, eroare în Sentry fără adresa destinatarului.

## Loguri (pino, JSON)

Câmpuri: `job`, `media_id|archive_job_id|event_id`, `threshold`, `attempt`, `duration_ms`,
`result`, `error_code`. Interzis în loguri: nume de invitați, emailuri, tokenuri, nume de fișiere
originale.

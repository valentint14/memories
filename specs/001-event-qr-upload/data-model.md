# Data Model: Bucla de bază — eveniment, cod QR, upload invitați, galerie organizator

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Postgres (Supabase, `eu-central-1`). Toate tabelele din schema `public` au **RLS activ**, fără
excepție (constituția, principiul III). Tipurile TypeScript se generează din schemă
(`supabase gen types`). Timpurile sunt `timestamptz` (UTC); afișarea se face în
`Europe/Bucharest`.

## Diagramă relații

```text
platform_admins (user_id → auth.users)

retention_options 1 ──< events 1 ──< guest_sessions 1 ──< media_items
                           │                                   ▲
                           ├──────────────────────────────────┘ (event_id, denormalizat pentru RLS/Realtime)
                           ├──< archive_jobs
                           ├──< event_retention_changes   (istoric preț/retenție, păstrat după expirare)
                           └──< retention_notices         (avertizări email 30d / 7d / 1d)

rate_limit_counters (independent)
storage buckets: incoming · media · archives
```

## Enumerări

| Tip | Valori |
| --- | --- |
| `event_status` | `active`, `expiring`, `expired`, `deleting` |
| `retention_actor` | `admin`, `organizer`, `system` |
| `notice_threshold` | `30d`, `7d`, `1d` |
| `media_kind` | `photo`, `video` |
| `media_status` | `reserved`, `uploaded`, `processing`, `ready`, `failed`, `rejected`, `deleting` |
| `archive_status` | `pending`, `building`, `ready`, `failed`, `expired` |

## Entități

### `platform_admins`

| Câmp | Tip | Reguli |
| --- | --- | --- |
| `user_id` | uuid PK → `auth.users(id)` | populat doar prin migrație/seed, niciodată din aplicație |
| `created_at` | timestamptz | default `now()` |

RLS: niciun acces din client; citit doar de funcția `is_admin()` (`SECURITY DEFINER`), care
întoarce true doar dacă `auth.uid()` e în tabel **și** `auth.jwt()->>'aal' = 'aal2'` (FR-006a).

### `events`

| Câmp | Tip | Reguli / validare |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()`; intern, nu apare în URL-uri publice |
| `public_token` | text UNIQUE NOT NULL | 128 biți aleatori, base64url (22 caractere), generat în DB; FR-004 |
| `name` | text NULL | 1–120 caractere, trim; NULL doar după anonimizare (FR-047) |
| `event_date` | date NOT NULL | |
| `organizer_email` | citext NULL | email valid; un singur organizator (FR-010); index pentru RLS; NULL doar după anonimizare |
| `upload_starts_at` | timestamptz NOT NULL | |
| `upload_ends_at` | timestamptz NOT NULL | CHECK `upload_ends_at > upload_starts_at` |
| `max_files_per_guest` | int NOT NULL | CHECK 1–1000; default 50 |
| `max_photo_bytes` | bigint NOT NULL | CHECK 1 … 52 428 800 (50 MB); default 50 MB (FR-001a) |
| `max_video_bytes` | bigint NOT NULL | CHECK 1 … 1 073 741 824 (1 GB); default 1 GB (FR-001a) |
| `base_price_minor` | bigint NOT NULL | în bani (1 leu = 100); CHECK ≥ 0 (FR-039) |
| `retention_option_id` | uuid NOT NULL FK → retention_options ON DELETE RESTRICT | opțiunea curentă (FR-038, FR-039) |
| `retention_months` | int NOT NULL | snapshot al duratei la momentul alegerii; CHECK 1–60 |
| `retention_surcharge_minor` | bigint NOT NULL | snapshot al suplimentului; CHECK ≥ 0 |
| `final_price_minor` | bigint GENERATED ALWAYS AS (`base_price_minor + retention_surcharge_minor`) STORED | prețul final afișat organizatorului și adminului |
| `purge_at` | timestamptz NOT NULL | setat de trigger: `upload_ends_at + retention_months` luni, calculat în `Europe/Bucharest` (FR-040); la UPDATE trebuie să fie `> now()` |
| `expired_at` | timestamptz NULL | momentul finalizării ștergerii automate |
| `anonymized_at` | timestamptz NULL | setat de `anonymize_expired_events` la `expired_at + 3 ani` (FR-047); CHECK `anonymized_at IS NOT NULL OR (name IS NOT NULL AND organizer_email IS NOT NULL)`; CHECK `anonymized_at IS NULL OR status = 'expired'` |
| `status` | event_status | default `active` |
| `created_at`, `updated_at` | timestamptz | trigger `updated_at` |

Derivat (nestocat): „fereastră deschisă” = `now() BETWEEN upload_starts_at AND upload_ends_at`;
„grație” = `now() <= upload_ends_at + interval '15 minutes'` doar pentru rezervări deja create
(FR-021).

Tranziții de stare:

```text
active ──(pg_cron: purge_at <= now())──> expiring ──(worker: Storage golit, media/sesiuni/arhive șterse)──> expired
expired ──(pg_cron zilnic: expired_at < now() - 3 ani)──> expired + anonymized_at (nume, email → NULL)
active | expiring | expired ──(admin: request_event_deletion)──> deleting ──(worker)──> rând șters
```

În `expired` rămân doar: `name`, `event_date`, `organizer_email`, prețurile, retenția, datele
și istoricul; `public_token` e înlocuit cu o valoare aleatoare nouă (linkul vechi → `not_found`).
După 3 ani (FR-047) `name` și `organizer_email` devin NULL, iar autorii din istoric se elimină;
rândul rămâne doar ca evidență anonimă (preț, date, durată).
Modificarea de către admin a `upload_ends_at` sau a opțiunii recalculează `purge_at`; e permisă
doar în starea `active`.

RLS:
- administrator (`is_admin()`): SELECT/INSERT/UPDATE pe toate câmpurile; DELETE interzis direct
  (ștergerea trece prin `request_event_deletion`).
- organizator: SELECT unde `organizer_email = auth.jwt()->>'email'` și `status IN ('active',
  'expiring', 'expired')`, **fără** `public_token` (expus printr-un view `organizer_events` fără
  coloana token); niciun UPDATE (prelungirea trece prin `extend_retention`).
- anon/invitați: niciun acces (paginile invitaților folosesc funcții `SECURITY DEFINER`
  apelate de server).

### `guest_sessions`

| Câmp | Tip | Reguli |
| --- | --- | --- |
| `id` | uuid PK | aleator; valoarea cookie-ului de sesiune (httpOnly) |
| `event_id` | uuid FK → events ON DELETE CASCADE | |
| `display_name` | text NULL | 0–50 caractere, trim, diacritice și emoji permise; tratat ca text simplu |
| `files_reserved` | int NOT NULL default 0 | incrementat în `reserve_upload`; limita FR-017 |
| `created_at`, `last_seen_at` | timestamptz | |

Numărătoarea include fișierele ulterior șterse de organizator (limita nu se reface) și exclude
rezervările `rejected` din cauza tipului/dimensiunii reale.

RLS: niciun acces din client (doar funcții `SECURITY DEFINER` și service role).

### `media_items`

| Câmp | Tip | Reguli |
| --- | --- | --- |
| `id` | uuid PK | |
| `event_id` | uuid FK → events ON DELETE CASCADE | index `(event_id, created_at)` |
| `guest_session_id` | uuid FK → guest_sessions ON DELETE CASCADE | |
| `guest_name` | text NULL | copie a `display_name` la momentul uploadului (galeria nu depinde de sesiune) |
| `kind` | media_kind | din tipul MIME declarat, confirmat de worker |
| `declared_mime` | text | din lista permisă (FR-014) |
| `detected_mime` | text NULL | setat de worker din magic bytes |
| `original_filename` | text | 1–255, doar pentru afișare/nume în arhivă (sanitizat) |
| `declared_bytes` | bigint | ≤ limita evenimentului pentru `kind` |
| `actual_bytes` | bigint NULL | setat de trigger-ul de finalizare |
| `incoming_path` | text UNIQUE | `{event_id}/{media_id}` în bucket-ul `incoming` |
| `original_path` | text NULL | copie curățată în `media` |
| `display_path`, `thumb_path` | text NULL | variante WebP (poze) / poster (video) |
| `playback_path` | text NULL | MP4 H.264 (doar video, FR-026a) |
| `width`, `height`, `duration_ms` | int NULL | |
| `status` | media_status | vezi tranzițiile |
| `processing_error` | text NULL | cod de eroare, fără date personale |
| `created_at` | timestamptz | momentul rezervării |
| `uploaded_at` | timestamptz NULL | momentul finalizării uploadului → **ordonarea galeriei** |
| `updated_at` | timestamptz | cursor pentru resincronizarea Realtime (FR-033) |

RLS:
- organizator: SELECT pe rândurile din evenimentele sale **cu `events.status = 'active'`** și
  `status IN ('uploaded', 'processing', 'ready', 'failed')`; nicio scriere directă (ștergerea
  prin `delete_media`).
- administrator: **niciun** SELECT pe rânduri; statisticile vin din funcția
  `admin_event_stats(event_id)` → `{file_count, total_bytes}` (FR-007).
- invitați: niciun acces.

Tranziții de stare:

```text
reserved ──(storage upload complet, trigger)──> uploaded ──(worker preia)──> processing
processing ──(ok)──> ready
processing ──(tip real nepermis / dimensiune reală > limită)──> rejected  (obiect șters)
processing ──(eroare, read_ct > 5)──> failed
reserved ──(neîncărcat în 24 h, cron)──> șters
uploaded|processing|ready|failed ──(delete_media)──> deleting ──(Storage remove ok)──> rând șters
```

### `archive_jobs`

| Câmp | Tip | Reguli |
| --- | --- | --- |
| `id` | uuid PK | |
| `event_id` | uuid FK → events ON DELETE CASCADE | max 1 job `pending|building` per eveniment (index parțial unic) |
| `requested_by` | uuid → auth.users | |
| `status` | archive_status | |
| `archive_path` | text NULL | `archives/{event_id}/{job_id}.zip` |
| `file_count`, `total_bytes` | int / bigint NULL | |
| `skipped_count` | int NULL | fișiere neincluse (`uploaded`, `processing`, `failed`) la începerea jobului; afișat lângă link (FR-030) |
| `created_at`, `completed_at`, `expires_at` | timestamptz | `expires_at = completed_at + 24 h` |

RLS: organizatorul evenimentului SELECT și INSERT (prin `request_archive`); invalidat
(`expired` + obiect șters) la orice `delete_media` pe eveniment și la expirare.

### `retention_options`

| Câmp | Tip | Reguli |
| --- | --- | --- |
| `id` | uuid PK | |
| `months` | int NOT NULL UNIQUE | CHECK 1–60 |
| `surcharge_minor` | bigint NOT NULL | în bani; CHECK ≥ 0 |
| `active` | boolean NOT NULL default true | opțiunile inactive nu pot fi alese; cele folosite nu pot fi șterse (FK `RESTRICT`) |
| `created_at`, `updated_at` | timestamptz | |

Seed: 3 luni / 0 lei (opțiunea implicită în formularul de creare), 6 luni / 4 900 bani
(49 lei), 12 luni / 9 900 bani (99 lei). Fără opțiune de 1 lună.

RLS: administrator (`is_admin()`) SELECT/INSERT/UPDATE; DELETE doar dacă nu e referită.
Organizator: SELECT pe opțiunile active (pentru alegerea prelungirii). Anon: niciun acces.

### `event_retention_changes`

| Câmp | Tip | Reguli |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `event_id` | uuid FK → events ON DELETE CASCADE | index `(event_id, created_at)` |
| `actor_kind` | retention_actor | `system` doar pentru valoarea inițială scrisă la creare de trigger |
| `actor_user_id` | uuid NULL → auth.users ON DELETE SET NULL | |
| `from_months`, `to_months` | int NULL / int | `from_*` NULL la creare |
| `from_final_price_minor`, `to_final_price_minor` | bigint NULL / bigint | |
| `to_purge_at` | timestamptz | |
| `created_at` | timestamptz default `now()` | |

Scris doar de trigger-ul `AFTER INSERT OR UPDATE OF base_price_minor, retention_option_id,
retention_surcharge_minor, upload_ends_at ON events` (FR-043); append-only (niciun UPDATE/DELETE
pentru niciun rol). RLS: administrator SELECT; organizator niciun acces.

### `retention_notices`

| Câmp | Tip | Reguli |
| --- | --- | --- |
| `event_id` | uuid FK → events ON DELETE CASCADE | |
| `threshold` | notice_threshold | |
| `purge_at` | timestamptz | valoarea `events.purge_at` pentru care s-a emis avertizarea |
| `enqueued_at` | timestamptz default `now()` | |
| `sent_at`, `failed_at` | timestamptz NULL | setate de worker |
| PK | (`event_id`, `threshold`, `purge_at`) | garantează o singură avertizare per prag și dată (FR-045, SC-015) |

RLS: niciun acces din client (doar pg_cron și worker).

### `rate_limit_counters`

| Câmp | Tip | Reguli |
| --- | --- | --- |
| `bucket_key` | text | ex. `guest_session:event:{id}`, `reserve:session:{id}`, `ip:{hash}` |
| `window_start` | timestamptz | fereastră fixă de 1 min |
| `count` | int | |
| PK | (`bucket_key`, `window_start`) | curățat de pg_cron după 1 h |

RLS: niciun acces din client.

## Storage

| Bucket | Public | Limită dimensiune | MIME permise | Cine scrie | Cine citește |
| --- | --- | --- | --- | --- | --- |
| `incoming` | nu | 1 GB | `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `video/mp4`, `video/quicktime` | doar prin token de upload semnat (rezervare) | doar worker (service role) |
| `media` | nu | 1 GB | idem + `image/webp` (variante) | doar worker | organizatorul evenimentului, prin URL semnat 15 min |
| `archives` | nu | fără limită per bucket (ZIP64) | `application/zip` | doar worker | organizatorul evenimentului, prin URL semnat 15 min |

Politici pe `storage.objects`: SELECT/DELETE pentru organizator doar când primul segment al
căii (`event_id`) aparține unui eveniment al său **cu `status = 'active'`** (după trecerea în
`expiring`, organizatorul nu mai poate emite URL-uri semnate nici direct prin Storage API —
FR-044); niciun INSERT/UPDATE pentru utilizatori; administratorul nu are politici de citire pe
niciun bucket.

## Funcții SQL (contract de bază de date)

Detaliate în [contracts/database-functions.md](./contracts/database-functions.md):
`resolve_event_for_guest`, `start_guest_session`, `reserve_upload`, `on_incoming_object_created`
(trigger), `delete_media`, `request_archive`, `request_event_deletion`, `admin_event_stats`,
`is_admin`, `check_rate_limit`, `compute_purge_at` (trigger), `log_retention_change` (trigger),
`extend_retention`, `expire_due_events`, `enqueue_retention_notices`, `complete_event_expiry`,
`anonymize_expired_events`, `orphan_organizer_user_id`.

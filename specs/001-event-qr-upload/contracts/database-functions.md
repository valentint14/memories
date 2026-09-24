# Contract: funcții și politici în baza de date

Toate funcțiile `SECURITY DEFINER` setează `search_path = ''` și folosesc nume complet
calificate. Funcțiile apelate de server pentru invitați sunt executabile **doar** de rolul
`service_role` (`REVOKE EXECUTE … FROM public, anon, authenticated`).

| Funcție | Apelant | Semnătură | Comportament |
| --- | --- | --- | --- |
| `is_admin()` | politici RLS | `→ boolean` | `auth.uid()` în `platform_admins` **și** `aal = 'aal2'` |
| `resolve_event_for_guest(token)` | server (service role) | `text → (event_id, name, state, upload_starts_at)` | `state ∈ open, not_started, ended, not_found`; `deleting`, `expiring`, `expired` → `not_found` |
| `start_guest_session(token, display_name, ip_hash)` | server | `→ uuid` | verifică fereastra + rate limits; creează sesiunea |
| `reserve_upload(session_id, token, name, mime, bytes)` | server | `→ (media_id, path, remaining)` | tranzacție cu `FOR UPDATE` pe sesiune; verifică fereastra, MIME-ul permis, `bytes ≤ max_{kind}_bytes`, `files_reserved < max_files_per_guest`, rate limit; inserează `media_items(reserved)`; ridică excepții cu coduri stabile (`UPLOAD_ENDED`, `FILE_LIMIT_REACHED`, …) |
| `guest_uploads(session_id)` | server | `→ setof (media_id, name, status)` | doar rândurile sesiunii |
| `on_incoming_object_created()` | trigger `AFTER INSERT ON storage.objects` | — | doar `bucket_id = 'incoming'`: găsește `media_items` după cale; dacă evenimentul e în fereastră + 15 min grație → `uploaded`, `actual_bytes`, `uploaded_at`, `pgmq.send('media_jobs', {type:'process', media_id})`; altfel `rejected` + job de ștergere |
| `delete_media(event_id, media_ids[])` | organizator (authenticated) | `→ setof (media_id, paths[])` | verifică proprietatea; marchează `deleting`; expiră arhivele evenimentului; întoarce căile de șters prin Storage API |
| `finalize_media_deletion(media_ids[])` | organizator | `→ int` | șterge rândurile `deleting` ale căror obiecte au fost eliminate |
| `request_archive(event_id)` | organizator | `→ archive_job_id` | reutilizează jobul `pending/building`; altfel creează + `pgmq.send({type:'build_archive'})` |
| `request_event_deletion(event_id, confirm_name)` | admin | `→ void` | `is_admin()`; numele trebuie să coincidă; `status = 'deleting'`; `pgmq.send({type:'purge_event'})` |
| `admin_event_stats(event_id?)` | admin | `→ setof (event_id, file_count, total_bytes)` | doar agregate, niciodată căi sau nume (FR-007) |
| `check_rate_limit(key, limit, window)` | intern | `→ boolean` | fereastră fixă în `rate_limit_counters` |
| `compute_purge_at()` | trigger `BEFORE INSERT OR UPDATE ON events` | — | la schimbarea `retention_option_id`: copiază `months`/`surcharge_minor` din catalog (opțiunea trebuie să fie activă); `purge_at = upload_ends_at + make_interval(months => retention_months)` cu `SET timezone = 'Europe/Bucharest'`; la UPDATE: doar în `active` și `purge_at > now()`, altfel `RETENTION_DATE_IN_PAST` / `EVENT_NOT_ACTIVE` |
| `log_retention_change()` | trigger `AFTER INSERT OR UPDATE ON events` | — | scrie în `event_retention_changes` când se schimbă opțiunea, prețul de bază sau `purge_at`; `actor_kind` din `is_admin()` / setarea de tranzacție `app.retention_actor` (setată de `extend_retention`) |
| `extend_retention(event_id, option_id, expected_final_price_minor)` | organizator (authenticated) | `→ (final_price_minor, purge_at)` | `FOR UPDATE` pe eveniment; proprietate prin email JWT; `status = 'active'` și `now() < purge_at` altfel `RETENTION_EXPIRED`; opțiune activă cu `months > retention_months` altfel `RETENTION_NOT_LONGER`; prețul rezultat ≠ `expected` → `PRICE_CHANGED`; actualizează opțiunea (trigger-ele recalculează și scriu istoricul) (FR-041, FR-042) |
| `retention_quote(event_id)` | organizator, admin | `→ setof (option_id, months, surcharge_minor, final_price_minor, purge_at, selectable)` | pentru ecranul de alegere: prețul și data rezultate pentru fiecare opțiune activă; `selectable = months > retention_months` pentru organizator |
| `expire_due_events(p_now default now())` | pg_cron | `→ int` | `FOR UPDATE SKIP LOCKED` pe `active` cu `purge_at <= p_now` → `expiring`, arhivele → `expired`, `pgmq.send({type:'expire_event'})` (FR-044) |
| `enqueue_retention_notices(p_now default now())` | pg_cron | `→ int` | vezi [research.md R17](../research.md#r17-retenție-configurabilă-și-preț): prag aplicabil, `INSERT … ON CONFLICT DO NOTHING` în `retention_notices`, job `retention_notice` doar pentru rândurile noi (FR-045) |
| `orphan_organizer_user_id(email)` | intern, worker | `citext → uuid NULL` | utilizatorul Auth cu acel email dacă nu mai e referit de niciun eveniment și nu e în `platform_admins` |
| `anonymize_expired_events(p_now default now())` | pg_cron | `→ int` | `expired` cu `expired_at < p_now - interval '3 years'` și `anonymized_at IS NULL`: `name`, `organizer_email` → NULL, `anonymized_at = p_now`, `event_retention_changes.actor_user_id` → NULL; pentru fiecare email eliberat, `orphan_organizer_user_id` → `pgmq.send({type:'delete_organizer_user', user_id})` (FR-047) |
| `complete_event_expiry(event_id)` | worker (service role) | `→ void` | după golirea Storage: șterge `media_items`, `archive_jobs`, `guest_sessions`, `retention_notices`; `public_token` nou aleator; `status = 'expired'`, `expired_at = now()` |

## Joburi pg_cron

| Job | Frecvență | Efect |
| --- | --- | --- |
| `expire_archives` | la 15 min | `ready` cu `expires_at < now()` → job `delete_archive` |
| `cleanup_reservations` | orar | `reserved` mai vechi de 24 h → șterse (+ obiect parțial, dacă există) |
| `cleanup_rate_limits` | orar | ferestre mai vechi de 1 h |
| `reconcile_deletions` | la 10 min | rânduri `deleting` mai vechi de 5 min → job `purge_media` |
| `expire_due_events` | orar (min. 5) | evenimente cu `purge_at` depășit → `expiring` + job `expire_event`; reîncearcă și evenimentele `expiring` mai vechi de 1 h (job pierdut) |
| `enqueue_retention_notices` | orar (min. 20) | avertizările de 30 de zile / 7 zile / 1 zi |
| `anonymize_expired_events` | zilnic, 03:30 | anonimizarea evenimentelor expirate de peste 3 ani (FR-047) |

## Matrice RLS (testată în `supabase/tests/rls`)

| Resursă | anon | invitat (fără JWT) | organizator A | organizator B | admin aal1 | admin aal2 |
| --- | --- | --- | --- | --- | --- | --- |
| `events` (evenimentul lui A) | ✗ | ✗ | R (fără token) | ✗ | ✗ | R/W |
| `media_items` (ale lui A) | ✗ | ✗ | R | ✗ | ✗ | ✗ (doar agregate) |
| `storage media/{A}` (eveniment `active`) | ✗ | ✗ | R, D | ✗ | ✗ | ✗ |
| `storage media/{A}` și `media_items` (eveniment `expiring`) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `storage incoming/*` | ✗ | doar upload cu token semnat pe calea rezervată | ✗ | ✗ | ✗ | ✗ |
| `archive_jobs` (ale lui A) | ✗ | ✗ | R, creare prin funcție | ✗ | ✗ | ✗ |
| `events.retention_*`, `base_price_minor` (ale lui A) | ✗ | ✗ | R; W doar prin `extend_retention` (doar prelungire) | ✗ | ✗ | R/W |
| `retention_options` | ✗ | ✗ | R (active) | R (active) | ✗ | R/W |
| `event_retention_changes` (ale lui A) | ✗ | ✗ | ✗ | ✗ | ✗ | R |
| `guest_sessions`, `platform_admins`, `rate_limit_counters`, `retention_notices` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

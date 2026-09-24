---

description: "Task list — Bucla de bază: eveniment, cod QR, upload invitați, galerie organizator"
---

# Tasks: Bucla de bază — eveniment, cod QR, upload invitați, galerie organizator

**Input**: Design documents from `/specs/001-event-qr-upload/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUSE. Constituția (principiul VI) cere ca testele pentru fluxurile critice
(upload, afișare live, ștergere, descărcare) să fie scrise **înaintea** implementării și să
eșueze înainte ca implementarea să le facă să treacă. Aceeași regulă se aplică aici tuturor
poveștilor, iar matricea RLS (principiul III) se testează explicit.

**Organization**: sarcinile sunt grupate pe povești de utilizator, în ordinea priorităților
(P1: US1, US2, US3 → P2: US4, US5, US6, US8 → P3: US7).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se poate executa în paralel (fișiere diferite, fără dependențe nefinalizate)
- **[Story]**: povestea de utilizator (US1…US8)
- Fiecare descriere conține calea exactă a fișierului

## Path Conventions

Monorepo pnpm (vezi [plan.md › Project Structure](./plan.md#project-structure)):
`apps/web/` (Next.js 16, Vercel `fra1`), `apps/worker/` (Node 24, Docker), `packages/shared/`,
`supabase/` (migrații, seed, teste DB), `fixtures/media/`. Migrațiile folosesc prefixul de
timestamp cerut de Supabase CLI (`supabase/migrations/2026092500NNNN_<nume>.sql`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inițializarea monorepo-ului, a uneltelor și a CI-ului

- [X] T001 Creează workspace-ul pnpm: `package.json` (root, `"packageManager": "pnpm@12.6.0"`, `"engines": { "node": "24.x" }`, scripturi `lint`, `typecheck`, `test:unit`, `test:db`, `test:e2e`, `db:reset`, `db:types`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc` (`24`) și `.npmrc` (`save-exact=true`) — versiuni exacte, fără `^`/`~` (research.md R1)
- [X] T002 Creează `tsconfig.base.json` cu `strict: true`, `noUncheckedIndexedAccess: true`; instalează `typescript@6.0.3` și aliasul `typescript-7` = `npm:typescript@7.0.2`; scriptul `typecheck` din `package.json` apelează explicit binarul din `node_modules/typescript-7` (research.md R2)
- [X] T003 [P] Configurează `eslint.config.mjs` (eslint 10.11.0, typescript-eslint 8.70.1, lint type-aware pe TypeScript 6.0): `@typescript-eslint/no-explicit-any: error`, regulă `no-restricted-imports` care interzice importul `apps/web/lib/supabase/admin` din fișiere cu `"use client"`
- [X] T004 [P] Inițializează `apps/web/` cu Next.js 16.3.6 (App Router), React 19.3.0, Tailwind CSS 4.3.3, react-aria-components 1.21.1, @supabase/supabase-js 2.117.1, @supabase/ssr 0.12.7, tus-js-client 4.3.1, zod 4.6.5, qrcode 1.5.4, `server-only`; `apps/web/tsconfig.json` extinde baza; `apps/web/vercel.json` cu `"regions": ["fra1"]`
- [X] T005 [P] Inițializează `apps/worker/` (`package.json`, `tsconfig.json`) cu sharp 0.35.4, exiftool-vendored 38.1.2, file-type 22.1.1, yazl 3.3.1, @aws-sdk/client-s3 + @aws-sdk/lib-storage 3.1139.0, pino 10.3.1, nodemailer 10.0.10 (+ @types/nodemailer 8.0.2), @sentry/node 11.0.0, @supabase/supabase-js 2.117.1, pg (client Postgres pentru pgmq)
- [X] T006 [P] Inițializează `packages/shared/` (`package.json`, `tsconfig.json`, `src/index.ts`) ca pachet workspace consumat de `apps/web` și `apps/worker`
- [X] T007 [P] Scrie `apps/worker/Dockerfile` pe Debian 13 „trixie”: `ffmpeg`, `perl`, `libheif-examples` + `libheif-plugin-libde265` (HEIC decodat cu `heif-dec`; `sharp` precompilat — R5 revizuit: sharp 0.35.4 cere libvips ≥ 8.18.6, Debian are 8.16.1); scripturi `docker:build`, `docker:run`, `docker:smoke` în `apps/worker/package.json` (research.md R5)
- [X] T008 Inițializează Supabase local: `supabase` CLI 2.117.0 ca devDependency root și `supabase/config.toml` (Auth: `mailer_otp_exp = 3600`, `enable_signup = false`, MFA TOTP activ; SMTP personalizat Resend `eu-west-1` din variabile de mediu pentru producție, Mailpit local; Realtime activ); documentează în `supabase/README.md` că PITR rămâne dezactivat în proiectul de producție și că backup-urile zilnice se păstrează 7 zile (research.md R11)
- [X] T009 [P] Configurează Vitest 5.0.1: `vitest.workspace.ts` (root) cu proiectele `apps/web` (unit), `apps/worker`, `packages/shared` și `supabase/tests` (DB, rulat de `test:db` pe Supabase local)
- [X] T010 [P] Configurează Playwright 1.63.0 în `apps/web/playwright.config.ts` cu proiectele `desktop-chromium`, `mobile-chrome` (Pixel 7), `mobile-safari` (iPhone 15, WebKit); adaugă `@axe-core/playwright` și `otpauth` 9.5.2 ca devDependencies; helper `apps/web/tests/e2e/support/mailpit.ts` care citește ultimul email pentru o adresă din `http://localhost:54324`
- [X] T011 [P] Adaugă fișierele de test în `fixtures/media/`: `iphone.heic` (cu GPS), `android.jpg` (cu GPS), `iphone-hevc.mov` (cu locație), `clip.mp4`, `big-50mb.jpg` (> 50 MB), `fake.jpg` (text redenumit), `corrupt.jpg` (antet JPEG valid, date trunchiate), plus `fixtures/media/README.md` cu proveniența și tagurile de locație așteptate
- [X] T012 [P] Creează `apps/web/.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `IP_HASH_SECRET`, `SENTRY_DSN`) și `apps/worker/.env.example` (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`, `SENTRY_DSN`)
- [X] T013 [P] Scrie `.github/workflows/ci.yml`: `pnpm install --frozen-lockfile` → `lint` → `typecheck` → `test:unit` → `test:db` (Supabase local) → `test:e2e` (cu worker-ul pornit în Docker și web-ul rulat cu `next build && next start`, necesar testului de LCP) → build imagine worker + `docker:smoke`; toate joburile sunt verificări obligatorii pentru merge

**Checkpoint**: `pnpm lint` și `pnpm typecheck` rulează pe un monorepo gol; `pnpm supabase start` pornește local

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema, RLS, stocarea, autentificarea, i18n și bucla worker-ului — necesare tuturor poveștilor

**⚠️ CRITICAL**: nicio poveste nu începe înainte de finalizarea acestei faze

### Baza de date

- [X] T014 Migrația `supabase/migrations/20260925000100_extensions_enums.sql`: extensiile `citext`, `pgmq`, `pg_cron`; enumerările `event_status` (`active`, `expiring`, `expired`, `deleting`), `media_kind` (`photo`, `video`), `media_status` (`reserved`, `uploaded`, `processing`, `ready`, `failed`, `rejected`, `deleting`), `archive_status` (`pending`, `building`, `ready`, `failed`, `expired`), `retention_actor` (`admin`, `organizer`, `system`), `notice_threshold` (`30d`, `7d`, `1d`); coada `pgmq.create('media_jobs')`
- [X] T015 Migrația `supabase/migrations/20260925000200_platform_admins.sql`: tabel `platform_admins(user_id uuid PK → auth.users(id), created_at timestamptz default now())` cu RLS activ și nicio politică pentru client; funcția `is_admin()` `SECURITY DEFINER`, `search_path = ''`, care întoarce true doar dacă `auth.uid()` e în tabel **și** `auth.jwt()->>'aal' = 'aal2'` (FR-006a)
- [X] T016 Migrația `supabase/migrations/20260925000300_retention_options.sql`: tabel `retention_options` (`id` uuid PK; `months` int NOT NULL UNIQUE „CHECK 1–60”; `surcharge_minor` bigint NOT NULL „în bani; CHECK ≥ 0”; `active` boolean NOT NULL default true; `created_at`, `updated_at`); RLS: admin (`is_admin()`) SELECT/INSERT/UPDATE, DELETE; organizator (authenticated) SELECT doar `active = true`; anon niciun acces (data-model.md)
- [X] T017 Migrația `supabase/migrations/20260925000400_events.sql`: tabel `events` cu toate câmpurile din data-model.md — `public_token` text UNIQUE NOT NULL „128 biți aleatori, base64url (22 caractere), generat în DB” (default din `gen_random_bytes(16)`); `name` text NULL „1–120 caractere, trim; NULL doar după anonimizare”; `event_date` date; `organizer_email` citext NULL (index) „NULL doar după anonimizare”; `upload_starts_at`/`upload_ends_at` cu „CHECK `upload_ends_at > upload_starts_at`”; `max_files_per_guest` „CHECK 1–1000; default 50”; `max_photo_bytes` „CHECK 1 … 52 428 800 (50 MB); default 50 MB”; `max_video_bytes` „CHECK 1 … 1 073 741 824 (1 GB); default 1 GB”; `base_price_minor` bigint „CHECK ≥ 0”; `retention_option_id` uuid NOT NULL FK → `retention_options` ON DELETE RESTRICT; `retention_months` „CHECK 1–60”; `retention_surcharge_minor` „CHECK ≥ 0”; `final_price_minor` GENERATED ALWAYS AS (`base_price_minor + retention_surcharge_minor`) STORED; `purge_at` timestamptz NOT NULL; `expired_at` timestamptz NULL; `anonymized_at` timestamptz NULL cu „CHECK `anonymized_at IS NOT NULL OR (name IS NOT NULL AND organizer_email IS NOT NULL)`” și „CHECK `anonymized_at IS NULL OR status = 'expired'`”; `status` event_status default `active`; `created_at`, `updated_at` + trigger `updated_at`
- [X] T018 În aceeași migrație (`supabase/migrations/20260925000400_events.sql`) adaugă trigger-ul `compute_purge_at()` `BEFORE INSERT OR UPDATE ON events`: la schimbarea `retention_option_id` copiază `months`/`surcharge_minor` din catalog (opțiune activă, altfel `OPTION_INACTIVE`); `purge_at = upload_ends_at + make_interval(months => retention_months)` calculat cu `SET timezone = 'Europe/Bucharest'`; la UPDATE: doar în `active` (altfel `EVENT_NOT_ACTIVE`) și `purge_at > now()` (altfel `RETENTION_DATE_IN_PAST`) — contracts/database-functions.md
- [X] T019 În aceeași migrație adaugă RLS pe `events`: admin SELECT/INSERT/UPDATE (fără DELETE direct); organizator SELECT unde `organizer_email = auth.jwt()->>'email'` și `status IN ('active','expiring','expired')`; niciun UPDATE pentru organizator; view `organizer_events` (`security_invoker = true`) fără coloana `public_token`
- [X] T020 Migrația `supabase/migrations/20260925000500_event_retention_changes.sql`: tabel `event_retention_changes` (`id` bigint identity PK; `event_id` FK ON DELETE CASCADE, index `(event_id, created_at)`; `actor_kind` retention_actor; `actor_user_id` uuid NULL → auth.users ON DELETE SET NULL; `from_months`/`to_months`; `from_final_price_minor`/`to_final_price_minor`; `to_purge_at`; `created_at`); trigger `log_retention_change()` `AFTER INSERT OR UPDATE OF base_price_minor, retention_option_id, retention_surcharge_minor, upload_ends_at ON events` (actor din `is_admin()` sau din setarea de tranzacție `app.retention_actor`, `system` la creare); append-only: fără UPDATE/DELETE pentru niciun rol; RLS: doar admin SELECT (FR-043)
- [X] T021 Migrația `supabase/migrations/20260925000600_guests_media.sql`: `guest_sessions` (`id` uuid PK aleator; `event_id` FK ON DELETE CASCADE; `display_name` text NULL „0–50 caractere, trim”; `files_reserved` int NOT NULL default 0; `created_at`, `last_seen_at`) și `media_items` cu toate câmpurile din data-model.md (`original_filename` „1–255”, `incoming_path` UNIQUE `{event_id}/{media_id}`, index `(event_id, created_at)`, `uploaded_at`, `updated_at`); RLS: `guest_sessions` fără acces client; `media_items` SELECT pentru organizatorul evenimentului doar când `events.status = 'active'` și `status IN ('uploaded','processing','ready','failed')`, niciun acces pentru admin, anon sau invitați
- [X] T022 Migrația `supabase/migrations/20260925000700_archives_notices_ratelimit.sql`: `archive_jobs` (index parțial unic „max 1 job `pending|building` per eveniment”, `expires_at = completed_at + 24 h`; RLS SELECT pentru organizatorul evenimentului), `retention_notices` (PK `(event_id, threshold, purge_at)`, `enqueued_at`, `sent_at`, `failed_at`; fără acces client), `rate_limit_counters` (PK `(bucket_key, window_start)`; fără acces client) și funcția `check_rate_limit(key, limit, window)` cu fereastră fixă
- [X] T023 Migrația `supabase/migrations/20260925000800_storage.sql`: bucket-urile private `incoming` (limită 1 GB; MIME `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `video/mp4`, `video/quicktime`), `media` (1 GB; aceleași + `image/webp`), `archives` (fără limită, `application/zip`); politici pe `storage.objects`: SELECT/DELETE pentru organizator doar când primul segment al căii (`event_id`) aparține unui eveniment al său cu `status = 'active'`, în `media` și `archives` (FR-044); niciun INSERT/UPDATE pentru utilizatori; nicio politică de citire pentru admin
- [X] T024 Migrația `supabase/migrations/20260925000900_realtime.sql`: adaugă `media_items` și `archive_jobs` în publicația `supabase_realtime`, cu `REPLICA IDENTITY FULL` pentru evenimentele DELETE
- [X] T025 Scrie `supabase/seed.sql`: 1 administrator în `auth.users` (email confirmat) + `platform_admins`, **fără** factor TOTP — factorul se înrolează prin `/auth/mfa` la prima autentificare (inclusiv în e2e), fără inserări directe în `auth.mfa_factors`, 2 organizatori (`org-a@example.test`, `org-b@example.test`), catalogul de retenție: 3 luni / 0 bani, 6 luni / 4 900 bani, 12 luni / 9 900 bani (fără opțiune de 1 lună)
- [X] T026 [P] Scrie helper-ele pentru testele DB în `supabase/tests/support/clients.ts`: clienți Supabase pentru `anon`, organizator A, organizator B, admin `aal1`, admin `aal2` și service role, plus `resetDb()` și un factory de evenimente de test
- [X] T027 [P] Scrie `supabase/tests/rls/rls-enabled.test.ts`: interogare pe `pg_tables` care eșuează dacă vreun tabel din schema `public` nu are RLS activ (principiul III)
- [X] T028 [P] Scrie `supabase/tests/rls/events-catalog.test.ts`: rândurile din matricea RLS pentru `events`, `retention_options`, `event_retention_changes`, `platform_admins` (contracts/database-functions.md › Matrice RLS), inclusiv că organizatorul nu poate face UPDATE pe `events` și nu vede `public_token`
- [X] T029 [P] Scrie `supabase/tests/functions/purge-at.test.ts`: `purge_at` = sfârșitul uploadului + luni în `Europe/Bucharest` (inclusiv 31 ian + 1 lună și trecerea la ora de vară); recalcularea la schimbarea `upload_ends_at`; `RETENTION_DATE_IN_PAST`; `final_price_minor`; rândul de istoric `system` la creare

### Pachetul shared

- [X] T030 [P] Creează `packages/shared/src/limits.ts`: `MAX_PHOTO_BYTES = 52_428_800`, `MAX_VIDEO_BYTES = 1_073_741_824`, lista MIME permise (FR-014), `TUS_CHUNK_BYTES = 6 * 1024 * 1024`, `UPLOAD_GRACE_MINUTES = 15`, `DISPLAY_NAME_MAX = 50`, `DEFAULT_MAX_FILES_PER_GUEST = 50`
- [X] T031 [P] Creează `packages/shared/src/errors.ts`: uniunea `ErrorCode` cu toate codurile din contracts/web-interface.md (`EVENT_NOT_FOUND`, `UPLOAD_NOT_STARTED`, `UPLOAD_ENDED`, `FILE_LIMIT_REACHED`, `FILE_TOO_LARGE`, `FILE_TYPE_NOT_ALLOWED`, `RATE_LIMITED`, `SESSION_MISSING`, `NAME_TOO_LONG`, `FORBIDDEN`, `NOT_READY`, `ARCHIVE_EXPIRED`, `EMPTY_EVENT`, `VALIDATION`, `NOT_FOUND`, `CONFIRMATION_MISMATCH`, `INVALID_CODE`, `RETENTION_NOT_LONGER`, `RETENTION_EXPIRED`, `PRICE_CHANGED`, `OPTION_INACTIVE`, `OPTION_IN_USE`, `DUPLICATE_MONTHS`, `RETENTION_DATE_IN_PAST`, `EVENT_NOT_ACTIVE`, `EVENT_EXPIRED`) și maparea excepțiilor SQL cu cod stabil → `ErrorCode`
- [X] T032 [P] Creează `packages/shared/src/retention.ts`: `computePurgeAt(uploadEndsAt, months)` în `Europe/Bucharest` (aceeași regulă ca trigger-ul SQL) și `finalPrice(baseMinor, surchargeMinor)`; test în `packages/shared/src/retention.test.ts` cu aceleași cazuri ca `supabase/tests/functions/purge-at.test.ts`
- [X] T033 Generează `packages/shared/src/db.types.ts` cu `pnpm db:types` (`supabase gen types typescript --local`) și exportă-l din `packages/shared/src/index.ts`

### Aplicația web — bază

- [X] T034 [P] Creează clienții Supabase: `apps/web/lib/supabase/browser.ts` (cheie anon), `apps/web/lib/supabase/server.ts` (`@supabase/ssr`, cookies), `apps/web/lib/supabase/admin.ts` (service role, `import "server-only"`)
- [X] T035 Creează `apps/web/proxy.ts`: reîmprospătarea sesiunii Supabase, nonce CSP per cerere și headerele din contracts/web-interface.md (CSP cu `script-src 'self' 'nonce-…'`, `connect-src` spre Supabase și `wss://`, `img-src`/`media-src` spre Supabase și `blob:`, `frame-ancestors 'none'`; HSTS; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer` pe `/e/*`; `Permissions-Policy: camera=(self)`)
- [X] T036 [P] Creează localizarea `apps/web/lib/i18n/messages/ro.ts` (dicționar tipat, chei pentru toate `ErrorCode`) și `apps/web/lib/i18n/index.ts` cu `t()`, pluralizare `Intl.PluralRules('ro')` („1 fișier / 2 fișiere / 20 de fișiere”), `formatMoney(minor)` cu `Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' })` și `formatDateTime()` în `Europe/Bucharest`; test în `apps/web/tests/unit/i18n.test.ts`
- [X] T037 [P] Creează `apps/web/lib/actions/result.ts`: tipul `ActionResult<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; retryAfterSec?: number; fields?: Record<string, ErrorCode> }` și `runAction()` care validează intrarea cu zod și mapează excepțiile SQL cu `packages/shared/src/errors.ts` (nicio excepție brută către client)
- [X] T038 [P] Configurează Sentry în `apps/web/sentry.server.config.ts`, `apps/web/sentry.client.config.ts` și `apps/web/instrumentation.ts`: DSN în regiunea UE, `sendDefaultPii: false`, `beforeSend` care elimină emailuri, nume de invitați, tokenuri de eveniment și căi de fișiere (research.md R14)
- [X] T039 Creează `apps/web/app/layout.tsx` (`<html lang="ro">`, stiluri Tailwind de bază, nonce CSP transmis scripturilor) și `apps/web/app/globals.css`

### Autentificare (comună pentru admin și organizator)

- [X] T040 Implementează `requestMagicLink(email, next?)` în `apps/web/lib/actions/auth.ts`: `signInWithOtp({ shouldCreateUser: false })`, răspuns **întotdeauna** `{ ok: true }`, limită de 5/oră per adresă prin `check_rate_limit`, singura eroare `RATE_LIMITED` (FR-008, cazuri limită)
- [X] T041 Creează pagina `apps/web/app/login/page.tsx` (formular email, mesajul neutru „Dacă adresa are acces, vei primi un email”, link expirat → mesaj + cerere link nou) și handler-ul `apps/web/app/auth/confirm/route.ts` (`verifyOtp` cu `token_hash`, apoi redirecționare la `next` validat ca cale internă)
- [X] T042 Scrie `apps/web/tests/e2e/auth.spec.ts`: link de autentificare din Mailpit funcționează o singură dată, link folosit/expirat → mesaj clar; adresă fără eveniment → același mesaj ca o adresă validă

### Worker — bază

- [X] T043 Creează `apps/worker/src/db.ts` (pool `pg` pe `DATABASE_URL`), `apps/worker/src/log.ts` (pino JSON cu câmpurile `job`, `media_id|archive_job_id|event_id`, `threshold`, `attempt`, `duration_ms`, `result`, `error_code`; redactare pentru emailuri, nume, tokenuri, nume de fișiere) și `apps/worker/src/sentry.ts` (UE, `sendDefaultPii: false`)
- [X] T044 Creează `apps/worker/src/storage/client.ts`: client S3 (`@aws-sdk/client-s3`) pe endpoint-ul S3 al Supabase Storage și client Supabase cu service role pentru `storage.remove()`
- [X] T045 Creează `apps/worker/src/storage/purge-prefix.ts`: listează și șterge prin Storage API toate obiectele unui prefix `{event_id}/` din bucket-urile date, în loturi de 100, idempotent (prefix gol = succes) — folosit de `purge_event`, `expire_event`, `purge_media`
- [X] T046 Creează `apps/worker/src/main.ts`: buclă `pgmq.read('media_jobs', vt, qty)`, vizibilitate 120 s (poze) / 900 s (video, arhive) prelungită cu `pgmq.set_vt`, dispatch după `type` într-un registru de handler-e din `apps/worker/src/jobs/index.ts`, `pgmq.archive` la succes, hook de eșec final la `read_ct > 5`, oprire grațioasă la SIGTERM (contracts/worker-jobs.md)
- [X] T047 [P] Scrie `apps/worker/tests/purge-prefix.test.ts` pe Supabase local: prefix cu > 100 obiecte în trei bucket-uri → gol; a doua rulare → succes fără erori

**Checkpoint**: `pnpm db:reset` aplică migrațiile și seed-ul; `pnpm test:db` trece testele RLS de bază; autentificarea prin magic link funcționează local; worker-ul pornește și consumă o coadă goală

---

## Phase 3: User Story 1 — Administratorul creează un eveniment și obține codul QR (Priority: P1) 🎯 MVP

**Goal**: administratorul (magic link + TOTP) creează, editează și șterge evenimente cu preț de bază și opțiune de retenție și descarcă codul QR (PNG ≥ 2000 px și SVG)

**Independent Test**: administratorul creează un eveniment, descarcă PNG-ul și SVG-ul, iar scanarea codului deschide `/e/{token}` pentru acel eveniment (quickstart 1–3, 15, 17)

### Tests for User Story 1 (scrise înainte, trebuie să eșueze) ⚠️

- [X] T048 [P] [US1] Scrie `supabase/tests/functions/admin.test.ts`: `is_admin()` false la `aal1` și true la `aal2`; `admin_event_stats` întoarce doar `{event_id, file_count, total_bytes}`; adminul nu poate citi `media_items` și obiectele din `media`/`archives`; `request_event_deletion` refuză un nume greșit (`CONFIRMATION_MISMATCH`) și trece evenimentul în `deleting`; `orphan_organizer_user_id(email)` întoarce utilizatorul doar când emailul nu mai are niciun eveniment și nu e admin
- [X] T049 [P] [US1] Scrie `apps/web/tests/unit/event-schema.test.ts` pentru schema zod a evenimentului: email invalid, sfârșit ≤ început, limite nepozitive sau peste plafoane (50 MB / 1 GB), nume > 120 de caractere, preț negativ → erori per câmp
- [X] T050 [P] [US1] Scrie `apps/web/tests/e2e/admin.spec.ts`: login admin → înrolare TOTP la prima autentificare (testul citește secretul afișat ca text și generează codul cu `otpauth`) → cod TOTP la autentificările următoare; fără TOTP nicio pagină `/admin` accesibilă; creare eveniment cu preț de bază 299 lei și opțiunea de 3 luni → formularul arată prețul final și data ștergerii; lista arată prețul, retenția, data ștergerii și statisticile; `qr.png` are 2400×2400 px, iar `qr.svg` e valid și ambele codifică linkul de upload; tokenurile a două evenimente au 22 de caractere base64url și sunt diferite; ștergerea cu numele tastat → `/e/{token}` afișează „eveniment inexistent”

### Implementation for User Story 1

- [X] T051 [US1] Migrația `supabase/migrations/20260925001000_admin_functions.sql`: `admin_event_stats(event_id?)` (doar agregate, niciodată căi sau nume — FR-007) și `request_event_deletion(event_id, confirm_name)` (`is_admin()`, nume identic, `status = 'deleting'`, `pgmq.send('media_jobs', {type:'purge_event', event_id})`; permisă din `active`, `expiring` și `expired`) și `orphan_organizer_user_id(email)` (FR-047)
- [X] T052 [US1] Implementează `enrollTotp()` și `verifyTotp(code)` în `apps/web/lib/actions/auth.ts` (doar pentru utilizatori din `platform_admins`, ridică sesiunea la `aal2`, erori `INVALID_CODE`, `RATE_LIMITED`) și pagina `apps/web/app/auth/mfa/page.tsx` (înrolare: codul QR TOTP **și** secretul afișat ca text pentru introducere manuală, accesibil din tastatură; verificare: câmp pentru cod)
- [X] T053 [US1] Creează `apps/web/app/admin/layout.tsx`: redirecționează la `/login` fără sesiune, la `/auth/mfa` la `aal1` și întoarce 404 dacă utilizatorul nu e în `platform_admins`
- [X] T054 [P] [US1] Creează schema zod `apps/web/lib/validation/event.ts`: `name` 1–120 trim, `eventDate`, `organizerEmail` email, `uploadStartsAt < uploadEndsAt`, `maxFilesPerGuest` 1–1000 (default 50), `maxPhotoBytes` 1…52 428 800 (default 50 MB), `maxVideoBytes` 1…1 073 741 824 (default 1 GB), `basePriceMinor` ≥ 0 (introdus în lei, convertit în bani), `retentionOptionId` uuid (FR-001, FR-001a, FR-002, FR-039)
- [X] T055 [US1] Implementează în `apps/web/lib/actions/admin.ts`: `createEvent` (creează utilizatorul Auth al organizatorului cu `auth.admin.createUser({ email_confirm: true })` dacă lipsește; întoarce `{ eventId, uploadUrl, finalPriceMinor, purgeAt }`), `updateEvent` (erori `VALIDATION`, `NOT_FOUND`, `RETENTION_DATE_IN_PAST`, `EVENT_NOT_ACTIVE`, `OPTION_INACTIVE`), `deleteEvent(eventId, confirmName)`, `listEvents()` (+ `fileCount`, `totalBytes`, `status`, `finalPriceMinor`, `retentionMonths`, `purgeAt`), `listRetentionChanges(eventId)` — toate verifică `aal2` + `platform_admins`
- [X] T056 [P] [US1] Creează `apps/web/components/admin/EventForm.tsx` (react-aria `Form`/`TextField`/`NumberField`/`Select`): erori afișate lângă câmp, opțiunile de retenție active, previzualizare live a prețului final și a datei de ștergere cu `packages/shared/src/retention.ts`
- [X] T057 [US1] Creează paginile `apps/web/app/admin/events/page.tsx` (listă cu statistici agregate, stare, preț final, retenție, data ștergerii), `apps/web/app/admin/events/new/page.tsx` și `apps/web/app/admin/events/[eventId]/page.tsx` (editare, link de upload, butoane de descărcare QR, tabel cu istoricul retenției, fără acces la media)
- [X] T058 [P] [US1] Creează `apps/web/components/admin/DeleteEventDialog.tsx` (react-aria `AlertDialog`: avertizare ireversibilă, câmp în care se tastează numele, buton activ doar la potrivire exactă)
- [X] T059 [P] [US1] Creează Route Handlers-urile `apps/web/app/admin/events/[eventId]/qr.svg/route.ts` și `apps/web/app/admin/events/[eventId]/qr.png/route.ts` (`qrcode`, corecție de erori Q, zonă liniștită de 4 module, PNG 2400×2400, `Content-Disposition: attachment`, acces doar admin `aal2`) — FR-005
- [X] T060 [US1] Implementează jobul `apps/worker/src/jobs/purge-event.ts`: golește prefixele `{event_id}/` din `incoming`, `media`, `archives` cu `purge-prefix.ts`, apoi `DELETE FROM events` (cascadă); dacă `orphan_organizer_user_id` întoarce un utilizator, trimite `delete_organizer_user`; idempotent — FR-006b
- [X] T061 [US1] Implementează jobul `apps/worker/src/jobs/delete-organizer-user.ts` (contracts/worker-jobs.md): re-verifică `orphan_organizer_user_id`, apoi `auth.admin.deleteUser(user_id)`; utilizator inexistent = succes; emailul nu apare în loguri; test în `apps/worker/tests/delete-organizer-user.test.ts` (utilizator orfan șters, utilizator cu eveniment nou păstrat)
- [X] T062 [US1] Adaugă cheile de text pentru administrare în `apps/web/lib/i18n/messages/ro.ts` (formular, erori per câmp, dialog de ștergere, istoric retenție)

**Checkpoint**: US1 funcționează independent — quickstart 1, 2, 3, 15, 17 trec

---

## Phase 4: User Story 2 — Invitatul încarcă poze și video de pe telefon (Priority: P1)

**Goal**: invitatul scanează codul, încarcă mai multe poze/video (sau face o poză) fără cont, vede progresul și confirmarea; worker-ul curăță locația și produce variantele

**Independent Test**: pe un telefon, pentru un eveniment activ se încarcă 3 poze și 1 video; fișierele apar ca primite pentru acel eveniment (quickstart 4–6, 10, 11)

### Tests for User Story 2 (scrise înainte, trebuie să eșueze) ⚠️

- [X] T063 [P] [US2] Scrie `supabase/tests/functions/guest-upload.test.ts`: `resolve_event_for_guest` întoarce `open`/`not_started`/`ended`/`not_found` (și `not_found` pentru `deleting`, `expiring`, `expired`); `reserve_upload` verifică fereastra, MIME-ul, `bytes ≤ max_{kind}_bytes`, `files_reserved < max_files_per_guest`, rate limit, cu codurile stabile; trigger-ul `on_incoming_object_created` → `uploaded` + mesaj `process` în coadă în fereastră + 15 min grație, altfel `rejected`; `guest_uploads` întoarce doar rândurile sesiunii
- [X] T064 [P] [US2] Scrie `apps/worker/tests/process.test.ts` pe `fixtures/media/`: după procesare, `exiftool` nu găsește niciun tag de locație în `android.jpg`, `iphone.heic`, `iphone-hevc.mov`; HEIC → `display.webp` 2048 px + `thumb.webp` 400 px cu rotația aplicată; video → `poster.webp` + `playback.mp4` H.264/AAC ≤ 1080p cu `faststart`; `fake.jpg` → `rejected` și obiect șters; dimensiune reală peste limită → `rejected`; `corrupt.jpg` → `ready` cu `thumb_path = NULL`
- [X] T065 [P] [US2] Scrie `apps/web/tests/e2e/guest-upload.spec.ts` (proiectele mobile): pagina se deschide fără autentificare cu numele evenimentului și nota de informare; selecție multiplă 3 poze + 1 video → progres per fișier și confirmarea „4 fișiere încărcate”; nume de invitat opțional; al (N+1)-lea fișier refuzat cu limita afișată; `big-50mb.jpg` cu limita de 10 MB și tip nepermis → mesaje explicite, celelalte fișiere continuă; eveniment neînceput (cu data deschiderii), încheiat, token inexistent → mesaje în română; nicio cerere nu întoarce fișiere ale altor invitați
- [X] T066 [P] [US2] Scrie `apps/worker/scripts/smoke-heic.ts` (rulat de `docker:smoke`): eșuează dacă `sharp.format.heif.input.fileSuffix` nu include `.heic` sau dacă decodarea `fixtures/media/iphone.heic` eșuează
- [X] T067 [P] [US2] Scrie `apps/web/tests/e2e/lcp.spec.ts` (proiectul `mobile-chrome`, build de producție): throttling CDP „Slow 4G” (RTT 150 ms, 1,6 Mbps down, 750 kbps up) + `Emulation.setCPUThrottlingRate(4)`; LCP citit cu `PerformanceObserver('largest-contentful-paint')` pe `/e/[token]`, median din 3 rulări < 2 500 ms (principiul I, SC-002, research.md R16); rulează în `test:e2e`, deci blochează merge-ul

### Implementation for User Story 2

- [X] T068 [US2] Migrația `supabase/migrations/20260925001100_guest_functions.sql`: `resolve_event_for_guest(token)`, `start_guest_session(token, display_name, ip_hash)` (fereastra + rate limits: 20 sesiuni noi/min per eveniment, 5/min per hash IP), `reserve_upload(session_id, token, name, mime, bytes)` (tranzacție cu `FOR UPDATE` pe sesiune; 30 rezervări/min per sesiune, 600/min per eveniment; inserează `media_items(reserved)` cu calea `{event_id}/{media_id}`), `guest_uploads(session_id)`; toate `SECURITY DEFINER`, `search_path = ''`, `REVOKE EXECUTE … FROM public, anon, authenticated`, `GRANT` doar către `service_role`
- [X] T069 [US2] În migrația `supabase/migrations/20260925001100_guest_functions.sql` adaugă trigger-ul `on_incoming_object_created()` `AFTER INSERT ON storage.objects` (doar `bucket_id = 'incoming'`) și joburile pg_cron `cleanup_reservations` (orar: `reserved` > 24 h șterse + obiect parțial) și `cleanup_rate_limits` (orar: ferestre > 1 h)
- [X] T070 [P] [US2] Creează `apps/web/lib/security/ip-hash.ts`: HMAC-SHA-256 al IP-ului cu `IP_HASH_SECRET` + data zilei (IP-ul nu se stochează în clar)
- [X] T071 [US2] Implementează în `apps/web/lib/actions/guest.ts`: `startGuestSession(token, displayName?)` (cookie `mg_s` httpOnly, Secure, SameSite=Lax, path `/e/{token}`, expiră la `upload_ends_at + 15 min`; idempotent; `NAME_TOO_LONG` peste 50 de caractere), `reserveUpload(token, file)` (apelează `reserve_upload`, apoi `createSignedUploadUrl` în `incoming`; întoarce `{ mediaId, bucket, path, signedToken, tusEndpoint, remainingFiles }`), `getMyUploads(token)` — contracts/web-interface.md
- [X] T072 [US2] Creează `apps/web/app/e/[token]/page.tsx` (Server Component): stările `open`, `not_started` (cu data deschiderii), `ended`, `not_found` (mesaj generic identic); numele evenimentului; nota de informare privind datele personale, cu procesatorii din research.md R15, perioada de păstrare a evenimentului și termenul de 7 zile pentru dispariția din backup-uri (R11) (FR-012); fără alte scripturi decât `UploadClient`
- [X] T073 [US2] Creează `apps/web/lib/upload/queue.ts`: coadă de fișiere cu stările `pending`, `reserving`, `uploading`, `done`, `rejected`, `failed`; `tus-js-client` încărcat dinamic la prima selecție; endpoint `{SUPABASE_URL}/storage/v1/upload/resumable`, header `x-signature`, `chunkSize = 6 MiB`, metadata `bucketName`, `objectName`, `contentType`, `cacheControl = 3600`; validare locală de tip și dimensiune înainte de rezervare (serverul rămâne sursa de adevăr)
- [X] T074 [US2] Creează `apps/web/components/upload/UploadClient.tsx` (singurul Client Component al paginii): câmp de nume opțional (max 50), `<input type="file" multiple accept="image/*,video/*">`, buton separat cu `capture` pentru cameră, acțiunile principale în treimea de jos, ținte ≥ 44×44 px (FR-013, FR-036)
- [X] T075 [P] [US2] Creează `apps/web/components/upload/FileRow.tsx` (progres per fișier cu `role="progressbar"`, mesaj de eroare per fișier) și `apps/web/components/upload/UploadSummary.tsx` (număr de fișiere reușite și eșuate, pluralizat — FR-015)
- [X] T076 [P] [US2] Creează `apps/worker/src/media/detect.ts`: `file-type` pe primii 4 KB, confruntat cu lista permisă și cu `kind`
- [X] T077 [P] [US2] Creează `apps/worker/src/media/sanitize.ts`: `exiftool-vendored`; poze `-all= -tagsFromFile @ -Orientation -ICC_Profile`; video — eliminarea grupurilor de locație (`-GPS*=`, `-Keys:GPSCoordinates=`, `-UserData:GPSCoordinates=`, `-XMP:all=`, `-ItemList:all=`) fără remuxare; verificare prin re-citire: orice tag de locație rămas → eroare (research.md R6)
- [X] T078 [P] [US2] Creează `apps/worker/src/media/photo.ts`: sharp cu rotația aplicată → `display.webp` (2048 px, calitate 80) și `thumb.webp` (400 px); HEIC prin libheif; eroare de decodare → semnal „fără previzualizare”
- [X] T079 [P] [US2] Creează `apps/worker/src/media/video.ts`: `ffmpeg` prin `child_process.spawn` → `poster.webp` (cadrul de la 1 s) și `playback.mp4` (H.264 High, AAC, ≤ 1080p, CRF 23, `+faststart`, rotația aplicată); `ffprobe` pentru `width`, `height`, `duration_ms`
- [X] T080 [US2] Implementează jobul `apps/worker/src/jobs/process.ts` după pașii 1–7 din contracts/worker-jobs.md (preluare doar din `uploaded`, tip real, dimensiune reală, curățare în `media/{event}/{media}/original.{ext}`, verificare, variante, finalizare `ready` + ștergerea obiectului din `incoming`; eșec final la `read_ct > 5` → `failed` + `processing_error`)
- [X] T081 [US2] Adaugă cheile de text pentru pagina invitatului în `apps/web/lib/i18n/messages/ro.ts` (stări eveniment, erori de upload cu limita/dimensiunea, confirmare, nota de informare)

**Checkpoint**: US1 + US2 — un eveniment creat de admin primește fișiere de pe telefon, iar fișierele ajung `ready` fără locație

---

## Phase 5: User Story 3 — Organizatorul se autentifică și vede galeria (Priority: P1)

**Goal**: organizatorul vede doar evenimentele sale și o galerie cronologică, inclusiv HEIC și video redabile

**Independent Test**: două evenimente pentru organizatori diferiți; primul organizator vede doar evenimentul său și fișierele lui (quickstart 9 fără partea live, 10, 12)

### Tests for User Story 3 (scrise înainte, trebuie să eșueze) ⚠️

- [X] T082 [P] [US3] Scrie `supabase/tests/rls/media-storage.test.ts`: rândurile din matricea RLS pentru `media_items`, `storage media/{A}`, `storage incoming/*`, `archive_jobs`, `guest_sessions` pentru anon, organizator A/B, admin `aal1`/`aal2` (SC-012); plus: după trecerea evenimentului lui A în `expiring`, organizatorul A nu mai poate citi `media_items` și nici crea URL-uri semnate direct prin Storage API (FR-044)
- [X] T083 [P] [US3] Scrie `apps/web/tests/e2e/gallery.spec.ts`: organizatorul A se autentifică prin link din Mailpit și vede doar evenimentele sale; galeria ordonează miniaturile după `uploaded_at` cu numele invitatului; `iphone.heic` se afișează la dimensiune completă; video-ul se redă; URL-ul direct al evenimentului lui B → acces refuzat; fișier corupt → miniatură generică și original descărcabil

### Implementation for User Story 3

- [X] T084 [US3] Implementează în `apps/web/lib/actions/organizer.ts`: `listMedia(eventId, cursor?, updatedSince?)` (cursor `(uploaded_at, id)`, 60 elemente/pagină, URL-uri semnate de 15 min pentru miniaturi, `FORBIDDEN`) și `getMediaUrls(mediaId)` (`{ viewUrl, downloadUrl }` semnate de 15 min — `display.webp` pentru poze, `playback.mp4` pentru video; `NOT_READY`); acțiunile de galerie pe un eveniment `expiring`/`expired` întorc `EVENT_EXPIRED`
- [X] T085 [US3] Creează `apps/web/app/events/layout.tsx` (cere sesiune, altfel `/login?next=`) și `apps/web/app/events/page.tsx` (lista din view-ul `organizer_events`: nume, dată, număr de fișiere)
- [X] T086 [US3] Creează `apps/web/app/events/[eventId]/page.tsx`: verifică proprietatea (404 altfel), încarcă prima pagină din `listMedia` și redă `GalleryGrid`
- [X] T087 [P] [US3] Creează `apps/web/components/gallery/GalleryGrid.tsx` (react-aria `GridList` accesibilă din tastatură, încărcare incrementală, numele invitatului sub miniatură, badge „în procesare”, miniatură generică pentru `thumb_path = NULL` sau `failed`)
- [X] T088 [P] [US3] Creează `apps/web/components/gallery/MediaViewer.tsx` (react-aria `Modal`/`Dialog`: `<img>` la dimensiune completă sau `<video controls playsinline>` pe `playback.mp4`, navigare anterior/următor, URL-uri reînnoite la expirare)
- [X] T089 [US3] Adaugă cheile de text pentru galerie în `apps/web/lib/i18n/messages/ro.ts`

**Checkpoint**: MVP-ul P1 complet — admin → QR → invitat → galerie organizator

---

## Phase 6: User Story 4 — Organizatorul descarcă fișierele (Priority: P2)

**Goal**: descărcare individuală la calitatea originală (fără locație) și arhivă ZIP a întregului eveniment, pregătită de worker

**Independent Test**: arhiva unui eveniment cu 50 de fișiere conține toate cele 50 de fișiere originale curățate (quickstart 14)

### Tests for User Story 4 (scrise înainte, trebuie să eșueze) ⚠️

- [X] T090 [P] [US4] Scrie `packages/shared/src/archive-naming.test.ts`: `AAAA-LL-ZZ_HH-MM-SS_{nume-invitat|anonim}_{id-scurt}.{ext}` în `Europe/Bucharest`, nume sanitizate (diacritice păstrate, fără `/`, `\`, caractere de control), unicitate
- [X] T091 [P] [US4] Scrie `supabase/tests/functions/archive.test.ts`: `request_archive` reutilizează jobul `pending|building`, refuză un eveniment fără fișiere (`EMPTY_EVENT`), refuză alt organizator; `expire_archives` marchează arhivele cu `expires_at < now()`
- [X] T092 [P] [US4] Scrie `apps/worker/tests/build-archive.test.ts`: arhiva conține exact fișierele `ready` de la începerea jobului (inclusiv cele cu `thumb_path = NULL`), `skipped_count` = numărul rândurilor `uploaded`/`processing`/`failed`, ca intrări STORE cu ZIP64 și nume unice; job devenit `expired` în timpul construirii → obiect parțial șters
- [X] T093 [P] [US4] Scrie `apps/web/tests/e2e/archive.spec.ts`: descărcarea unui fișier dă originalul fără taguri de locație, cu numele original curățat; cererea arhivei → anunț „Arhiva e gata” fără reîncărcare → ZIP cu toate fișierele; eveniment fără fișiere → buton indisponibil cu explicație

### Implementation for User Story 4

- [X] T094 [P] [US4] Creează `packages/shared/src/archive-naming.ts` (numele intrărilor din arhivă și numele de descărcare individual)
- [X] T095 [US4] Migrația `supabase/migrations/20260925001200_archives.sql`: `request_archive(event_id)` (reutilizează jobul activ, altfel creează jobul + `pgmq.send({type:'build_archive'})`; `EMPTY_EVENT`) și jobul pg_cron `expire_archives` (la 15 min: `ready` cu `expires_at < now()` → `expired` + job `delete_archive`)
- [X] T096 [US4] Implementează jobul `apps/worker/src/jobs/build-archive.ts`: `building` → pentru fiecare `media_items` `ready` în ordinea `uploaded_at`: S3 `GetObject(original)` → intrare `yazl` (STORE, ZIP64) → S3 multipart (`@aws-sdk/lib-storage`) în `archives/{event}/{job}.zip`; prelungește vizibilitatea cu `pgmq.set_vt`; la final `ready`, `file_count`, `total_bytes`, `skipped_count` (rânduri `uploaded`/`processing`/`failed` la începere), `completed_at`, `expires_at = +24 h`; oprire și ștergere dacă jobul devine `expired` (research.md R9)
- [X] T097 [P] [US4] Implementează jobul `apps/worker/src/jobs/delete-archive.ts` (șterge obiectul arhivei; idempotent)
- [X] T098 [US4] Adaugă în `apps/web/lib/actions/organizer.ts` `requestArchive(eventId)` și `getArchiveUrl(archiveJobId)` (URL semnat de 15 min cu `download`; `NOT_READY`, `ARCHIVE_EXPIRED`; întoarce și `fileCount`, `skippedCount`) și, în `getMediaUrls`, `downloadUrl` pe `original.{ext}` cu numele din `archive-naming.ts`
- [X] T099 [US4] Creează `apps/web/components/gallery/ArchivePanel.tsx`: buton „Descarcă tot” (dezactivat, cu mesaj, la 0 fișiere), stare `pending/building/ready/failed` actualizată prin Realtime pe `archive_jobs` (filtru `event_id`), link de descărcare când e `ready`, cu mesajul „N fișiere nu sunt incluse (în procesare sau neprocesabile)” când `skippedCount > 0`; arhiva anulată de o ștergere → mesaj că trebuie cerută din nou; butonul de descărcare individual în `apps/web/components/gallery/MediaViewer.tsx`
- [X] T100 [US4] Adaugă cheile de text pentru descărcare în `apps/web/lib/i18n/messages/ro.ts`

**Checkpoint**: US4 funcționează independent pe galeria din US3

---

## Phase 7: User Story 5 — Organizatorul șterge fișiere (Priority: P2)

**Goal**: ștergere definitivă, după confirmare, a unuia sau mai multor fișiere (original + toate variantele), inclusiv prin linkuri emise anterior

**Independent Test**: se șterg 3 fișiere din 10; ele nu mai apar în galerie sau în arhivă, iar URL-urile semnate vechi dau 404 după 60 s (quickstart 13)

### Tests for User Story 5 (scrise înainte, trebuie să eșueze) ⚠️

- [X] T101 [P] [US5] Scrie `supabase/tests/functions/delete-media.test.ts`: `delete_media` verifică proprietatea, marchează `deleting`, expiră arhivele evenimentului și întoarce toate căile (original, display, thumb, poster, playback); `finalize_media_deletion` șterge doar rândurile `deleting`; `reconcile_deletions` pune în coadă rândurile `deleting` mai vechi de 5 min
- [X] T102 [P] [US5] Scrie `apps/web/tests/e2e/delete.spec.ts`: selecție a 3 fișiere → dialogul arată numărul și avertizarea de ireversibilitate → confirmare → fișierele dispar; după 60 s URL-urile semnate copiate înainte dau 404 pentru toate variantele; arhiva existentă e invalidată și noua arhivă nu conține fișierele șterse

### Implementation for User Story 5

- [X] T103 [US5] Migrația `supabase/migrations/20260925001300_delete_media.sql`: `delete_media(event_id, media_ids[])`, `finalize_media_deletion(media_ids[])` și jobul pg_cron `reconcile_deletions` (la 10 min → job `purge_media`)
- [X] T104 [US5] Adaugă în `apps/web/lib/actions/organizer.ts` `deleteMedia(eventId, mediaIds[])` (1–500 id-uri): `delete_media` → `storage.remove()` cu clientul organizatorului pe toate căile → `finalize_media_deletion`; întoarce `{ deleted, failed }` (eșecurile rămân `deleting` pentru reconciliere)
- [X] T105 [P] [US5] Implementează jobul `apps/worker/src/jobs/purge-media.ts` (șterge prin service role căile rândurilor `deleting`, apoi rândurile; idempotent)
- [X] T106 [US5] Adaugă selecția multiplă în `apps/web/components/gallery/GalleryGrid.tsx` (`selectionMode="multiple"`, bară de acțiuni) și creează `apps/web/components/gallery/ConfirmDeleteDialog.tsx` (react-aria `AlertDialog` cu numărul de fișiere și avertizarea „ireversibil”)
- [X] T107 [US5] Adaugă cheile de text pentru ștergere în `apps/web/lib/i18n/messages/ro.ts`

**Checkpoint**: US5 funcționează independent; SC-011 verificat

---

## Phase 8: User Story 6 — Uploadul se reia după întreruperi (Priority: P2)

**Goal**: reluare automată după căderi de rețea cât timp pagina e deschisă; după reîncărcare, invitatul vede ce trebuie reselectat

**Independent Test**: se taie conexiunea la jumătatea unui video mare și se restabilește; uploadul continuă de unde a rămas (quickstart 7, 8)

### Tests for User Story 6 (scrise înainte, trebuie să eșueze) ⚠️

- [ ] T108 [P] [US6] Scrie `apps/web/tests/e2e/resume.spec.ts`: `context.setOffline(true)` la ~50% dintr-un fișier de 50 MB → starea „în pauză din cauza rețelei”; `setOffline(false)` după 30 s → uploadul continuă fără retrimiterea chunk-urilor confirmate (verificat prin cererile PATCH TUS) și se finalizează; reîncărcarea paginii în timpul uploadului → fișierele finalizate rămân listate, iar cele nefinalizate apar după nume pentru reselectare; eșecuri repetate simulate → buton de reîncercare manuală pentru acel fișier
- [ ] T109 [P] [US6] Scrie `apps/web/tests/unit/upload-queue.test.ts`: tranzițiile de stare ale cozii (`uploading` → `paused` la `offline` → `uploading` la `online`; `failed` după epuizarea `retryDelays`; reîncercare manuală)

### Implementation for User Story 6

- [ ] T110 [US6] Extinde `apps/web/lib/upload/queue.ts`: `retryDelays = [0, 1000, 3000, 5000, 10000, 20000, 30000]`, starea `paused` la evenimentul `offline` și reluare `upload.start()` la `online`, starea `failed` cu `retry()` manual, fără `urlStorage` persistent între reîncărcări (clarificarea Q5)
- [ ] T111 [P] [US6] Creează `apps/web/components/upload/NetworkBanner.tsx` (mesaj `aria-live="polite"` „Uploadul e în pauză din cauza rețelei și se va relua automat”) și `apps/web/components/upload/KeepOpenNotice.tsx` (rugămintea vizibilă de a ține pagina deschisă, plus avertizare `beforeunload` cât timp există uploaduri active — FR-016b)
- [ ] T112 [US6] Creează `apps/web/components/upload/PendingAfterReload.tsx`: la montare apelează `getMyUploads(token)`; afișează fișierele încărcate și lista fișierelor nefinalizate (după nume), cu reselectare doar pentru acestea; integrează-l în `apps/web/components/upload/UploadClient.tsx` (FR-016a)
- [ ] T113 [US6] Adaugă butonul de reîncercare manuală în `apps/web/components/upload/FileRow.tsx` și cheile de text în `apps/web/lib/i18n/messages/ro.ts`

**Checkpoint**: US6 funcționează independent; SC-005 verificat

---

## Phase 9: User Story 8 — Organizatorul alege cât timp se păstrează fișierele (Priority: P2)

**Goal**: organizatorul vede data ștergerii, opțiunea și prețul final și poate doar prelungi; avertizări pe email la 30 de zile, 7 zile și 1 zi; ștergere automată la termen; anonimizarea datelor de facturare la 3 ani după expirare; adminul gestionează catalogul

**Independent Test**: eveniment cu 3 luni, prelungit la 12 luni → prețul crește cu 99 lei și e identic pentru admin; cu data ștergerii mutată în trecut, fișierele devin inaccesibile, iar evenimentul apare „expirat” (quickstart 16, 18–21)

### Tests for User Story 8 (scrise înainte, trebuie să eșueze) ⚠️

- [ ] T114 [P] [US8] Scrie `supabase/tests/functions/extend-retention.test.ts`: `extend_retention` refuză o opțiune mai scurtă sau egală (`RETENTION_NOT_LONGER`), alt organizator (`FORBIDDEN`), o opțiune inactivă (`OPTION_INACTIVE`), un preț așteptat diferit (`PRICE_CHANGED`), un eveniment `expiring`/`expired` sau `now() >= purge_at` (`RETENTION_EXPIRED`); reușita actualizează snapshot-ul, `purge_at`, `final_price_minor` și scrie un rând de istoric `organizer`; `retention_quote` marchează `selectable` doar opțiunile mai lungi; modificarea suplimentului în catalog nu schimbă `final_price_minor` al evenimentelor existente; ștergerea unei opțiuni folosite → eroare FK (`OPTION_IN_USE`)
- [ ] T115 [P] [US8] Scrie `supabase/tests/functions/retention-jobs.test.ts` cu `p_now` controlat: `enqueue_retention_notices` emite `30d`, apoi `7d`, apoi `1d`, fiecare o singură dată per `purge_at` (a doua rulare nu adaugă nimic); când sunt depășite mai multe praguri se emite doar cel mai apropiat; după prelungire se reemit pragurile pentru noul `purge_at`; `expire_due_events` trece evenimentele scadente în `expiring`, expiră arhivele și pune `expire_event` în coadă; `complete_event_expiry` șterge media, arhivele, sesiunile și avertizările, schimbă `public_token`, setează `expired`/`expired_at` și păstrează rândul și istoricul
- [ ] T116 [P] [US8] Scrie `supabase/tests/functions/anonymize.test.ts`: `anonymize_expired_events(p_now)` anonimizează doar evenimentele `expired` cu `expired_at < p_now - interval '3 years'` și `anonymized_at IS NULL` (`name`, `organizer_email` → NULL, `anonymized_at = p_now`, `event_retention_changes.actor_user_id` → NULL); prețurile, datele și durata rămân; o a doua rulare nu schimbă nimic; CHECK-ul refuză `name = NULL` pe un eveniment neanonimizat; `delete_organizer_user` se trimite doar pentru utilizatorii fără alt eveniment și care nu sunt admini
- [ ] T117 [P] [US8] Scrie `apps/worker/tests/retention.test.ts`: `expire_event` pe un eveniment cu obiecte în `incoming`, `media`, `archives` → prefixe goale și `status = 'expired'`; `retention_notice` trimite un email în Mailpit cu data ștergerii în `Europe/Bucharest` și linkul `{APP_URL}/events/{id}`; sare peste jobul cu `purge_at` diferit de cel curent și peste `sent_at` deja setat; eșecul SMTP lasă mesajul în coadă
- [ ] T118 [P] [US8] Scrie `apps/web/tests/e2e/retention.spec.ts`: organizatorul vede data ștergerii, 3 luni și 299 lei; opțiunile ≤ curentă nu se pot selecta; alege 12 luni → dialogul arată 398 lei, diferența și noua dată → confirmă; adminul vede 398 lei și rândul de istoric; `PRICE_CHANGED` → dialogul se reafișează cu prețul nou; eveniment expirat → listat ca „expirat”, fără galerie; `/e/{token}` vechi → „eveniment inexistent”; adminul editează suplimentul în `/admin/retention` fără efect asupra evenimentelor existente

### Implementation for User Story 8

- [ ] T119 [US8] Migrația `supabase/migrations/20260925001400_retention_functions.sql`: `retention_quote(event_id)`, `extend_retention(event_id, option_id, expected_final_price_minor)` (`FOR UPDATE`, proprietate prin emailul din JWT, setează `app.retention_actor = 'organizer'`), `expire_due_events(p_now timestamptz default now())` (`FOR UPDATE SKIP LOCKED`), `enqueue_retention_notices(p_now timestamptz default now())` (prag = cel mai apropiat depășit dintre `1d`/`7d`/`30d`, `INSERT … ON CONFLICT DO NOTHING`, job doar pentru rândurile noi) și `complete_event_expiry(event_id)` (doar `service_role`) — contracts/database-functions.md, research.md R17
- [ ] T120 [US8] În aceeași migrație programează joburile pg_cron `expire_due_events` (orar, minutul 5; reia și evenimentele `expiring` mai vechi de 1 h) și `enqueue_retention_notices` (orar, minutul 20)
- [ ] T121 [US8] Migrația `supabase/migrations/20260925001500_anonymize.sql`: funcția `anonymize_expired_events(p_now timestamptz default now())` (research.md R17, FR-047) și jobul pg_cron zilnic la 03:30
- [ ] T122 [P] [US8] Creează `apps/worker/src/email/transport.ts` (nodemailer SMTP din `SMTP_HOST/PORT/USER/PASS`, `SMTP_FROM`; Mailpit în dezvoltare/CI) și `apps/worker/src/email/templates/retention-notice.ts` (text + HTML în română, fără imagini externe: numele evenimentului, data ștergerii în `Europe/Bucharest`, linkul `{APP_URL}/events/{event_id}` fără token, mențiunea despre arhivă și prelungire; variante pentru 30 de zile, 7 zile și 1 zi)
- [ ] T123 [US8] Implementează jobul `apps/worker/src/jobs/retention-notice.ts` după contracts/worker-jobs.md (verificări de stare/`purge_at`/`sent_at`, trimitere, `sent_at` înainte de `pgmq.archive`, `failed_at` + Sentry fără adresă la `read_ct > 5`)
- [ ] T124 [US8] Implementează jobul `apps/worker/src/jobs/expire-event.ts` (ignoră dacă nu e `expiring`; `purge-prefix.ts` pe `incoming`, `media`, `archives`; apoi `complete_event_expiry`)
- [ ] T125 [US8] Adaugă în `apps/web/lib/actions/organizer.ts` `getRetentionQuote(eventId)` și `extendRetention(eventId, optionId, expectedFinalPriceMinor)` (erori `FORBIDDEN`, `RETENTION_NOT_LONGER`, `RETENTION_EXPIRED`, `PRICE_CHANGED`, `OPTION_INACTIVE`)
- [ ] T126 [P] [US8] Creează `apps/web/components/retention/RetentionPanel.tsx` (secțiunea „Păstrarea fișierelor”: data ștergerii, opțiunea curentă, prețul final, opțiunile cu prețul rezultat, cele nealegibile dezactivate) și `apps/web/components/retention/ExtendRetentionDialog.tsx` (react-aria `AlertDialog`: prețul final nou, diferența, noua dată; butonul de confirmare repetă prețul; la `PRICE_CHANGED` reîncarcă oferta)
- [ ] T127 [US8] Integrează `RetentionPanel` în `apps/web/app/events/[eventId]/page.tsx`; pentru `expiring`/`expired` afișează doar datele evenimentului și mesajul că fișierele au fost șterse; în `apps/web/app/events/page.tsx` afișează data ștergerii sau eticheta „expirat” (FR-041, FR-044)
- [ ] T128 [US8] Adaugă în `apps/web/lib/actions/admin.ts` `listRetentionOptions()` (inclusiv inactive, cu numărul de evenimente care le folosesc), `upsertRetentionOption({ id?, months, surchargeMinor, active })` (`VALIDATION`, `DUPLICATE_MONTHS`) și `deleteRetentionOption(id)` (`OPTION_IN_USE`)
- [ ] T129 [US8] Creează pagina `apps/web/app/admin/retention/page.tsx` (tabel editabil al catalogului: durată, supliment în lei, activ/inactiv, ștergere doar pentru opțiunile nefolosite — FR-038)
- [ ] T130 [US8] În `apps/web/app/admin/events/page.tsx` și `apps/web/app/admin/events/[eventId]/page.tsx` afișează evenimentele anonimizate ca „Eveniment anonimizat”, fără email, cu prețul final, datele și durata retenției, fără acțiuni de editare (FR-047); cheile de text în `apps/web/lib/i18n/messages/ro.ts`
- [ ] T131 [US8] Adaugă cheile de text pentru retenție, preț și email în `apps/web/lib/i18n/messages/ro.ts`

**Checkpoint**: US8 funcționează independent; FR-038–FR-047 și SC-013–SC-015 verificate

---

## Phase 10: User Story 7 — Galeria se actualizează în timpul evenimentului (Priority: P3)

**Goal**: fișierele noi apar în galeria deschisă fără reîncărcare, iar după o reconectare se recuperează fără duplicate

**Independent Test**: cu galeria deschisă pe laptop, o poză încărcată de pe telefon apare în ≤ 10 s (quickstart 9)

### Tests for User Story 7 (scrise înainte, trebuie să eșueze) ⚠️

- [ ] T132 [P] [US7] Scrie `apps/web/tests/unit/gallery-merge.test.ts`: reducer-ul de galerie aplică INSERT/UPDATE/DELETE, păstrează ordinea după `(uploaded_at, id)`, nu produce duplicate când resincronizarea întoarce elemente deja primite prin Realtime
- [ ] T133 [P] [US7] Scrie `apps/web/tests/e2e/gallery-live.spec.ts`: organizatorul are galeria deschisă, un al doilea context încarcă o poză → apare în ≤ 10 s, în poziția corectă; un video apare „în procesare” și devine redabil fără reîncărcare; organizatorul trece offline, se încarcă 2 fișiere, revine online → ambele apar o singură dată

### Implementation for User Story 7

- [ ] T134 [P] [US7] Creează `apps/web/lib/gallery/merge.ts` (reducer pur: upsert după `id`, eliminare la DELETE sau la stare invizibilă, sortare după `(uploaded_at, id)`)
- [ ] T135 [US7] Creează `apps/web/lib/realtime/useEventChannel.ts`: canal `event:{eventId}`, `postgres_changes` pe `public.media_items` cu filtrul `event_id=eq.{eventId}`; la fiecare `SUBSCRIBED` apelează `listMedia(eventId, undefined, lastUpdatedAt)` și aplică diferența prin `merge.ts` (FR-033); miniaturile noi primesc URL-uri semnate la cerere
- [ ] T136 [US7] Integrează `useEventChannel` în `apps/web/components/gallery/GalleryGrid.tsx` (anunț `aria-live="polite"` pentru fișierele noi, fără a muta focusul)

**Checkpoint**: toate poveștile funcționează independent

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: porțile de calitate ale constituției, performanță, securitate, livrare

- [ ] T137 [P] Scrie `apps/web/tests/e2e/a11y.spec.ts`: `@axe-core/playwright` fără încălcări WCAG 2.2 AA pe `/e/[token]` (toate stările), `/login`, `/auth/mfa`, `/events`, `/events/[eventId]` (galerie, vizualizator, dialoguri), `/admin/events`, `/admin/events/new`, `/admin/retention` (FR-037)
- [ ] T138 [P] Scrie testul de încărcare `tests/load/guest-upload.k6.js`: 200 de sesiuni de invitat pe același eveniment și același IP, fiecare cu 5 rezervări + upload TUS de 3 MB; praguri: 0 erori, p95 `reserveUpload` < 1 s (SC-006) — rulat doar pe preview
- [ ] T139 [P] Scrie `tests/perf/archive-1000.ts`: seed de 1.000 de fișiere sintetice (≈ 10 GB) pe preview, măsurarea timpului până la „Arhiva e gata” (≤ 15 min) și a primului octet după click (< 10 s), verificarea sumelor de control (SC-010)
- [ ] T140 [P] Scrie `apps/web/tests/unit/sentry-scrub.test.ts`: `beforeSend` elimină emailuri, nume de invitați, tokenuri și căi de fișiere din evenimente de test
- [ ] T141 [P] Scrie `apps/web/tests/unit/no-secrets-in-client.test.ts`: construiește aplicația și caută `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SECRET` și cheia service role în `.next/static/**` (principiul III)
- [ ] T142 Creează configurația de livrare a worker-ului `apps/worker/deploy/scaleway-container.md` (Serverless Containers `fr-par`, `min-scale = 1`, 2 vCPU / 4 GB, variabilele din `.env.example`) și pasul de publicare a imaginii în `.github/workflows/ci.yml` doar pe `main`
- [ ] T143 [P] Scrie `README.md` (root) cu pașii din [quickstart.md](./quickstart.md), mediile (local, preview, producție) și lista procesatorilor care necesită DPA (Vercel, Supabase, Resend, Sentry — research.md R15)
- [ ] T144 Rulează manual scenariile 1–22 din `specs/001-event-qr-upload/quickstart.md`, cronometrează crearea unui eveniment complet cu descărcarea QR (< 3 min, SC-001) și primul upload al unui invitat nou, fără ajutor, pe un telefon real (< 60 s de la scanare, SC-003) și bifează rezultatul fiecăruia în descrierea PR-ului; verifică explicit în review RLS pe toate tabelele noi, absența secretelor în client, ștergerea din Storage prin API și validarea pe server (constituția › porți de calitate)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: fără dependențe
- **Foundational (Phase 2)**: depinde de Setup — **blochează toate poveștile**
- **US1 (Phase 3)**: depinde de Foundational
- **US2 (Phase 4)**: depinde de Foundational; pentru testul manual cap-coadă are nevoie de un eveniment (seed sau US1)
- **US3 (Phase 5)**: depinde de Foundational; pentru a avea ce afișa folosește fișiere încărcate prin US2 (sau rânduri `ready` din fixture-urile testelor)
- **US4, US5 (Phases 6–7)**: depind de US3 (galeria și `organizer.ts`); independente între ele
- **US6 (Phase 8)**: depinde de US2 (`queue.ts`, `UploadClient.tsx`)
- **US8 (Phase 9)**: depinde de US1 (formularul și acțiunile admin) și de US3 (pagina evenimentului); refolosește `purge-prefix.ts` din Foundational
- **US7 (Phase 10)**: depinde de US3 (`GalleryGrid`, `listMedia`)
- **Polish (Phase 11)**: după poveștile dorite

### User Story Dependencies

```text
Setup → Foundational ─┬─> US1 ──────────────┬─> US8
                      ├─> US2 ──> US6        │
                      └─> US3 ─┬─> US4       │
                               ├─> US5       │
                               ├─> US7       │
                               └─────────────┘
```

### Within Each User Story

- Testele se scriu primele și trebuie să eșueze (principiul VI)
- Migrații SQL → acțiuni server / joburi worker → componente UI → texte i18n
- Checkpoint-ul fiecărei povești se validează înainte de trecerea la următoarea prioritate

### Parallel Opportunities

- Setup: toate sarcinile `[P]` după crearea workspace-ului și a `tsconfig.base.json`
- Foundational: helper-ele și testele DB, fișierele din `packages/shared`, clienții Supabase, i18n, Sentry și `result.ts` sunt independente; migrațiile se scriu secvențial (ordinea contează)
- După Foundational: US1, US2 și US3 pot fi lucrate în paralel de persoane diferite
- În US2: `detect.ts`, `sanitize.ts`, `photo.ts`, `video.ts` (worker) în paralel cu `FileRow.tsx`/`UploadSummary.tsx` (web)
- După US3: US4, US5 și US7 în paralel; US6 în paralel cu toate acestea

---

## Parallel Example: User Story 2

```text
# Testele, împreună (toate trebuie să eșueze la început):
Task: "supabase/tests/functions/guest-upload.test.ts"
Task: "apps/worker/tests/process.test.ts"
Task: "apps/web/tests/e2e/guest-upload.spec.ts"
Task: "apps/worker/scripts/smoke-heic.ts"

# Modulele media ale worker-ului, împreună:
Task: "apps/worker/src/media/detect.ts"
Task: "apps/worker/src/media/sanitize.ts"
Task: "apps/worker/src/media/photo.ts"
Task: "apps/worker/src/media/video.ts"
```

## Parallel Example: User Story 8

```text
Task: "supabase/tests/functions/extend-retention.test.ts"
Task: "supabase/tests/functions/retention-jobs.test.ts"
Task: "apps/worker/tests/retention.test.ts"
Task: "apps/web/tests/e2e/retention.spec.ts"

# După migrația de retenție:
Task: "apps/worker/src/email/transport.ts + templates/retention-notice.ts"
Task: "apps/web/components/retention/RetentionPanel.tsx + ExtendRetentionDialog.tsx"
```

---

## Implementation Strategy

### MVP First (P1: US1 + US2 + US3)

1. Phase 1 (Setup) → Phase 2 (Foundational)
2. US1 → validare independentă (QR scanat deschide pagina corectă)
3. US2 → validare pe telefon real (iOS Safari + Chrome Android)
4. US3 → validare izolare între organizatori
5. **STOP și demo**: bucla de valoare admin → QR → invitat → galerie

US1 singur nu are valoare pentru client (doar un cod QR); MVP-ul livrabil unui client real
este P1 complet.

### Incremental Delivery

1. MVP (US1–US3)
2. + US6 (reluare) — înainte de primul eveniment real, fiindcă semnalul slab e scenariul tipic
3. + US4 (descărcare) și US5 (ștergere) — obligatorii înainte de livrarea către client
4. + US8 (retenție și preț) — obligatoriu înainte de producție (constituția, principiul II)
5. + US7 (galerie live) — îmbunătățire
6. Polish: a11y, test de încărcare, performanța arhivei, livrare (LCP e verificat din US2)

### Parallel Team Strategy

După Foundational: dezvoltatorul A → US1 apoi US8; dezvoltatorul B → US2 apoi US6;
dezvoltatorul C → US3 apoi US4/US5/US7.

---

## Notes

- `[P]` = fișiere diferite, fără dependențe de sarcini nefinalizate
- `[USn]` leagă sarcina de povestea din [spec.md](./spec.md)
- Nicio sarcină nu adaugă emailuri reale în teste: toate emailurile trec prin Mailpit
- Commit după fiecare sarcină sau grup logic; push doar cu acordul explicit al utilizatorului
- Constrângerile de câmp sunt citate din [data-model.md](./data-model.md); dacă apare o
  contradicție, data-model.md are prioritate și se corectează sarcina

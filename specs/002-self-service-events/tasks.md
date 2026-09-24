---
description: "Task list for 002 — creare self-service a evenimentelor"
---

# Tasks: Creare self-service a evenimentelor de către organizatori

**Input**: Design documents from `/specs/002-self-service-events/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluse. Constituția (VI) cere testele pentru fluxurile critice scrise înainte și
verificate că eșuează înainte de implementare.

**Organization**: sarcinile sunt grupate pe povești de utilizator (US1–US7 din spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: poate rula în paralel (fișiere diferite, fără dependențe nefinalizate)
- **[Story]**: povestea de utilizator (US1…US7)

## Path Conventions

Monorepo din 001: `apps/web/`, `apps/worker/`, `packages/shared/`, `supabase/`. Migrațiile
noi încep de la `supabase/migrations/20261001000100_*.sql`. Mesajele din coadă folosesc câmpuri
`snake_case`, ca `apps/worker/src/jobs/types.ts` din 001.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configurare, chei de test, coduri de eroare și texte comune

- [X] T001 Adaugă în `scripts/ci-env.mjs` variabilele `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB` și `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` și `TURNSTILE_OFFLINE=1` pentru `apps/web/.env.local` și `ADMIN_NOTIFY_EMAILS` (gol) pentru `apps/worker/.env` și `.env.docker`; documentează-le în `apps/web/lib/server-env.ts` / `apps/web/lib/env.ts` (validare zod: site key public; secretul și `TURNSTILE_OFFLINE` doar pe server; `TURNSTILE_OFFLINE` e acceptat doar împreună cu secretul de test `1x0000000000000000000000000000000AA`, altfel pornirea eșuează)
- [X] T002 **Probă întâi**: cu `[auth.captcha] enabled = true`, `provider = "turnstile"`, `secret = "env(TURNSTILE_SECRET_KEY)"` activ local, verifică dacă `verifyOtp` (cod și `token_hash`, obținute prin `auth.admin.generateLink`) reușește **fără** `captchaToken`; notează rezultatul în `specs/002-self-service-events/research.md` (R3). Dacă `/verify` cere CAPTCHA, lasă `[auth.captcha]` dezactivat și actualizează R3 conform alternativei descrise acolo. Apoi, în `supabase/config.toml`: `[auth.email] otp_expiry = 900`, `otp_length = 6`; `additional_redirect_urls` include `/auth/confirm` (research R3, R8)
- [X] T003 [P] Actualizează clientul de test cu parolă din `supabase/tests/support/clients.ts` și ajutoarele din `apps/web/tests/e2e/support/` să trimită `captchaToken: "XXXX.DUMMY.TOKEN.XXXX"` acolo unde apelează direct Supabase Auth, ca testele din 001 să treacă cu CAPTCHA-ul Auth activ (research R3)
- [X] T004 [P] Adaugă codurile de eroare `EVENT_NOT_ACTIVATED`, `EVENT_SUSPENDED`, `AWAITING_LIMIT_REACHED`, `TERMS_OUTDATED`, `CAPTCHA_FAILED`, `REQUEST_EXPIRED`, `REQUEST_INVALIDATED`, `ACTIVATION_REQUEST_TOO_SOON`, `INVALID_TRANSITION`, `REASON_REQUIRED` în `packages/shared/src/errors.ts` și mesajele lor în română în `apps/web/lib/i18n/messages/ro.ts` (cheile `errors.*`)
- [X] T005 [P] CSP în `apps/web/proxy.ts`: adaugă `https://challenges.cloudflare.com` la `script-src` și `frame-src`; test în `apps/web/tests/unit/csp.test.ts` care verifică directivele
- [X] T006 [P] În `apps/web/playwright.config.ts`, `webServer`-ul principal primește `env: { RATE_LIMIT_IP_PER_HOUR: "100000" }`: local, toată suita e2e rulează de pe `127.0.0.1` (ca limitele Auth ridicate în `supabase/config.toml` în 001). Limitele per adresă rămân cele reale, deoarece testele folosesc adrese unice. Adaugă și serverele suplimentare, cu **același build** (`npx next start --port …`, fără `next build`, pornite după serverul principal): `limits` (port 3001, limitele implicite), `captcha-reject` (port 3002, `TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA`) și `turnstile-smoke` (port 3003, fără `TURNSTILE_OFFLINE`); proiectele Playwright cu aceleași nume rulează doar fișierele lor, iar proiectele principale le ignoră, ca pe `retention.spec.ts`. `turnstile-smoke` rulează doar când `CI` sau `E2E_TURNSTILE_SMOKE=1` sunt setate (are nevoie de internet)
- [X] T007 [P] Creează textele inițiale ale documentelor legale (conținut provizoriu marcat „de completat de proprietar”) în `apps/web/content/legal/terms/2026-10-01.md` și `apps/web/content/legal/privacy/2026-10-01.md`; politica menționează Cloudflare Turnstile și termenele de ștergere din spec (24 h, 30 de zile după dată)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: stările evenimentului, istoricul, pachetul și documentele legale, de care depind toate poveștile

**⚠️ CRITICAL**: nicio poveste nu începe înainte de finalizarea acestei faze

### Tests (scrise înainte, trebuie să eșueze)

- [X] T008 [P] Test DB pentru mașina de stări în `supabase/tests/functions/event-states.test.ts`: fiecare pereche din tabelul `event_status_transitions` (data-model.md) trece prin `transition_event`; perechile nepermise dau `INVALID_TRANSITION`; `update events set status = …` direct (și ca service role) este respins de trigger; fiecare tranziție scrie exact un rând în `event_status_changes` cu `source`, `actor_user_id`, `created_at`
- [X] T009 [P] Test DB pentru imuabilitatea istoricului în `supabase/tests/rls/status-history.test.ts`: `update`/`delete` pe `event_status_changes` refuzate pentru `authenticated` și `service_role`; ștergerea evenimentului șterge istoricul prin cascadă; organizatorul citește doar istoricul evenimentelor proprii, prin view, fără `actor_user_id` al adminului
- [X] T010 [P] Test DB pentru RLS pe tabelele noi în `supabase/tests/rls/rls-enabled.test.ts` (extinde testul existent): `packages`, `self_service_settings`, `event_status_transitions`, `event_status_changes`, `auth_requests`, `legal_documents`, `terms_acceptances`, `activation_requests`, `app_audit_log` au RLS activ; `auth_requests` și `app_audit_log` nu sunt accesibile clienților

### Implementation

- [X] T011 Migrația `supabase/migrations/20261001000100_event_states.sql`: `alter type event_status add value` pentru `unconfirmed`, `awaiting_activation`, `suspended`; enum-urile `event_origin ('admin','self_service')`, `status_change_source ('organizer','admin','system','payment')`; valoarea `activation_7d` în `notice_threshold`
- [X] T012 Migrația `supabase/migrations/20261001000200_event_columns.sql`: pe `events` adaugă `origin event_origin not null default 'admin'`, `package_id uuid null`, `activated_at timestamptz null`, `pending_purge_at timestamptz null`; relaxează `base_price_minor`, `retention_option_id`, `upload_starts_at`, `upload_ends_at`, `purge_at` la `null` permis doar când `status in ('unconfirmed','awaiting_activation')` (check); check `char_length(name) between 1 and 120`; triggerul de retenție din 001 rulează doar când `retention_option_id` e setat; evenimentele existente primesc `activated_at = created_at`
- [X] T013 Migrația `supabase/migrations/20261001000300_status_machine.sql`: tabelul `event_status_transitions (from_status, to_status)` populat exact cu perechile din data-model.md (inclusiv `active → active`); tabelul `event_status_changes` (`id bigint identity`, `event_id` FK `on delete cascade`, `from_status` null, `to_status`, `source`, `actor_user_id uuid null`, `reason text null` 1–500 caractere, `external_ref text null` unic per (`event_id`, `external_ref`), `note text null`, `created_at default now()`); triggerul de imuabilitate; funcția `transition_event(p_event_id, p_to, p_source, p_actor, p_reason, p_external_ref, p_note)` (`security definer`, `set search_path = ''`, `for update`, marcaj `app.status_transition`); triggerul `before update of status` pe `events` care respinge schimbările fără marcaj; view-ul `organizer_status_history`; RLS (admin citește tot, organizatorul prin view)
- [X] T014 Migrația `supabase/migrations/20261001000400_status_machine_001.sql`: rescrie funcțiile din 001 care schimbă `status` direct (`request_event_deletion` din `20260925001000_admin_functions.sql`, `expire_due_events` și `complete_event_expiry` din `20260925001400_retention_functions.sql` — singurele `update public.events set status` din 001; worker-ul nu scrie starea direct) să folosească `transition_event` cu sursa `admin` / `system`; la anonimizare golește `actor_user_id` și `reason` din istoric (001/FR-047)
- [X] T015 Migrația `supabase/migrations/20261001000500_packages.sql`: tabelul `packages` (`code` unic, `name` 1–60, `price_minor >= 0`, `max_files_per_guest` 1–10000, `max_photo_bytes` 1–52428800, `max_video_bytes` 1–1073741824, `retention_option_id` FK către o opțiune activă, `updated_at` cu `set_updated_at`); `self_service_settings` (un rând, `id boolean primary key check (id)`, `max_awaiting_events_per_organizer int` 1–20 implicit 2); seed: rândul `complete` cu valorile implicite din 001 (opțiunea de 3 luni) și rândul de setări; RLS: `packages` citit de `authenticated`, modificat doar de `is_admin()`; `self_service_settings` doar admin; FK `events.package_id → packages`; evenimentele existente primesc `package_id` = `complete`
- [X] T016 Migrația `supabase/migrations/20261001000550_admin_event_defaults.sql`: trigger `before insert` pe `events` care, pentru `origin = 'admin'`, setează `package_id` = pachetul `complete` (dacă lipsește) și `activated_at = now()`; trigger `after insert` care scrie în `event_status_changes` rândul `null → active` cu sursa `admin`, `actor_user_id = auth.uid()` și motivul „creat de administrator” (FR-023, FR-024); test în `supabase/tests/functions/admin.test.ts` (extinde): evenimentul creat prin politica `events_admin_insert` are `package_id`, `activated_at` și exact un rând de istoric
- [X] T017 Migrația `supabase/migrations/20261001000600_legal.sql`: enum `legal_document_kind ('terms','privacy')`; `legal_documents (kind, version, effective_at, content_sha256)` cu PK (`kind`, `version`), `version` în format `AAAA-LL-ZZ`, citire publică; `terms_acceptances` (`email citext`, `user_id uuid null`, `event_id` FK `on delete set null`, `document_kind`, `version` FK, `accepted_at`); RLS: organizatorul își citește acceptările, adminul tot; funcția `current_legal_versions()`; seed cu versiunile `2026-10-01`
- [X] T018 [P] Test unitar în `apps/web/tests/unit/legal-documents.test.ts`: hash-ul SHA-256 al fiecărui fișier din `apps/web/content/legal/` coincide cu `content_sha256` din seed (citit din migrație), ca un text schimbat fără versiune nouă să pice în CI
- [X] T019 Migrația `supabase/migrations/20261001000700_audit_log.sql`: `app_audit_log (id, event_id uuid fără FK, action text in ('auto_deleted_unactivated','auto_deleted_unconfirmed_count'), details jsonb, created_at)`, fără acces pentru clienți, citire admin
- [X] T020 Actualizează RLS-ul organizatorului în `supabase/migrations/20261001000800_organizer_visibility.sql`: `events_organizer_select` și view-ul `organizer_events` includ `awaiting_activation`, `active`, `suspended`, `expiring`, `expired` (fără `unconfirmed`, `deleting`) și coloanele `origin`, `activated_at`, `pending_purge_at`; `organizer_owns_active_event` acceptă și `suspended` pentru citire, descărcare și ștergere de fișiere (FR-028a)
- [X] T021 Regenerează tipurile (`pnpm db:types`) în `packages/shared/src/db.types.ts` și extinde `apps/worker/src/jobs/types.ts` cu mesajele `auth_email { request_id, email, purpose }`, `auth_rotate { email }`, `admin_activation_notice { event_id }` și pragul `activation_7d` la `retention_notice` (contracts/worker-jobs.md)
- [X] T022 Rulează `pnpm test:db`: T008–T010 trec, iar testele din 001 rămân verzi (în special `admin.test.ts`, `retention-jobs.test.ts`, `anonymize.test.ts`, afectate de T014)

**Checkpoint**: stările, istoricul, pachetul și documentele legale există; 001 funcționează neschimbat

---

## Phase 3: User Story 1 - Vizitatorul își creează singur un eveniment (Priority: P1) 🎯 MVP

**Goal**: formular pe `/` → email cu cod și link → confirmare (cod sau buton) → organizator autentificat la evenimentul `awaiting_activation`, cu codul QR

**Independent Test**: quickstart scenariile 1–5, 14 (partea neconfirmată), 16, 17

### Tests for User Story 1 ⚠️

- [X] T023 [P] [US1] Test DB în `supabase/tests/functions/auth-requests.test.ts`:
  - `request_self_service_event` creează evenimentul `unconfirmed` (`origin = self_service`, fără `user_id`), două acceptări fără `user_id` și cererea `create`, care expiră în 15 minute;
  - o a doua cerere pentru aceeași adresă o invalidează pe prima;
  - versiunile vechi dau `TERMS_OUTDATED`;
  - `register_failed_code` invalidează cererea la a 5-a greșeală și pune în coadă `auth_rotate`;
  - `complete_auth_request` refuză o adresă diferită, cererile expirate și cele folosite; la succes, evenimentul devine `awaiting_activation`, cu `pending_purge_at` = sfârșitul zilei `event_date + 30` (ora României), acceptările primesc `user_id` și există un rând în istoric (`unconfirmed → awaiting_activation`, sursa `organizer`);
  - limita FR-021 întoarce `AWAITING_LIMIT_REACHED` și lasă evenimentul `unconfirmed`.
- [X] T024 [P] [US1] Test DB în `supabase/tests/rls/unconfirmed.test.ts`: un eveniment `unconfirmed` nu apare pentru organizatorul cu aceeași adresă, nici pentru alt organizator, nici pentru `anon`; `auth_requests` nu poate fi citit sau modificat de `authenticated`/`anon`; `anon` și `authenticated` nu pot insera în `events`
- [X] T025 [P] [US1] Test DB în `supabase/tests/functions/cleanup-unconfirmed.test.ts`: `purge_unconfirmed_events()` șterge evenimentele `unconfirmed` mai vechi de 24 h (cu cererile și acceptările lor) și le lasă pe cele mai noi
- [X] T026 [P] [US1] Teste unitare în `apps/web/tests/unit/self-service-schema.test.ts`: schema zod a formularului: email valid ≤ 254, nume 1–120 după trim, data între azi și +2 ani (ora României), `accepted` obligatoriu, honeypot `website` gol
- [X] T027 [P] [US1] Teste unitare în `apps/web/tests/unit/turnstile.test.ts` pentru `verifyTurnstile(token, ip)`: trimite `secret`, `response`, `remoteip` la siteverify, întoarce `false` la `success: false`, la eroare de rețea și la token lipsă (cu `fetch` simulat)
- [X] T028 [P] [US1] Test de worker în `apps/worker/tests/auth-email.test.ts` (Mailpit):
  - `auth_email` `create` pentru o adresă nouă creează utilizatorul Auth neconfirmat și trimite emailul `confirmare`, cu codul de 6 cifre, linkul `/auth/confirm?request=…&token_hash=…` și numele evenimentului escapat HTML;
  - pentru o cerere invalidată nu trimite nimic;
  - codul din email trece `verifyOtp`;
  - `auth_rotate` invalidează codul anterior;
  - emailul ajunge în Mailpit în < 30 s de la punerea jobului în coadă (SC-014).
- [X] T029 [P] [US1] Teste pentru șablonul `confirmare` în `apps/worker/tests/email-templates.test.ts`: subiectul conține codul; textul și HTML-ul conțin numele produsului, valabilitatea de 15 minute, „o singură folosință” și „ignoră dacă nu tu ai cerut” (FR-013); `<script>` din numele evenimentului apare escapat
- [X] T030 [P] [US1] Test e2e în `apps/web/tests/e2e/self-service.spec.ts`:
  - creare de pe `/` cu o adresă nouă, codul luat din Mailpit, ajungere la `/events/{id}` cu starea „în așteptarea activării” și descărcarea codului QR (PNG);
  - confirmare prin link într-un `browser.newContext()` separat, cu butonul „Confirmă”;
  - deschiderea linkului fără apăsarea butonului, urmată de folosirea codului, care încă funcționează;
  - codul greșit de 5 ori;
  - erorile de câmp lângă câmpuri;
  - același mesaj și aceeași pagină pentru `org-a@example.test` și pentru o adresă nouă.
- [X] T031 [P] [US1] Test e2e în `apps/web/tests/e2e/abuse-limits.spec.ts`, în proiectul `limits` (serverul de pe portul 3001, cu limitele implicite; în `beforeAll` șterge din `rate_limit_counters` cheile `authmail:%`, ca rulările locale repetate să pornească de la zero): 4 trimiteri în 15 minute pentru aceeași adresă dau 4 răspunsuri identice, dar doar 3 emailuri în Mailpit; 21 de trimiteri de pe același IP într-o oră (adrese diferite) dau un răspuns identic la a 21-a, fără email și fără cerere în `auth_requests` (SC-006, FR-036)
- [X] T032 [US1] Test e2e în `apps/web/tests/e2e/captcha-reject.spec.ts`, în proiectul `captcha-reject` (serverul de pe portul 3002, același build, cu secretul Turnstile care eșuează mereu; variabilele sunt citite la runtime de `server-env.ts`): formularul afișează `CAPTCHA_FAILED`; niciun eveniment și nicio cerere în baza de date; niciun email în Mailpit (SC-007, FR-037)

### Implementation for User Story 1

- [X] T033 [US1] Migrația `supabase/migrations/20261001000900_auth_requests.sql`: enum-urile `auth_request_purpose`, `auth_request_status`; tabelul `auth_requests` (`id uuid default gen_random_uuid()`, `email citext`, `purpose`, `event_id` FK `on delete cascade` obligatoriu pentru `create`, `status default 'pending'`, `failed_attempts smallint` 0–5, `expires_at = created_at + 15 min`, `used_at`, `created_at`); RLS fără acces pentru clienți; funcțiile `request_self_service_event`, `register_failed_code`, `complete_auth_request` exact ca în contracts/database-functions.md (depinde de T013, T017)
- [X] T034 [US1] Migrația `supabase/migrations/20261001001000_cleanup_unconfirmed.sql`: `purge_unconfirmed_events()` (+ numărul șters în `app_audit_log` ca `auto_deleted_unconfirmed_count`, fără adrese) și jobul `pg_cron` `purge-unconfirmed` `*/15 * * * *`; jobul `purge-auth-requests` `40 3 * * *` (cererile închise > 7 zile)
- [X] T035 [P] [US1] `apps/web/lib/security/turnstile.ts`: `verifyTurnstile(token, ip)` cu `TURNSTILE_SECRET_KEY`, timeout 5 s, fără logarea tokenului; `apps/web/lib/security/ip-hash.ts` (existent) expune și IP-ul brut pentru `remoteip` (din `x-forwarded-for`, prima valoare, sau `x-real-ip`)
- [X] T036 [P] [US1] Componenta `apps/web/components/security/TurnstileField.tsx`: încarcă `https://challenges.cloudflare.com/turnstile/v0/api.js` cu nonce-ul CSP (din `headers()`), randează widgetul „managed” cu `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, scrie tokenul în câmpul ascuns `cf-turnstile-response`, limba `ro`; funcționează într-un `<form action>` nativ. Primește de la Server Component proprietatea `offline` (din `TURNSTILE_OFFLINE`, citit pe server la runtime): în acest mod nu încarcă scriptul extern și completează direct câmpul cu `XXXX.DUMMY.TOKEN.XXXX`. Serverul verifică tokenul ca de obicei, iar secretul de test îl acceptă; cu secretul de producție ar fi respins, deci nu există ocolire pe server
- [X] T037 [P] [US1] Schema zod a formularului în `apps/web/lib/validation/self-service.ts` (reguli din T026) și utilitarul `normalizeEmail` (trim + lowercase) în `packages/shared/src/email.ts`
- [X] T038 [US1] Server Action `requestEventCreation` în `apps/web/lib/actions/self-service.ts`, exact în ordinea din contracts/web-interface.md:
  1. validare;
  2. Turnstile;
  3. versiunile documentelor;
  4. `check_rate_limit` pe `authmail:email:{sha256}` (3 / 15 min și 10 / 24 h) și `authmail:ip:{sha256}` (`RATE_LIMIT_IP_PER_HOUR`, implicit 20 / h, validat în `apps/web/lib/server-env.ts`);
  5. `request_self_service_event` + job `auth_email` prin `pgmq.send`, cu clientul service role;
  6. răspuns `{ status: "sent", requestId }`, cu un UUID aleator când cererea e limitată sau honeypot-ul e completat.

  Fără ramificații vizibile după existența adresei.
- [X] T039 [US1] Server Actions `submitCode`, `confirmFromLink` și `resendCode` în `apps/web/lib/actions/self-service.ts`: `verifyOtp` cu `serverSupabase()` (cookie-uri de sesiune), `register_failed_code` la eșec, `complete_auth_request`, apoi redirecționare conform contractului (administratorii spre `/auth/mfa`)
- [X] T040 [US1] Pagina principală `apps/web/app/page.tsx` + `apps/web/components/self-service/CreateEventForm.tsx`: formular nativ cu `useActionState`, câmpurile email / nume / dată, caseta de acceptare nebifată implicit, cu linkuri către `/terms` și `/privacy`, versiunile curente ca câmpuri ascunse, `TurnstileField`, honeypot `website` ascuns vizual și pentru cititoarele de ecran, erori lângă câmpuri; mobile-first, texte prin `t()`
- [X] T041 [US1] Pagina `apps/web/app/auth/code/page.tsx` + `apps/web/components/self-service/CodeForm.tsx`: câmp numeric (`inputMode="numeric"`, `autoComplete="one-time-code"`, 6 cifre), emailul ținut în formular, „Trimite din nou”, mesajele `INVALID_CODE` / `REQUEST_INVALIDATED` / `REQUEST_EXPIRED`; `Cache-Control: no-store`
- [X] T042 [US1] Înlocuiește `apps/web/app/auth/confirm/route.ts` cu `apps/web/app/auth/confirm/page.tsx` + `apps/web/components/self-service/ConfirmButton.tsx`: `GET` afișează numele evenimentului (citit server-side din `auth_requests` → `events`, doar dacă cererea e `pending`) și butonul „Confirmă”, fără `verifyOtp`; formularul nativ apelează `confirmFromLink`; headerele `no-store` și `Referrer-Policy: no-referrer` (research R2)
- [X] T043 [P] [US1] Paginile `apps/web/app/terms/page.tsx` și `apps/web/app/privacy/page.tsx`: randează Markdown-ul versiunii curente (fără HTML brut), cu versiunea și data intrării în vigoare
- [X] T044 [P] [US1] Structura de mesaje `apps/worker/src/email/messages/ro.ts` (textele emailurilor, cu parametri interpolați; constituția VIII) și șablonul `apps/worker/src/email/templates/confirmare.ts`: funcție pură `(data) → { subject, text, html }`, conform contracts/worker-jobs.md, cu escapare HTML și fără texte scrise direct în șablon
- [X] T045 [US1] Jobul `apps/worker/src/jobs/auth-email.ts` (pașii 1–5 din contract; creează utilizatorul doar pentru `create`; `generateLink({ type: "magiclink" })`; loguri fără adresă, cod sau token) și `apps/worker/src/jobs/auth-rotate.ts`; înregistrează-le în `apps/worker/src/jobs/index.ts`
- [X] T046 [US1] Aliniază `supabase/templates/magic_link.html` la pagina cu buton (link `/auth/confirm?token_hash={{ .TokenHash }}` + `{{ .Token }}` în text), pentru emailurile trimise direct de Auth (research R1, consecințe)
- [X] T047 [US1] Pagina evenimentului pentru `awaiting_activation` în `apps/web/app/events/[eventId]/page.tsx`: codul QR vizibil și descărcabil (rutele QR din 001 permit organizatorului starea `awaiting_activation`), galeria goală cu explicație; panoul complet de stare vine în US3
- [X] T048 [US1] Rulează testele T023–T032 și quickstart scenariile 1–5, 16, 17; toate trec

**Checkpoint**: un vizitator nou își poate crea și confirma evenimentul și descărca codul QR

---

## Phase 4: User Story 2 - Organizatorul revine și își vede toate evenimentele (Priority: P1)

**Goal**: autentificare cu cod/link pentru organizatori (și administratori); lista cu toate evenimentele; creare din cont fără email

**Independent Test**: quickstart scenariile 6 și 7

### Tests for User Story 2 ⚠️

- [ ] T049 [P] [US2] Test DB în `supabase/tests/functions/organizer-create.test.ts`: `create_event_as_organizer` creează direct `awaiting_activation`, cu istoric sursa `organizer`; a (max+1)-a creare dă `AWAITING_LIMIT_REACHED`; evenimentele create de admin nu se numără; dacă ultima acceptare nu e versiunea curentă, fără versiuni dă `TERMS_OUTDATED`, iar cu versiuni scrie acceptarea cu `user_id`
- [ ] T050 [P] [US2] Test de worker în `apps/worker/tests/auth-email.test.ts` (extinde): `auth_email` `login` pentru o adresă inexistentă nu creează utilizator și nu trimite email; pentru o adresă existentă trimite șablonul `autentificare`
- [ ] T051 [P] [US2] Test e2e în `apps/web/tests/e2e/identical-response.spec.ts` (doar `desktop-chromium`, SC-004): trimite prin `request.post` formularele de pe `/` și `/login` (Server Action nativă, cu tokenul Turnstile de test), de câte 20 de ori, alternând adrese existente și adrese noi, fiecare adresă folosită o singură dată. Serverul de test pornește cu `RATE_LIMIT_IP_PER_HOUR=1000`. Se verifică același status HTTP și aceeași redirecționare (în afară de `request` id), iar diferența dintre mediile timpilor e < 100 ms; primele 2 cereri sunt de încălzire și nu se măsoară
- [ ] T052 [P] [US2] Test e2e în `apps/web/tests/e2e/returning-organizer.spec.ts`: un organizator cu un eveniment creat de admin și unul self-service se autentifică pe `/login` cu codul din Mailpit și le vede pe amândouă, cu starea fiecăruia; „Eveniment nou” creează fără email; la limită apare mesajul; administratorul se autentifică cu cod și ajunge la `/auth/mfa`

### Implementation for User Story 2

- [ ] T053 [US2] Migrația `supabase/migrations/20261001001100_organizer_create.sql`: `request_login(p_email)` și `create_event_as_organizer(p_name, p_event_date, p_terms_version, p_privacy_version)`, conform contractului (limită din `self_service_settings`, acceptări, istoric)
- [ ] T054 [US2] Rescrie `requestMagicLink` / `requestMagicLinkForm` din `apps/web/lib/actions/auth.ts` ca `requestLogin` (Turnstile, limitele R8, `request_login` + job `auth_email` `login`, răspuns identic, redirecționare la `/auth/code?request=…`); elimină apelul `signInWithOtp`
- [ ] T055 [US2] Actualizează `apps/web/components/auth/LoginForm.tsx` și `apps/web/app/login/page.tsx`: `TurnstileField`, textul „Îți trimitem un cod și un link”, redirecționare la pagina de cod; păstrează parametrul `next`
- [ ] T056 [P] [US2] Șablonul `apps/worker/src/email/templates/autentificare.ts` (ca `confirmare`, fără numele evenimentului, cu textele în `apps/worker/src/email/messages/ro.ts`) și ramura `login` din `apps/worker/src/jobs/auth-email.ts` (verifică existența utilizatorului prin `auth.admin` înainte de `generateLink`, research R1)
- [ ] T057 [US2] Lista `apps/web/app/events/page.tsx`: toate evenimentele din `organizer_events`, cu eticheta de stare (`awaiting_activation`, `active`, `suspended`, `expired`) și butonul „Eveniment nou”
- [ ] T058 [US2] Pagina `apps/web/app/events/new/page.tsx` + Server Action `createEvent` în `apps/web/lib/actions/organizer.ts`: nume și dată; caseta de acceptare apare doar dacă ultima versiune acceptată nu e cea curentă (FR-041); la succes, redirecționare la `/events/{id}`
- [ ] T059 [US2] Pe `/` (`apps/web/app/page.tsx`), pentru un organizator autentificat, formularul apelează `createEvent` (fără email, Turnstile sau câmp de email; FR-005)
- [ ] T060 [US2] Migrația `supabase/migrations/20261001001200_stale_auth_users.sql`: `purge_stale_auth_users()` pune în coadă `delete_organizer_user` pentru utilizatorii Auth cu `email_confirmed_at is null`, creați cu peste 24 h în urmă, fără evenimente și care nu sunt administratori; `pg_cron` `30 3 * * *`; test în `supabase/tests/functions/cleanup-unconfirmed.test.ts` (extinde)
- [ ] T061 [US2] Actualizează testele e2e din 001 care se autentifică prin link (`apps/web/tests/e2e/support/auth.ts`: `loginWithMagicLink`, `loginAsNewAdmin`) să folosească noul flux (codul din Mailpit); serverul e2e principal are limita per IP ridicată (T006), deci autentificările repetate nu ating limita; rulează suita e2e din 001 pentru regresii
- [ ] T062 [US2] Rulează T049–T052, quickstart 6–7 și suita e2e din 001; toate trec

**Checkpoint**: organizatorii și administratorii se autentifică doar prin cod și link, iar organizatorii își văd toate evenimentele

---

## Phase 5: User Story 3 - Evenimentul în așteptarea activării (Priority: P1)

**Goal**: panoul de stare cu preț, cererea de activare, ștergerea automată a evenimentelor neactivate, cu avertizare

**Independent Test**: quickstart scenariile 8 (partea organizatorului), 9, 14 (partea neactivată), 15

### Tests for User Story 3 ⚠️

- [ ] T063 [P] [US3] Test DB în `supabase/tests/functions/activation-request.test.ts`: `request_activation` doar pentru proprietar și starea `awaiting_activation`; a doua cerere în < 24 h dă `ACTIVATION_REQUEST_TOO_SOON` (cu `retryAt`); jobul `admin_activation_notice` e pus în coadă; cererea nu schimbă starea
- [ ] T064 [P] [US3] Test DB în `supabase/tests/functions/cleanup-unactivated.test.ts`: `purge_unactivated_events()` șterge evenimentele cu `pending_purge_at <= now()` și scrie `auto_deleted_unactivated` în `app_audit_log`; pune în coadă `delete_organizer_user` doar dacă adresa nu mai are evenimente; `enqueue_activation_notices()` rulat de două ori pune o singură notificare `activation_7d` per (eveniment, `pending_purge_at`), iar după schimbarea datei, încă una; un eveniment activat după ce `pending_purge_at` a trecut, dar înainte de rularea curățeniei, nu este șters (cazul limită „activare în ultima zi”)
- [ ] T065 [P] [US3] Test de worker în `apps/worker/tests/activation-emails.test.ts`: `admin_activation_notice` trimite la `ADMIN_NOTIFY_EMAILS` (sau adresele din `platform_admins`) numele, data, emailul organizatorului și linkul de administrare; `retention_notice` `activation_7d` trimite `stergere-neactivat` cu data ștergerii și prețul pachetului
- [ ] T066 [P] [US3] Test e2e în `apps/web/tests/e2e/awaiting-activation.spec.ts`: panoul arată starea, prețul pachetului, ce include, data ștergerii automate și „Solicită activarea”; după apăsare, emailul apare în Mailpit, iar butonul arată data cererii și devine indisponibil

### Implementation for User Story 3

- [ ] T067 [US3] Migrația `supabase/migrations/20261001001300_activation_requests.sql`: `activation_requests (id, event_id FK on delete cascade, requested_at)`, cu RLS (proprietarul citește, adminul citește tot); `request_activation(p_event_id)` conform contractului
- [ ] T068 [US3] Migrația `supabase/migrations/20261001001400_cleanup_unactivated.sql`: `purge_unactivated_events()`, `enqueue_activation_notices()` (pragul `activation_7d`, unic per eveniment și dată) și joburile `pg_cron` `purge-unactivated` `5 * * * *` și `activation-notices` `10 * * * *`
- [ ] T069 [P] [US3] Șabloanele `apps/worker/src/email/templates/activare-solicitata.ts` și `apps/worker/src/email/templates/stergere-neactivat.ts` (textele în `apps/worker/src/email/messages/ro.ts`); jobul `apps/worker/src/jobs/admin-activation-notice.ts`; ramura `activation_7d` în `apps/worker/src/jobs/retention-notice.ts`; configurarea `ADMIN_NOTIFY_EMAILS` în `apps/worker/src/config.ts`
- [ ] T070 [US3] `apps/web/components/self-service/EventStatusPanel.tsx`, afișat pe `apps/web/app/events/[eventId]/page.tsx`: starea, prețul curent din `packages` (formatat în lei, 001/FR-046), durata de păstrare și limita per invitat, data ștergerii automate (`pending_purge_at`), butonul „Solicită activarea” sau data ultimei cereri
- [ ] T071 [US3] Server Action `requestActivation` în `apps/web/lib/actions/organizer.ts` (apelează `request_activation`; mesajul `ACTIVATION_REQUEST_TOO_SOON` afișează când se poate cere din nou)
- [ ] T072 [US3] Rulează T063–T066 și quickstart 9, 14, 15; toate trec

**Checkpoint**: evenimentul neactivat e complet (vizibil, cu cerere de activare și ștergere automată la termen)

---

## Phase 6: User Story 4 - Administratorul gestionează evenimentele self-service (Priority: P2)

**Goal**: activare idempotentă, suspendare/reactivare cu motiv, lista filtrabilă și istoricul

**Independent Test**: quickstart scenariile 10, 11, 12

### Tests for User Story 4 ⚠️

- [ ] T073 [P] [US4] Test DB în `supabase/tests/functions/activate-event.test.ts`:
  - `activate_event` copiază pachetul în eveniment (`package_id`, `base_price_minor`, `max_files_per_guest`, `max_photo_bytes`, `max_video_bytes`, `retention_option_id`), setează `activated_at`, golește `pending_purge_at`, calculează `upload_starts_at` = activarea, `upload_ends_at` = sfârșitul zilei `max(event_date, data activării) + 1` (ora României) și `purge_at` (001/FR-040);
  - a doua activare nu schimbă nimic și scrie `active → active` cu nota „activare repetată”; aceeași `external_ref` a doua oară nu scrie nimic;
  - motivul lipsă dă `REASON_REQUIRED`; din `suspended` sau `unconfirmed` dă `INVALID_TRANSITION`;
  - modificarea ulterioară a pachetului nu schimbă evenimentul (FR-016).
- [ ] T074 [P] [US4] Test DB în `supabase/tests/functions/suspend-event.test.ts`:
  - `suspend_event` / `reactivate_event` cer admin aal2 și motiv; arhivele nu se modifică;
  - în `suspended`, organizatorul citește fișierele, obține URL-uri semnate, șterge fișiere și cere arhiva;
  - `extend_retention` și `organizer_update_event` sunt refuzate (FR-028a); `extend_retention` e refuzat și pentru `awaiting_activation` (FR-020);
  - `admin_update_pending_event` modifică numele și data doar pentru `awaiting_activation` (FR-028).
- [ ] T075 [P] [US4] Test e2e în `apps/web/tests/e2e/admin-self-service.spec.ts`: lista cu filtrele origine / stare / „activare solicitată” și coloanele FR-027; activarea cu motiv (dialog de confirmare) și istoricul; suspendarea și reactivarea; organizatorul suspendat vede mesajul și nu are butoanele de modificare sau prelungire; adminul nu are acces la fișiere (001/FR-007)

### Implementation for User Story 4

- [ ] T076 [US4] Migrația `supabase/migrations/20261001001500_activation.sql`: `activate_event`, `suspend_event`, `reactivate_event`, `admin_update_pending_event` conform contractului (idempotență, `external_ref` unic, motiv obligatoriu 1–500 caractere, executare `is_admin()` pentru sursa `admin` și `service_role` pentru `payment`); `extend_retention` refuză `suspended` și `awaiting_activation` (FR-020); funcția `admin_event_stats` din 001 întoarce și `origin`, `status`, `pending_purge_at` și ultima cerere de activare
- [ ] T077 [US4] Server Actions `activateEvent`, `suspendEvent`, `reactivateEvent`, `updatePendingEvent` în `apps/web/lib/actions/admin.ts` (aal2 + `platform_admins`, `reason` 1–500); formularul de editare din 001 (`apps/web/components/admin/EventForm.tsx`, `updateEvent`) afișează pentru evenimentele `awaiting_activation` doar numele și data și apelează `updatePendingEvent` (FR-028)
- [ ] T078 [US4] Lista `apps/web/app/admin/events/page.tsx`: filtre (origine, stare, „activare solicitată”) prin `searchParams`; coloanele din FR-027 (nume, dată, email, stare, data creării, ultima cerere de activare și, pentru active/suspendate, fișiere, spațiu, data ștergerii)
- [ ] T079 [US4] Pagina `apps/web/app/admin/events/[eventId]/page.tsx` + `apps/web/components/admin/EventStateActions.tsx` (dialog de confirmare cu motiv obligatoriu, acțiunile permise de starea curentă) + `apps/web/components/admin/StatusHistory.tsx` (tabel: moment, din → în, sursă, autor, motiv, referință)
- [ ] T080 [US4] Organizatorul, pentru `suspended`, în `apps/web/app/events/[eventId]/page.tsx`: mesajul de suspendare, galeria fără abonarea Realtime (`apps/web/lib/realtime/`), fără butoanele de prelungire și modificare; descărcarea și ștergerea rămân
- [ ] T081 [US4] Rulează T073–T075 și quickstart 10–12; toate trec

**Checkpoint**: administratorul poate transforma o cerere în eveniment activ și poate suspenda

---

## Phase 7: User Story 5 - Administratorul configurează pachetul complet (Priority: P2)

**Goal**: pachetul și setările, editabile fără cod

**Independent Test**: schimbarea prețului afectează doar activările ulterioare; valorile invalide sunt refuzate

### Tests for User Story 5 ⚠️

- [ ] T082 [P] [US5] Test DB în `supabase/tests/rls/packages.test.ts`: organizatorul citește `packages`, dar nu îl modifică; adminul aal1 nu îl modifică; adminul aal2 da; check-urile refuză `price_minor < 0`, `max_files_per_guest = 0`, `max_photo_bytes > 52428800`, `max_video_bytes > 1073741824`, o opțiune de retenție inactivă, `max_awaiting_events_per_organizer` în afara 1–20
- [ ] T083 [P] [US5] Test e2e în `apps/web/tests/e2e/admin-package.spec.ts`: modifică prețul, apoi evenimentul neactivat afișează noul preț, iar unul activ îl păstrează pe cel vechi; valorile invalide dau erori lângă câmpuri

### Implementation for User Story 5

- [ ] T084 [US5] Server Actions `updatePackage` și `updateSelfServiceSettings` în `apps/web/lib/actions/admin.ts` (zod cu aceleași limite ca check-urile din T015; prețul introdus în lei, salvat în bani)
- [ ] T085 [US5] Pagina `apps/web/app/admin/package/page.tsx` + `apps/web/components/admin/PackageForm.tsx` (preț, fișiere per invitat, dimensiuni maxime în MB, opțiunea de retenție inclusă din catalog, limita de evenimente în așteptare); link în navigația de administrare din `apps/web/app/admin/layout.tsx`
- [ ] T086 [US5] Rulează T082–T083; toate trec

**Checkpoint**: pachetul se configurează din interfață

---

## Phase 8: User Story 6 - Invitatul primește un mesaj clar când nu poate încărca (Priority: P2)

**Goal**: mesaje politicoase pentru evenimentele neactivate și suspendate; refuz pe server

**Independent Test**: quickstart scenariile 8 și 12 (partea invitatului)

### Tests for User Story 6 ⚠️

- [ ] T087 [P] [US6] Test DB în `supabase/tests/functions/guest-upload.test.ts` (extinde): `resolve_event_for_guest` întoarce starea; `start_guest_session` și `reserve_upload` dau `EVENT_NOT_ACTIVATED` pentru `awaiting_activation`, `EVENT_SUSPENDED` pentru `suspended` și `EVENT_NOT_FOUND` pentru `unconfirmed`; un fișier rezervat înainte de suspendare și finalizat după este respins cu `processing_error = 'EVENT_SUSPENDED'`
- [ ] T088 [P] [US6] Test e2e în `apps/web/tests/e2e/guest-states.spec.ts`: `/e/{token}` pentru un eveniment neactivat arată numele și mesajul, fără formular; pentru unul suspendat arată mesajul fără motiv; pentru unul `unconfirmed`, „nu a fost găsit”; un upload în curs când adminul suspendă evenimentul marchează fișierele rămase cu mesajul politicos

### Implementation for User Story 6

- [ ] T089 [US6] Migrația `supabase/migrations/20261001001600_guest_states.sql`: `resolve_event_for_guest`, `start_guest_session`, `reserve_upload` și triggerul de finalizare din 001 tratează stările noi conform contractului
- [ ] T090 [US6] `apps/web/app/e/[token]/page.tsx` și `apps/web/lib/guest/`: mesajele `guest.notActivated` și `guest.suspended` (texte în `apps/web/lib/i18n/messages/ro.ts`); coada de upload (`apps/web/lib/upload/`) afișează `EVENT_SUSPENDED` pe fișierele refuzate, fără eroare tehnică
- [ ] T091 [US6] Rulează T087–T088 și testul LCP din 001 (`apps/web/tests/e2e/lcp.spec.ts`) pentru pagina invitatului; toate trec

**Checkpoint**: invitații nu văd niciodată erori tehnice pentru stările noi

---

## Phase 9: User Story 7 - Organizatorul își modifică sau șterge evenimentul (Priority: P2)

**Goal**: modificarea numelui și a datei; ștergerea definitivă a oricărui eveniment propriu

**Independent Test**: quickstart scenariul 13

### Tests for User Story 7 ⚠️

- [ ] T092 [P] [US7] Test DB în `supabase/tests/functions/organizer-update.test.ts`:
  - `organizer_update_event` doar pentru proprietar, stările `awaiting_activation` / `active`, nume 1–120 și dată azi…+2 ani;
  - pentru self-service activ recalculează perioada de upload (FR-034), iar după sfârșitul uploadului `purge_at` nu se schimbă;
  - pentru `awaiting_activation` recalculează `pending_purge_at`;
  - tokenul public rămâne neschimbat.
- [ ] T093 [P] [US7] Test DB în `supabase/tests/functions/admin.test.ts` (extinde `request_event_deletion`): organizatorul proprietar poate șterge (alt organizator nu); un eveniment niciodată activat dispare direct; unul activat trece prin `deleting` cu istoric sursa `organizer`, iar rândul de facturare se păstrează conform 001
- [ ] T094 [P] [US7] Test e2e în `apps/web/tests/e2e/organizer-edit.spec.ts`: redenumire și schimbarea datei (codul QR descărcat înainte și după e identic ca link); ștergere cu numele tastat greșit (refuz), apoi corect; linkul invitatului dă „nu a fost găsit”; URL-urile semnate emise anterior întorc ≥ 400 în ≤ 60 s (001/SC-011)

### Implementation for User Story 7

- [ ] T095 [US7] Migrația `supabase/migrations/20261001001700_organizer_edit.sql`: `organizer_update_event` și `request_event_deletion` extinsă (organizator proprietar; ștergere directă dacă `activated_at is null`), conform contractului
- [ ] T096 [US7] `apps/web/components/self-service/EditEventForm.tsx` și `apps/web/components/self-service/DeleteEventDialog.tsx` (reutilizează logica din `apps/web/components/admin/DeleteEventDialog.tsx`: tastarea numelui) pe `apps/web/app/events/[eventId]/page.tsx`; Server Actions `updateEvent` și `deleteEvent` în `apps/web/lib/actions/organizer.ts`
- [ ] T097 [US7] Rulează T092–T094; toate trec

**Checkpoint**: toate poveștile funcționează independent

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T098 [P] Accesibilitate: extinde `apps/web/tests/e2e/a11y.spec.ts` cu `/`, `/auth/code`, `/auth/confirm`, `/terms`, `/privacy`, `/events/new`, panoul de stare, `/admin/package` și `/admin/events/[id]` (acțiuni + istoric); 0 încălcări WCAG 2.2 AA în cele trei proiecte
- [ ] T099 [P] Performanță: test LCP pentru `/` pe profilul mobil throttled, în `apps/web/tests/e2e/lcp.spec.ts` (< 2,5 s), cu Turnstile încărcat `async` și fără efect asupra LCP
- [ ] T100 [P] Test e2e de tip smoke `apps/web/tests/e2e/turnstile-widget.spec.ts`, în proiectul `turnstile-smoke` (portul 3003, fără `TURNSTILE_OFFLINE`, desktop Chromium): scriptul real de pe `challenges.cloudflare.com` se încarcă cu nonce-ul CSP, fără încălcări CSP în consolă, iar widgetul produce un token acceptat de server (evenimentul se creează)
- [ ] T101 [P] Test unitar `apps/web/tests/unit/no-secrets-in-client.test.ts` (extinde): `TURNSTILE_SECRET_KEY` nu apare în bundle-ul client
- [ ] T102 [P] Documentație: `README.md` (variabilele noi, Cloudflare în lista de procesatori cu DPA, fluxul de autentificare cu cod), `apps/worker/deploy/scaleway-container.md` (`ADMIN_NOTIFY_EMAILS`) și nota de informare de pe pagina invitatului, dacă menționează procesatorii
- [ ] T103 Actualizează `.github/workflows/ci.yml` dacă e nevoie (cheile de test Turnstile vin din `scripts/ci-env.mjs`, T001) și rulează toată suita local: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:db`, testele worker în imaginea Docker, `pnpm test:e2e`
- [ ] T104 Validare manuală: toate cele 17 scenarii din `specs/002-self-service-events/quickstart.md`; pe preview, SC-008 (Gmail, Outlook, Yahoo), o singură dată, conform regulii de a limita testele cu email real
- [ ] T105 Raportul de implementare `specs/002-self-service-events/raport-implementare.md`, conform constituției v1.2.0 (ce, cum, verificare cu cifre, limitări și pași următori)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: fără dependențe
- **Foundational (Phase 2)**: după Setup; blochează toate poveștile. T011 → T012 → T013 → T014; T015, T017, T019 după T013; T016 după T015; T020 după T012; T021 după toate migrațiile fazei
- **US1 (Phase 3)**: după Foundational
- **US2 (Phase 4)**: după US1 (refolosește `auth_requests`, `auth_email`, pagina de cod și confirmare)
- **US3 (Phase 5)**: după US1 (are nevoie de evenimente `awaiting_activation`)
- **US4 (Phase 6)**: după US3 (activarea pornește din `awaiting_activation`; filtrul „activare solicitată” folosește `activation_requests`)
- **US5 (Phase 7)**: după Foundational; independentă de US1–US4 (testul e2e folosește activarea din US4)
- **US6 (Phase 8)**: după Foundational; testele pot seta starea direct prin SQL; e2e-ul cu suspendare în timpul uploadului folosește US4
- **US7 (Phase 9)**: după US1
- **Polish (Phase 10)**: după toate poveștile dorite

### Within Each User Story

- testele întâi, rulate și văzute eșuând;
- migrațiile înaintea Server Actions, Server Actions înaintea paginilor;
- worker-ul (șabloane → job) în paralel cu partea web;
- sarcina de rulare de la finalul fiecărei faze e poarta fazei.

### Parallel Opportunities

- Setup: T003–T007 în paralel.
- Foundational: testele T008–T010 în paralel; T018 în paralel cu migrațiile.
- US1: testele T023–T031 în paralel (T032 rulează pe serverul separat `captcha-reject`); T035, T036, T037, T043, T044 în paralel după T033.
- După US1: US3, US5, US6 și US7 pot avansa în paralel; US2 și US4 au dependențele de mai sus.

---

## Parallel Example: User Story 1

```bash
# Testele (toate eșuează înainte de implementare):
Task: "Test DB auth-requests în supabase/tests/functions/auth-requests.test.ts"
Task: "Test DB unconfirmed în supabase/tests/rls/unconfirmed.test.ts"
Task: "Test worker auth-email în apps/worker/tests/auth-email.test.ts"
Task: "Test e2e în apps/web/tests/e2e/self-service.spec.ts"

# După migrația T033:
Task: "verifyTurnstile în apps/web/lib/security/turnstile.ts"
Task: "TurnstileField în apps/web/components/security/TurnstileField.tsx"
Task: "Schema zod în apps/web/lib/validation/self-service.ts"
Task: "Șablonul confirmare în apps/worker/src/email/templates/confirmare.ts"
Task: "Paginile /terms și /privacy"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2 (stările, istoricul, pachetul, documentele legale).
2. Phase 3 (US1): creare, confirmare prin cod și link, codul QR.
3. **STOP și VALIDARE**: quickstart 1–5, 16, 17. Un client nou își pregătește evenimentul fără
   administrator; activarea se poate face temporar prin SQL (`activate_event`) până la US4.

### Incremental Delivery

1. US1 → MVP (creare self-service).
2. US2 → autentificarea tuturor pe noul mecanism; lista unificată.
3. US3 → cerere de activare și curățenie automată (necesară înainte de producție, din motive GDPR).
4. US4 → activarea din interfață (fluxul comercial complet).
5. US5, US6, US7 → configurare, mesajele invitaților, editare și ștergere.

**Pentru producție** sunt necesare cel puțin US1–US4 și US6: fără US6, un invitat care scanează
un cod QR neactivat ar vedea un eveniment „negăsit”.

---

## Notes

- [P] = fișiere diferite, fără dependențe nefinalizate
- fiecare poveste se poate testa independent
- testele cu email real se rulează o singură dată, la final (T104); restul folosesc Mailpit
- commit după fiecare sarcină sau grup logic, pe `002-self-service-events`; fără push până la acordul explicit

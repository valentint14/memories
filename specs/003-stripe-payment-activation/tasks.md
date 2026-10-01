---
description: "Task list for 003 — activarea evenimentului prin plată online (Stripe)"
---

# Tasks: Activarea evenimentului prin plată online (Stripe)

**Input**: Design documents from `/specs/003-stripe-payment-activation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluse. Constituția (VI) cere testele pentru fluxurile critice scrise înainte și
verificate că eșuează înainte de implementare. Plata e flux critic (activează uploadul).

**Organization**: sarcinile sunt grupate pe povești de utilizator (US1–US4 din spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: poate rula în paralel (fișiere diferite, fără dependențe nefinalizate)
- **[Story]**: povestea de utilizator (US1…US4)

## Path Conventions

Monorepo din 001/002: `apps/web/`, `apps/worker/`, `packages/shared/`, `supabase/`. Migrațiile
noi încep de la `supabase/migrations/20261002000100_*.sql`. Funcțiile SQL: `security definer`,
`set search_path = ''`, erori prin `raise_app_error`. Mesajele din coadă (`media_jobs`) folosesc
câmpuri `snake_case`, ca `apps/worker/src/jobs/types.ts`. Butoanele din foi trec prin
`SheetActions`; textele prin `t()`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependența Stripe, variabilele de mediu, simulatorul pentru teste, coduri de eroare

- [ ] T001 Adaugă dependența `stripe` la versiunea exactă `22.6.2` în `apps/web/package.json` (fără `^`, research R2) și actualizează `pnpm-lock.yaml` cu `corepack pnpm install`
- [ ] T002 [P] Adaugă în `apps/web/lib/server-env.ts` getter-ele `stripeSecretKey` (obligatoriu; dacă începe cu `sk_live_` și `NODE_ENV !== "production"`, aruncă eroare „cheie live în afara producției”, FR-019), `stripeWebhookSecret` (obligatoriu) și `stripeApiBase` (opțional, `null` dacă lipsește); documentează-le în `apps/web/.env.example` (sau fișierul de exemplu existent) și în `deploy/web.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
- [ ] T003 [P] În `scripts/ci-env.mjs` adaugă pentru `apps/web/.env.local`: `STRIPE_SECRET_KEY=sk_test_ci`, `STRIPE_WEBHOOK_SECRET=whsec_test_ci_secret`, `STRIPE_API_BASE=http://127.0.0.1:12111`; în `.github/workflows/ci.yml` pornește containerul `stripe/stripe-mock` (port 12111 HTTP) înainte de pasul `pnpm test:e2e` și de testele unitare web (research R9)
- [ ] T004 [P] Adaugă codurile de eroare `PAYMENT_NOT_ALLOWED`, `PAYMENT_WINDOW_CLOSED`, `PAYMENT_UNAVAILABLE` în `packages/shared/src/errors.ts` și mesajele lor în `apps/web/lib/i18n/messages/ro.ts` (`errors.*`), cu textele din `contracts/web-interface.md` › „Mesajele organizatorului”
- [ ] T005 [P] CSP: în `apps/web/lib/security/csp.ts` schimbă directiva în `form-action 'self' https://checkout.stripe.com` (research R10); extinde `apps/web/tests/unit/csp.test.ts` (sau creează-l) cu o verificare a directivei

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tabelele de plăți, clientul Stripe, webhook-ul de bază și activarea cu plată, de care depind toate poveștile

**⚠️ CRITICAL**: nicio poveste nu începe înainte de finalizarea acestei faze

### Tests (scrise înainte, trebuie să eșueze)

- [ ] T006 [P] Test DB pentru RLS și constrângeri în `supabase/tests/rls/payments.test.ts`: `payments` și `stripe_webhook_events` au RLS activ; organizatorul și `anon` nu pot citi sau scrie direct; administratorul aal2 citește; indexul unic parțial „`(event_id, purpose) where status = 'open'`” refuză a doua plată deschisă; indexul „`(event_id) where purpose = 'activation' and status = 'paid'`” refuză a doua activare plătită; check-urile „`status = 'paid'` ⇒ `paid_at` și `stripe_payment_intent_id` nenule”, „`status = 'refund_due'` ⇒ `refund_reason` nenul”, „`currency = 'ron'`”, „`amount_minor > 0`”; extinde și `supabase/tests/rls/rls-enabled.test.ts` cu cele două tabele
- [ ] T007 [P] Test DB pentru `activate_event` cu plată în `supabase/tests/functions/activate-event.test.ts` (extinde): sursa `payment` fără `p_payment_id` → `FORBIDDEN`; sursa `admin` cu `p_payment_id` → `FORBIDDEN`; cu plată, evenimentul primește `base_price_minor`, `retention_option_id`, `retention_months` și `retention_surcharge_minor` din plată chiar dacă pachetul și opțiunea s-au schimbat după pregătirea plății (research R6), iar `final_price_minor` = `amount_minor`; activarea manuală (sursa `admin`) funcționează ca în 002
- [ ] T008 [P] Test unitar pentru webhook în `apps/web/tests/unit/stripe-webhook.test.ts`: corp cu semnătură invalidă sau lipsă → 400 și nicio funcție SQL apelată; semnătură validă (generată cu `stripe.webhooks.generateTestHeaderString` și `whsec_test_ci_secret`) → `record_webhook_event` apelat; eveniment deja procesat → 200 fără alte apeluri; tip necunoscut → 200 cu `outcome = 'ignored'`; corp peste 1 MB → 413; excepție în tratare → 500 și `finish_webhook_event` neapelat (contracts/stripe-webhooks.md)

### Implementation

- [ ] T009 Migrația `supabase/migrations/20261002000100_payments.sql`: enum-urile `payment_purpose ('activation','retention_extension')` și `payment_status ('open','paid','failed','expired','refund_due')`; `alter type public.retention_actor add value 'payment'`; tabelul `payments` exact ca în data-model.md (coloane, tipuri, `on delete set null` pentru `event_id` și `created_by`, check-urile, cei doi indecși unici parțiali, indecși pe `stripe_session_id` și `stripe_payment_intent_id`, trigger `updated_at`); tabelul `stripe_webhook_events (id text pk, type text not null, received_at timestamptz not null default now(), processed_at timestamptz null, outcome text null)`; RLS activ pe ambele, politică `select` doar pentru `is_admin()`; fără `insert/update/delete` pentru clienți
- [ ] T010 Migrația `supabase/migrations/20261002000200_activation_payment.sql`: `drop function public.activate_event(uuid, public.status_change_source, text, text)` și recreează-o cu `p_payment_id uuid default null` conform contracts/database-functions.md (sursa `payment` cere plata, sursa `admin` o interzice; cu plată, prețul și opțiunea vin din rândul `payments`, cu un marcaj local tranzacției care face triggerul de retenție din 001 să păstreze snapshot-urile din plată în loc să le recitească din opțiune); reacordă `execute` ca în 002 (`authenticated`, `service_role`; `revoke` de la `public`, `anon`)
- [ ] T011 Migrația `supabase/migrations/20261002000300_payment_log.sql`: funcțiile `record_webhook_event(p_id text, p_type text) → boolean` și `finish_webhook_event(p_id text, p_outcome text) → void` (execuție doar `service_role`), conform contracts/database-functions.md
- [ ] T012 Regenerează `packages/shared/src/db.types.ts` cu `corepack pnpm db:types` după migrațiile T009–T011
- [ ] T013 [P] Clientul Stripe în `apps/web/lib/stripe/client.ts` (`import "server-only"`): instanță unică `new Stripe(serverEnv.stripeSecretKey, { apiVersion: <versiunea implicită a SDK-ului instalat, fixată explicit>, maxNetworkRetries: 2, timeout: 10000, ...host/port/protocol din serverEnv.stripeApiBase dacă e setat })`
- [ ] T014 Route Handler `apps/web/app/api/stripe/webhook/route.ts` (`export const runtime = "nodejs"`, `dynamic = "force-dynamic"`): pașii 1–5 din contracts/stripe-webhooks.md › Endpoint, cu tratarea tipurilor delegată la `apps/web/lib/stripe/webhook.ts` (funcție `handleStripeEvent(event)` care întoarce `outcome`; în această fază tratează doar „orice alt tip” → `ignored`); apelurile SQL cu clientul service role (`adminSupabase()`); logurile fără corp, email sau date de facturare (doar `event.id`, `type`, `outcome`)

**Checkpoint**: T006–T008 trec; webhook-ul acceptă evenimente semnate și le deduplică

---

## Phase 3: User Story 1 - Organizatorul plătește și evenimentul devine activ (Priority: P1) 🎯 MVP

**Goal**: organizatorul alege perioada de păstrare, plătește pe Stripe Checkout și evenimentul devine activ automat, cu prețul plătit (FR-001–FR-006, FR-009, FR-010, FR-012, FR-012a)

**Independent Test**: un eveniment self-service, plătit (stripe-mock în CI / card de test local), devine activ cu prețul, opțiunea și data ștergerii din plată, fără acțiunea administratorului; istoricul are sursa „sistem de plăți” și referința

### Tests for User Story 1 ⚠️

- [ ] T015 [P] [US1] Test DB în `supabase/tests/functions/payments.test.ts`: `prepare_payment` pentru `activation` — doar proprietarul (`PAYMENT_NOT_ALLOWED` altfel), doar `awaiting_activation`, opțiune activă (`OPTION_INACTIVE`), suma = prețul pachetului + suplimentul opțiunii, `p_expected_amount_minor` diferit → `PRICE_CHANGED` cu suma nouă, `expires_at` ≤ acum + 24 h și ≤ `pending_purge_at` − 1 h, sub 30 min de fereastră → `PAYMENT_WINDOW_CLOSED`; `complete_payment` pe o plată `open` → plată `paid` cu datele de facturare, eveniment `active` cu sursa `payment` și `external_ref` = sesiunea, job `payment_confirmation` în `media_jobs`; a doua apelare cu aceeași sesiune → același `outcome`, fără rând nou în istoric și fără al doilea job (FR-006); `organizer_payment_state` întoarce ultima plată doar proprietarului
- [ ] T016 [P] [US1] Test unitar în `apps/web/tests/unit/stripe-checkout.test.ts`: `createCheckoutSession` trimite exact parametrii din contracts/stripe-webhooks.md › Crearea sesiunii (`mode`, `price_data` cu `currency: "ron"` și `unit_amount`, `billing_address_collection: "required"`, `tax_id_collection.enabled`, `receipt_email`, `metadata.payment_id/event_id/purpose`, `expires_at`, `locale: "ro"`, `success_url` cu `{CHECKOUT_SESSION_ID}`, `cancel_url`) și cheia de idempotență = `payment_id`; extragerea datelor de facturare din `customer_details` (nume, adresă, `business_name`, primul `tax_ids[].value`)
- [ ] T017 [P] [US1] Test unitar în `apps/web/tests/unit/stripe-webhook.test.ts` (extinde): `checkout.session.completed` cu `payment_status: "paid"` → `complete_payment(session.id, session.payment_intent, billing)`; cu `"unpaid"` → nimic; `checkout.session.async_payment_succeeded` → `complete_payment`
- [ ] T018 [P] [US1] Test worker în `apps/worker/tests/payment-confirmation.test.ts`: jobul `payment_confirmation` pentru o plată `paid` de activare trimite (Mailpit) emailul `plata-confirmata` cu suma, data, evenimentul, perioada și data ștergerii, mențiunea despre chitanța Stripe și linkul; pentru o plată care nu e `paid` nu trimite nimic; numele evenimentului e escapat în HTML
- [ ] T019 [P] [US1] Test e2e în `apps/web/tests/e2e/payment.spec.ts` (desktop + mobil): organizator nou, eveniment în așteptare; foaia arată opțiunile de păstrare cu preț și dată, cea inclusă preselectată; „Plătește și activează” face redirect spre URL-ul sesiunii (de la stripe-mock); testul trimite apoi la `/api/stripe/webhook` un `checkout.session.completed` semnat pentru plata creată și verifică evenimentul activ, banda „Plată primită” și istoricul; axe pe pagină

### Implementation for User Story 1

- [ ] T020 [US1] Migrația `supabase/migrations/20261002000400_payment_functions.sql`: `prepare_payment` (ramura `activation`; fără reluarea plății deschise, care vine în T034 — până atunci o a doua plată deschisă e refuzată de indexul unic), `attach_checkout_session`, `complete_payment` (ramura `activation`, cu `refund_due` pentru eveniment neeligibil, a doua plată sau eveniment șters, conform contracts/database-functions.md), `expire_payment_by_id`, `organizer_payment_state`; joburile `payment_confirmation` / `admin_payment_notice` prin `pgmq.send('media_jobs', …)`; `grant execute` doar rolurilor din contract
- [ ] T021 [US1] Regenerează `packages/shared/src/db.types.ts` după T020
- [ ] T022 [P] [US1] `apps/web/lib/stripe/checkout.ts` (`server-only`): `createCheckoutSession(payment, event, organizerEmail)`, `expireCheckoutSession(id)` (ignoră eroarea „deja expirată / finalizată”), `retrieveCheckoutSession(id)`, `billingFromSession(session)` — conform contracts/stripe-webhooks.md
- [ ] T023 [US1] `apps/web/lib/stripe/webhook.ts`: tratează `checkout.session.completed` (doar `payment_status = "paid"`) și `checkout.session.async_payment_succeeded` → `complete_payment` (contracts/stripe-webhooks.md › tabel); evenimentele fără `metadata.payment_id` → `ignored`
- [ ] T024 [US1] Server Actions în `apps/web/lib/actions/payments.ts`: `startPayment({ eventId, purpose, optionId, expectedAmountMinor })` (zod, `prepare_payment` cu clientul organizatorului, reluare / înlocuire sesiune, `createCheckoutSession`, `attach_checkout_session`, `redirect(url)`; la eșecul Stripe → `expire_payment_by_id` și `PAYMENT_UNAVAILABLE`) și `paymentState(eventId)` (contracts/web-interface.md)
- [ ] T025 [US1] Verificarea la întoarcere în `apps/web/app/events/[eventId]/page.tsx`: pentru `?plata={sessionId}` (format `cs_…`), `retrieveCheckoutSession`, verifică `metadata.event_id`, apoi `complete_payment` dacă `payment_status = "paid"`; `?plata=anulata` doar afișează mesajul; nicio activare pe baza parametrului singur (FR-004)
- [ ] T026 [US1] Componenta `apps/web/components/self-service/PayActivationForm.tsx`: radio cu opțiunile active din catalog (preț final și data ștergerii estimată pentru fiecare, cea inclusă preselectată), formular nativ cu acțiunea `startPayment` și `SheetActions` cu „Plătește și activează”; mesajele de eroare din T004 ca `status` deasupra butonului
- [ ] T027 [US1] Componenta `apps/web/components/self-service/PaymentStatus.tsx` (client): pentru „plata se confirmă” reîntreabă `paymentState` la 3 s, cel mult 2 minute, apoi `router.refresh()` când devine `paid`; mesajele din contracts/web-interface.md cu `role="status"`
- [ ] T028 [US1] Actualizează `apps/web/components/self-service/EventStatusPanel.tsx` și pagina `apps/web/app/events/[eventId]/page.tsx` (ramura `awaiting_activation`): `PayActivationForm` în locul `RequestActivationButton`, `PaymentStatus` când există plată deschisă sau parametrul `plata`; banda de cifre arată „Plată” în locul „Cerere de activare”; după activare, banda „Plată primită pe {dată}” pe pagina evenimentului activ
- [ ] T029 [P] [US1] Worker: jobul `apps/worker/src/jobs/payment-confirmation.ts` (înregistrat în `apps/worker/src/jobs/index.ts` și `types.ts`), șablonul `apps/worker/src/email/templates/plata-confirmata.ts` și textele în `apps/worker/src/email/messages/ro.ts` (contracts/worker-jobs.md)
- [ ] T030 [P] [US1] Textele noi ale interfeței în `apps/web/lib/i18n/messages/ro.ts`: foaia de activare (opțiuni, buton, stări ale plății, banda „Plată primită”)

**Checkpoint**: US1 funcționează cap-coadă cu stripe-mock și, manual, cu Stripe în modul test (quickstart, scenariile 1, 2, 5)

---

## Phase 4: User Story 2 - Plata eșuată sau abandonată nu blochează evenimentul (Priority: P1)

**Goal**: plățile refuzate, abandonate sau expirate lasă evenimentul în așteptare, fără dublă încasare (FR-007, FR-008, FR-011)

**Independent Test**: refuz, abandon și expirare lasă evenimentul în așteptare; o nouă încercare îl activează; două plăți reușite produc o singură activare și o plată `refund_due`

### Tests for User Story 2 ⚠️

- [ ] T031 [P] [US2] Test DB în `supabase/tests/functions/payments.test.ts` (extinde): `prepare_payment` cu o plată `open` cu aceeași opțiune și sumă, care expiră peste ≥ 10 min → `reuse_url`, fără rând nou; cu altă opțiune sau sub 10 min → vechea plată `expired`, `replaced_session_id` întors, plată nouă; `fail_payment` și `expire_payment` schimbă doar plățile `open`; a doua plată reușită pentru același eveniment → `refund_due` (`DUPLICATE_PAYMENT`) + job `admin_payment_notice`; plată reușită pentru eveniment activat manual între timp → `refund_due` (`EVENT_NOT_AWAITING`); pentru eveniment șters (`event_id` null) → `refund_due` (`EVENT_DELETED`); jobul `expire-open-payments` marchează `expired` plățile `open` cu `expires_at` < acum − 1 h
- [ ] T032 [P] [US2] Test unitar în `apps/web/tests/unit/stripe-webhook.test.ts` (extinde): `checkout.session.async_payment_failed` → `fail_payment`; `checkout.session.expired` → `expire_payment`
- [ ] T033 [P] [US2] Test e2e în `apps/web/tests/e2e/payment.spec.ts` (extinde): întoarcere cu `?plata=anulata` → mesajul „nu s-a încasat nimic” și butonul disponibil; după un `checkout.session.expired` semnat, butonul pornește o plată nouă; webhook-ul repetat (același `event.id`) nu schimbă nimic

### Implementation for User Story 2

- [ ] T034 [US2] Migrația `supabase/migrations/20261002000500_payment_failures.sql`: `create or replace` pentru `prepare_payment` cu reluarea / înlocuirea plății deschise (contracts/database-functions.md); funcțiile noi `fail_payment` și `expire_payment`; jobul `pg_cron` `expire-open-payments` (`*/15 * * * *`); regenerează `packages/shared/src/db.types.ts`
- [ ] T035 [US2] `apps/web/lib/stripe/webhook.ts`: `checkout.session.async_payment_failed` → `fail_payment`, `checkout.session.expired` → `expire_payment`; `startPayment` închide sesiunea înlocuită (`expireCheckoutSession(replaced_session_id)`) înainte de a crea alta
- [ ] T036 [P] [US2] Worker: jobul `apps/worker/src/jobs/admin-payment-notice.ts`, șablonul `apps/worker/src/email/templates/plata-de-verificat.ts` și textele (motivele `EVENT_NOT_AWAITING`, `DUPLICATE_PAYMENT`, `EVENT_DELETED`, `EXTENSION_NOT_POSSIBLE`, `DISPUTE`), cu test în `apps/worker/tests/admin-payment-notice.test.ts` (destinatari `ADMIN_NOTIFY_EMAILS`, altfel `platform_admins`; conținutul din contracts/worker-jobs.md)
- [ ] T037 [US2] Mesajele de eșec / anulare / fereastră închisă / procesator indisponibil în `PaymentStatus.tsx` și `PayActivationForm.tsx`, cu textele din contracts/web-interface.md

**Checkpoint**: quickstart, scenariile 3, 4, 9, 10 trec

---

## Phase 5: User Story 3 - Administratorul vede plățile și păstrează controlul (Priority: P2)

**Goal**: fără cereri de activare; plățile și datele de facturare vizibile adminului; activarea manuală rămâne; contestațiile suspendă automat evenimentul (FR-013–FR-016a)

**Independent Test**: după o plată, fișa adminului arată foaia „Plăți”; registrul nu mai are grupa „cer activare”; o contestație semnată suspendă evenimentul și trimite emailul

### Tests for User Story 3 ⚠️

- [ ] T038 [P] [US3] Test DB în `supabase/tests/functions/payment-dispute.test.ts`: `register_dispute` pe plata unui eveniment activ → `disputed_at`, tranziție `active → suspended` cu sursa `payment`, motivul „Plată contestată” și `external_ref` = payment intent, job `admin_payment_notice` (`DISPUTE`); pe un eveniment suspendat / expirat → starea neschimbată, emailul totuși în coadă; a doua contestație pentru aceeași plată → `ignored`
- [ ] T039 [P] [US3] Test DB în `supabase/tests/functions/activation-request.test.ts` (extinde testul existent): `request_activation` nu mai e executabilă de `authenticated` (FR-015); activarea manuală a adminului merge în continuare
- [ ] T040 [P] [US3] Test unitar în `apps/web/tests/unit/admin-ledger.test.ts` (extinde): `LEDGER_GROUPS` nu mai conține `requested`; un eveniment în așteptare cu `lastActivationRequestAt` setat cade în `awaiting`
- [ ] T041 [P] [US3] Test unitar în `apps/web/tests/unit/stripe-webhook.test.ts` (extinde): `charge.dispute.created` → `register_dispute(dispute.payment_intent)`
- [ ] T042 [P] [US3] Test e2e în `apps/web/tests/e2e/admin-self-service.spec.ts` (actualizează): fără butonul „Solicită activarea” și fără grupa „cer activare”; după o plată (webhook semnat), fișa adminului arată foaia „Plăți” cu suma, data, referința și numele de facturare; activarea manuală a altui eveniment funcționează

### Implementation for User Story 3

- [ ] T043 [US3] Migrația `supabase/migrations/20261002000600_payment_admin.sql`: `register_dispute`; `revoke execute on function public.request_activation(uuid) from authenticated`; view sau funcție admin `admin_event_payments(p_event_id uuid)` (aal2) cu coloanele din FR-013
- [ ] T044 [US3] `apps/web/lib/stripe/webhook.ts`: `charge.dispute.created` → `register_dispute`
- [ ] T045 [P] [US3] Componenta `apps/web/components/admin/PaymentsSheet.tsx` și includerea ei în `apps/web/app/admin/events/[eventId]/page.tsx` ca foaie pe rândul ei (crește în timp), cu starea „contestată” și „de rambursat” evidențiate; interogarea în `apps/web/lib/admin/queries.ts`
- [ ] T046 [US3] Elimină cererile de activare din interfață: `apps/web/components/self-service/RequestActivationButton.tsx`, acțiunea `requestActivation` din `apps/web/lib/actions/organizer.ts`, grupa `requested` din `apps/web/lib/admin/ledger.ts` (și filtrul/numărătoarea din `apps/web/app/admin/events/page.tsx`, `apps/web/components/admin/LedgerViewSelect.tsx`), banda „Cerere de activare” din fișa adminului; textele nefolosite din `ro.ts`
- [ ] T047 [P] [US3] Worker: nu mai pune în coadă `admin_activation_notice` (verifică orice apelant rămas); păstrează jobul pentru mesajele vechi; actualizează șablonul `apps/worker/src/email/templates/stergere-neactivat.ts` și textul lui („activează evenimentul plătind pachetul complet din pagina evenimentului”) și testul lui din `apps/worker/tests/activation-emails.test.ts`

**Checkpoint**: quickstart, scenariile 7 și 8 trec

---

## Phase 6: User Story 4 - Prelungirea păstrării se plătește tot online (Priority: P3)

**Goal**: organizatorul plătește diferența pentru o opțiune mai lungă; noua dată se aplică doar după plată (FR-020–FR-022)

**Independent Test**: pe un eveniment activ, prelungirea plătită schimbă opțiunea și data ștergerii și apare în istoricul păstrării cu autorul „plată”; o plată pentru o prelungire devenită imposibilă ajunge la admin

### Tests for User Story 4 ⚠️

- [ ] T048 [P] [US4] Test DB în `supabase/tests/functions/payments.test.ts` (extinde) și actualizarea `supabase/tests/functions/extend-retention.test.ts`: `prepare_payment` pentru `retention_extension` — doar `active` și înainte de `purge_at`, opțiune mai lungă (`RETENTION_NOT_LONGER`), suma = (bază + supliment nou) − `final_price_minor`, fereastra față de `purge_at`; `complete_payment` → opțiunea și snapshot-urile din plată, `purge_at` recalculat, rând în `event_retention_changes` cu `actor_kind = 'payment'`, job `payment_confirmation`; eveniment expirat / suspendat / cu opțiune deja egală sau mai lungă → `refund_due` (`EXTENSION_NOT_POSSIBLE`); `extend_retention` nu mai e executabilă de `authenticated`
- [ ] T049 [P] [US4] Test e2e în `apps/web/tests/e2e/retention.spec.ts` (actualizează): alegerea unei opțiuni mai lungi arată diferența de plată și noua dată; „Plătește prelungirea” face redirect spre sesiune; după webhook-ul semnat, noua dată apare pe pagină și în istoricul adminului

### Implementation for User Story 4

- [ ] T050 [US4] Migrația `supabase/migrations/20261002000700_retention_payment.sql`: ramura `retention_extension` în `prepare_payment` și `complete_payment` (contracts/database-functions.md); `revoke execute on function public.extend_retention(uuid, uuid, bigint) from authenticated`; regenerează `packages/shared/src/db.types.ts`
- [ ] T051 [US4] `apps/web/components/retention/RetentionPanel.tsx` și `ExtendRetentionDialog.tsx`: dialogul devine revizuirea dinaintea plății (diferența de plată, noua dată de ștergere) cu formularul `startPayment({ purpose: "retention_extension", … })` și butonul „Plătește prelungirea”; elimină apelul `extendRetention` din `apps/web/lib/actions/organizer.ts`; `PaymentStatus` pentru prelungirea în curs
- [ ] T052 [P] [US4] Worker: varianta `retention_extension` a emailului `plata-confirmata` (suma, noua perioadă, noua dată de ștergere) și testul ei în `apps/worker/tests/payment-confirmation.test.ts`

**Checkpoint**: quickstart, scenariul 6 trece

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T053 [P] Migrația `supabase/migrations/20261002000800_payment_retention.sql`: jobul `pg_cron` `purge-payment-noise` (`50 3 * * *`, data-model.md › Retenție) și extinderea anonimizării din 001/FR-047 să golească `event_name`, `organizer_email` și `billing_*` din `payments`; test în `supabase/tests/functions/retention-jobs.test.ts`
- [ ] T054 [P] Politica de confidențialitate: versiune nouă `apps/web/content/legal/privacy/2026-10-02.md` cu Stripe Payments Europe ca procesator, datele de facturare păstrate și termenele (research R13); versiunea nouă în `legal_documents` prin migrația `supabase/migrations/20261002000900_privacy_stripe.sql`, conform mecanismului din 002/FR-041
- [ ] T055 [P] Documentație: `docs/pornire-locala.md` (Stripe CLI, `stripe listen`, variabilele) și `docs/livrare-server-propriu.md` (cheile live, webhook-ul în Dashboard, regula Cloudflare pentru `POST /api/stripe/webhook`, chitanțele activate) conform quickstart.md › Înainte de producție
- [ ] T056 Actualizează specificația 002 unde e înlocuită de 003 (FR-018a, FR-025, presupunerea „plata online nu este în scop”) cu trimiteri la 003, fără a rescrie istoria
- [ ] T057 Rulează toate verificările: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:db`, `pnpm test:worker`, `pnpm test:e2e` (cu stripe-mock) și scenariile manuale din quickstart.md cu Stripe în modul test
- [ ] T058 Raportul de implementare `specs/003-stripe-payment-activation/raport-implementare.md` (constituția, „Flux de dezvoltare”): ce s-a realizat, cum, verificare cu cifre, limitări și pași rămași înainte de producție

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: fără dependențe
- **Foundational (Phase 2)**: după Setup; blochează toate poveștile
- **US1 (Phase 3)**: după Foundational; MVP
- **US2 (Phase 4)**: după US1 (extinde aceleași funcții și componente: `prepare_payment`, `complete_payment`, `PaymentStatus`)
- **US3 (Phase 5)**: după Foundational; T045 are nevoie de plăți create (US1) pentru testul e2e; restul e independent de US1
- **US4 (Phase 6)**: după US1 (folosește `startPayment`, `complete_payment`, `PaymentStatus`)
- **Polish (Phase 7)**: după poveștile dorite

### Within Each User Story

- Testele se scriu primele și trebuie să eșueze
- Migrațiile SQL înaintea tipurilor regenerate, apoi codul web și worker
- Funcțiile din `lib/stripe/` înaintea Server Actions, apoi componentele

### Parallel Opportunities

- Setup: T002–T005 în paralel, după T001
- Foundational: testele T006–T008 în paralel; T013 în paralel cu migrațiile
- US1: testele T015–T019 în paralel; T022, T029, T030 în paralel cu migrația T020
- US3: testele T038–T042 în paralel; T045 și T047 în paralel
- US3 poate merge în paralel cu US2 (fișiere diferite, în afară de `lib/stripe/webhook.ts`: T035 și T044 se fac pe rând)

---

## Parallel Example: User Story 1

```text
# Testele (toate odată, trebuie să eșueze):
T015 supabase/tests/functions/payments.test.ts
T016 apps/web/tests/unit/stripe-checkout.test.ts
T017 apps/web/tests/unit/stripe-webhook.test.ts
T018 apps/worker/tests/payment-confirmation.test.ts
T019 apps/web/tests/e2e/payment.spec.ts

# După migrația T020, în paralel:
T022 apps/web/lib/stripe/checkout.ts
T029 apps/worker/src/jobs/payment-confirmation.ts + șablonul
T030 apps/web/lib/i18n/messages/ro.ts
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2
2. Phase 3 (US1): plata activării cap-coadă
3. **Stop și validare**: quickstart, scenariile 1, 2, 5 cu Stripe în modul test
4. MVP-ul nu se lansează fără US2 (plățile eșuate și dubla plată sunt obișnuite în producție)

### Incremental Delivery

1. Setup + Foundational
2. US1 → validare (modul test)
3. US2 → validare: lansabil în producție pentru activare
4. US3 → administrarea fără cereri de activare, contestațiile
5. US4 → prelungirea plătită
6. Polish → politica de confidențialitate, documentație, raportul

---

## Notes

- [P] = fișiere diferite, fără dependențe nefinalizate
- Fiecare poveste se poate valida separat cu scenariile din quickstart.md
- Commit după fiecare sarcină sau grup logic
- În CI nu există chei Stripe reale; tot ce atinge Stripe trece prin stripe-mock sau evenimente semnate cu secretul de test

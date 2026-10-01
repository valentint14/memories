# Implementation Plan: Activarea evenimentului prin plată online (Stripe)

**Branch**: `003-stripe-payment-activation` | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-stripe-payment-activation/spec.md`

## Summary

Organizatorul își activează singur evenimentul plătind pachetul complet, cu perioada de păstrare
aleasă, pe pagina găzduită Stripe Checkout; tot așa plătește și prelungirea păstrării.
Aplicația pregătește plata în Postgres (sumă calculată și înghețată, o singură plată deschisă
per eveniment), creează sesiunea Checkout din Server Action și primește confirmarea pe două căi
autentice: webhook-ul semnat și citirea sesiunii din API-ul Stripe la întoarcere. Ambele apelează
aceeași funcție SQL idempotentă, care activează evenimentul prin `activate_event` (sursa
`payment`, pregătită în 002) sau aplică prelungirea; plățile care nu mai pot fi aplicate devin
„de rambursat” și ajung la administrator. O contestație suspendă automat evenimentul activ.
Cererea de activare și activarea manuală ca flux principal dispar; activarea manuală rămâne
pentru excepții.

## Technical Context

**Language/Version**: TypeScript strict pe Node.js 24 LTS; SQL (Postgres 17) — neschimbat

**Primary Dependencies**: cele din 001/002; **nou**: `stripe` 22.6.2 (SDK oficial, doar server,
[R2](./research.md#r2-sdk-ul-și-versiunea-api)). Serviciu extern nou: Stripe (Checkout,
webhook-uri). Pentru teste: imaginea Docker `stripe/stripe-mock`
([R9](./research.md#r9-testarea-fără-încasări-fr-019)).

**Storage**: Supabase Postgres (Frankfurt): 2 tabele noi (`payments`, `stripe_webhook_events`),
2 enum-uri noi, valoarea `payment` în `retention_actor`, ~10 funcții noi sau modificate, 2
joburi `pg_cron`. Storage neschimbat.

**Testing**: Vitest (`db`, `web`, `worker`) și Playwright (desktop Chromium, Pixel 7, iPhone 15
WebKit), cu stripe-mock în CI; manual cu Stripe în modul test și Stripe CLI.

**Target Platform**: server propriu cu Docker și Cloudflare Tunnel
([docs/livrare-server-propriu.md](../../docs/livrare-server-propriu.md)); webhook-ul ajunge la
containerul `web` prin tunel ([R12](./research.md#r12-găzduirea-webhook-ului)).

**Project Type**: aplicație web, monorepo pnpm (`apps/web`, `apps/worker`, `packages/shared`,
`supabase/`)

**Performance Goals**:
- eveniment activ în ≤ 1 min de la plată în 95% din cazuri (SC-002); prin verificarea la
  întoarcere, de regulă în < 5 s;
- handler-ul de webhook răspunde în < 2 s (doar scrieri în baza de date; emailurile prin coadă);
- suspendare pentru contestație în ≤ 5 min (SC-005a; webhook-ul ajunge în secunde).

**Constraints**:
- nicio dată de card în aplicație (FR-003);
- activare / prelungire doar după confirmare verificată (semnătură sau API Stripe), idempotent;
- suma calculată și înghețată în baza de date, nu în client;
- cheile Stripe doar pe server; `sk_live_` interzis în afara producției;
- nicio schimbare de stare în afara `transition_event` (002).

**Scale/Scope**: zeci de plăți pe zi; 2 rute noi sau modificate (`/api/stripe/webhook`,
`/events/[eventId]`), 2 pagini de admin modificate, 2 joburi de worker noi.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principiu | Verificare | Stare |
| --- | --- | --- |
| I. Fără fricțiune pentru invitați | Pagina invitatului e neschimbată; doar momentul în care se deschide uploadul vine din plată. | ✅ |
| II. GDPR | Datele aplicației rămân în UE. Stripe Payments Europe (Irlanda) e procesator nou: DPA + mențiune în politica de confidențialitate (R13). Se păstrează doar datele din FR-018; datele de facturare se anonimizează odată cu evenimentul; zgomotul (plăți neterminate, jurnalul webhook-urilor) se șterge la 90 de zile. | ✅ |
| III. Securitate implicită | RLS pe `payments` și `stripe_webhook_events` (citire doar admin, scriere doar prin funcții). Webhook-ul verifică semnătura; întoarcerea citește sesiunea din API cu cheia secretă. Secrete doar pe server. Tokenul public al evenimentului neschimbat (excepția din v1.3.0). | ✅ |
| IV. Pipeline media scalabil | Neschimbat. | ✅ |
| V. Timp real fiabil | Neschimbat; suspendarea pentru contestație oprește actualizarea în timp real, ca orice suspendare (002/FR-028a). | ✅ |
| VI. Calitate și testare | Teste scrise înainte: funcțiile de plată (idempotență, dublă plată, contestație, ferestre), webhook-ul semnat, e2e pe mobil cu stripe-mock. | ✅ |
| VII. Simplitate | Checkout găzduit în loc de formular propriu; `price_data` în loc de catalog sincronizat în Stripe; fără tabel de clienți Stripe; o dependență nouă, justificată mai jos. | ✅ cu justificare |
| VIII. Accesibilitate și localizare | Texte noi prin `t()` și `messages/ro.ts` în worker; Checkout în română (`locale: "ro"`); stările plății anunțate cu `role="status"`; axe pe ecranele modificate. | ✅ |
| Constrângeri tehnologice | `stripe` 22.6.2: stabil, MIT, întreținut de Stripe, fără dependențe, zero impact pe bundle (doar server). 23.0.0 apărut azi — evaluat după primul patch. | ✅ |
| Flux de dezvoltare | Branch `003-stripe-payment-activation` din `main` actualizat; raportul de implementare la final. | ✅ |

**Re-evaluare după Phase 1**: data-model și contractele nu introduc abateri noi. Poarta rămâne
trecută.

## Project Structure

### Documentation (this feature)

```text
specs/003-stripe-payment-activation/
├── plan.md              # acest fișier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 (scenarii, Stripe CLI, producție)
├── contracts/
│   ├── database-functions.md
│   ├── stripe-webhooks.md
│   ├── web-interface.md
│   └── worker-jobs.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   ├── 20261002000100_payments.sql            # enum-uri, payments, stripe_webhook_events, RLS, indecși
│   ├── 20261002000200_payment_functions.sql   # prepare/attach/complete/fail/expire, register_dispute, webhook log
│   ├── 20261002000300_activation_payment.sql  # activate_event cu p_payment_id; retention_actor 'payment'
│   └── 20261002000400_payment_cleanup.sql     # revoke request_activation / extend_retention, pg_cron
└── tests/functions/                           # payments.test.ts, payment-dispute.test.ts (noi)

apps/web/
├── app/
│   ├── api/stripe/webhook/route.ts            # nou
│   ├── events/[eventId]/page.tsx              # verificarea la întoarcere, foile de plată
│   └── admin/events/{page,[eventId]/page}.tsx # fără „cer activare”; foaia „Plăți”
├── components/
│   ├── self-service/{EventStatusPanel,PayActivationForm,PaymentStatus}.tsx
│   ├── retention/{RetentionPanel,ExtendRetentionDialog}.tsx
│   └── admin/PaymentsSheet.tsx
├── lib/
│   ├── stripe/{client,checkout,webhook}.ts    # doar server
│   ├── actions/payments.ts                    # startPayment, paymentState
│   ├── admin/ledger.ts                        # fără grupa „requested”
│   ├── security/csp.ts                        # form-action + checkout.stripe.com
│   ├── server-env.ts                          # STRIPE_*
│   └── i18n/messages/ro.ts
└── tests/
    ├── unit/{stripe-webhook,stripe-checkout,csp}.test.ts
    └── e2e/payment.spec.ts                    # cu stripe-mock

apps/worker/src/
├── jobs/{payment-confirmation,admin-payment-notice}.ts
├── email/templates/{plata-confirmata,plata-de-verificat}.ts (+ stergere-neactivat modificat)
└── email/messages/ro.ts

packages/shared/src/{errors.ts,db.types.ts}
deploy/web.env.example                          # STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
.github/workflows/…                             # serviciul stripe-mock pentru e2e
```

**Structure Decision**: aceeași structură de monorepo. Regulile de plată (sume, eligibilitate,
idempotență, efecte) stau în Postgres; `apps/web` vorbește cu Stripe (creare sesiune, webhook,
verificare la întoarcere) și face interfața; worker-ul trimite emailurile. Worker-ul nu are
nevoie de cheile Stripe.

## Complexity Tracking

| Abatere / complexitate | De ce e necesară | Alternativa mai simplă respinsă pentru că |
| --- | --- | --- |
| Dependență npm nouă (`stripe`) | Verificarea semnăturii webhook-urilor și apelurile tipizate către Stripe; cod doar pe server | REST direct ar cere reimplementarea verificării semnăturii (risc de securitate) |
| Două căi de confirmare (webhook + întoarcere) | SC-002 (activ în ≤ 1 min) fără a depinde doar de livrarea webhook-ului; webhook-ul acoperă fereastra închisă | Doar una dintre căi lasă fie întârzieri vizibile, fie plăți neaplicate |
| Jurnalul `stripe_webhook_events` | Stripe livrează „cel puțin o dată”; deduplicarea per eveniment și auditul procesării | Idempotența doar pe plată nu acoperă contestațiile repetate și nu arată ce s-a primit |
| stripe-mock în CI | Testele e2e ale fluxului critic fără rețea și fără chei reale | Pagina reală Checkout în CI e fragilă și cere secrete |

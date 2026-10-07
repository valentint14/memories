# Implementation Plan: Rambursările plăților Stripe

**Branch**: `004-stripe-refunds` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-stripe-refunds/spec.md`

## Summary

Aplicația reacționează automat la rambursările făcute de administrator din Stripe. Webhook-ul din
003 primește un tip nou, `charge.refunded`, cu suma cumulată rambursată; o funcție SQL nouă,
`register_refund`, o înregistrează pe plată (doar crescător) și, la prima rambursare integrală,
aplică o singură dată efectul: suspendă evenimentul activat prin plata rambursată („Plată
rambursată”, ca la contestații), readuce păstrarea de dinaintea unei prelungiri rambursate
(valorile de dinainte se rețin acum la aplicarea prelungirii) sau, când revenirea nu e sigură,
anunță administratorii pentru ajustare manuală. Plățile „de rambursat” nu schimbă evenimentul.
Foaia „Plăți” arată suma rambursată, data și efectul.

## Technical Context

**Language/Version**: TypeScript strict pe Node.js 24 LTS; SQL (Postgres 17) — neschimbat

**Primary Dependencies**: cele din 003 (`stripe` 22.6.2); nicio dependență nouă

**Storage**: Supabase Postgres: 6 coloane noi pe `payments`, 4 constrângeri, 1 funcție nouă
(`register_refund`), 1 funcție modificată (`apply_paid_extension`); fără tabele noi

**Testing**: Vitest (`db`, `web`, `worker`), Playwright (desktop, Pixel 7, iPhone 15) cu serverul
Stripe fals și evenimente semnate; manual cu Stripe în modul test

**Target Platform**: instanța Oracle Cloud ([docs/livrare-server-propriu.md](../../docs/livrare-server-propriu.md)) — neschimbat

**Project Type**: aplicație web, monorepo pnpm (`apps/web`, `apps/worker`, `packages/shared`, `supabase/`)

**Performance Goals**: evenimentul suspendat în ≤ 1 min de la rambursare (SC-001); webhook-ul
răspunde în < 2 s (doar scrieri în bază, emailul prin coadă)

**Constraints**: efecte aplicate o singură dată per plată (SC-003); nicio schimbare de stare în
afara `transition_event`; data ștergerii rămâne derivată (research R5); plățile `refund_due` nu
schimbă evenimentul (SC-004)

**Scale/Scope**: rambursări rare (unități pe lună); 1 tip de webhook nou, 1 foaie de admin
modificată, 1 motiv nou de email

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principiu | Verificare | Stare |
| --- | --- | --- |
| I. Fără fricțiune pentru invitați | Pagina invitatului neschimbată; un eveniment suspendat la rambursare arată mesajul existent (002). | ✅ |
| II. GDPR | Coloanele noi nu conțin date personale (sume, momente, opțiuni); păstrarea și anonimizarea plăților din 003 neschimbate. Revenirea păstrării nu șterge fișiere pe loc: sub 7 zile decide administratorul (FR-008). | ✅ |
| III. Securitate implicită | Rambursările vin doar prin webhook-ul semnat (003); `register_refund` doar pentru `service_role`; RLS pe `payments` neschimbat; nicio cheie nouă. | ✅ |
| IV. Pipeline media scalabil | Neschimbat. | ✅ |
| V. Timp real fiabil | Neschimbat; suspendarea oprește actualizarea ca orice suspendare (002/FR-028a). | ✅ |
| VI. Calitate și testare | Teste DB pentru fiecare ramură din `register_refund` scrise înainte; webhook-ul testat cu evenimente semnate; e2e pe mobil. | ✅ |
| VII. Simplitate | Coloane pe `payments` în loc de tabel de rambursări sau stare nouă în enum; aceeași cale de suspendare ca la contestații; jobul de email existent; fără câmp de dată minimă (R2, R5). | ✅ |
| VIII. Accesibilitate și localizare | Textele noi în `messages/ro.ts` (web și worker); starea rambursării spusă în text, nu doar prin culoare; axe pe fișa adminului. | ✅ |
| Constrângeri tehnologice | Nicio dependență nouă. | ✅ |
| Flux de dezvoltare | Branch `004-stripe-refunds` din `main` actualizat; raportul de implementare la final. | ✅ |

**Re-evaluare după Phase 1**: data-model și contractele nu introduc abateri. Două ajustări ale
specificației, făcute în research (R5: fără marjă fixă de 7 zile, ci ajustare manuală; R6: fără
referința plății în istoricul păstrării), reduc complexitatea. Poarta rămâne trecută.

## Project Structure

### Documentation (this feature)

```text
specs/004-stripe-refunds/
├── plan.md              # acest fișier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 (teste, scenarii manuale, producție)
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
├── migrations/20261006000100_refunds.sql       # coloane, constrângeri, register_refund, apply_paid_extension
└── tests/functions/payment-refund.test.ts      # nou

apps/web/
├── lib/stripe/webhook.ts                       # charge.refunded → registerRefund
├── app/api/stripe/webhook/route.ts             # db.registerRefund
├── lib/admin/queries.ts                        # listPayments: câmpurile de rambursare
├── components/admin/PaymentsSheet.tsx          # suma, data, efectul
├── lib/i18n/messages/ro.ts                     # admin.payments.refund.*
└── tests/
    ├── unit/stripe-webhook.test.ts             # charge.refunded
    └── e2e/{refund.spec.ts,support/stripe.ts}  # eveniment charge.refunded semnat

apps/worker/src/
├── jobs/types.ts                               # motivul RETENTION_MANUAL
└── email/messages/ro.ts                        # textul motivului

packages/shared/src/db.types.ts                 # regenerat
docs/livrare-server-propriu.md                  # 6 evenimente la destinația de webhook
```

**Structure Decision**: aceeași structură; regulile rambursării stau în Postgres, lângă cele de
plată din 003; `apps/web` doar le transmite din webhook și le afișează; worker-ul trimite emailul.

## Complexity Tracking

| Abatere / complexitate | De ce e necesară | Alternativa mai simplă respinsă pentru că |
| --- | --- | --- |
| Trei coloane `previous_*` pe plată | Revenirea exactă a păstrării (opțiune, luni, supliment) la rambursarea prelungirii (FR-007) | Istoricul păstrării nu are opțiunea și suplimentul, deci nu poate reface starea exactă |

---
description: "Task list for 004 — rambursările plăților Stripe"
---

# Tasks: Rambursările plăților Stripe

**Input**: Design documents from `/specs/004-stripe-refunds/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluse. Constituția (VI) cere testele pentru fluxurile critice scrise înainte și
verificate că eșuează înainte de implementare. Rambursarea oprește uploadul (US1) și schimbă data
ștergerii fișierelor (US2).

**Organization**: sarcinile sunt grupate pe povești de utilizator (US1–US3 din spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: poate rula în paralel (fișiere diferite, fără dependențe nefinalizate)
- **[Story]**: povestea de utilizator (US1…US3)

## Path Conventions

Monorepo din 001–003: `apps/web/`, `apps/worker/`, `packages/shared/`, `supabase/`. Migrația nouă:
`supabase/migrations/20261006000100_refunds.sql`. Funcțiile SQL: `security definer`,
`set search_path = ''`, erori prin `raise_app_error`. Mesajele din coadă (`media_jobs`) folosesc
câmpuri `snake_case`. Textele interfeței prin `t()` și `apps/web/lib/i18n/messages/ro.ts`; ale
emailurilor în `apps/worker/src/email/messages/ro.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: nimic nou de instalat; doar ajutoarele de test

- [ ] T001 [P] În `supabase/tests/support/payments.ts` adaugă ajutoarele `paidActivation(prefix)` (eveniment activat printr-o plată `paid` cu `stripe_payment_intent_id` unic, prin `prepare_payment` + `complete_payment` ca service role, cum fac testele din `supabase/tests/functions/payments.test.ts`) și `paidExtension(eventId, months)` (prelungire plătită aplicată prin `complete_payment`), care întorc `{ eventId, paymentId, paymentIntentId, amountMinor }`
- [ ] T002 [P] În `apps/web/tests/e2e/support/stripe.ts` adaugă `chargeRefunded(paymentIntentId, amountMinor, amountRefundedMinor)` care construiește obiectul `Charge` minim (`object: "charge"`, `payment_intent`, `amount`, `amount_refunded`, `currency: "ron"`, `refunded: amountRefunded === amount`) pentru `sendWebhook(page, "charge.refunded", …)`; și `latestPayment` să întoarcă și `stripe_payment_intent_id`, `refunded_minor`, `refund_effect`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: coloanele noi și recepția `charge.refunded`, de care depind toate poveștile

**⚠️ CRITICAL**: nicio poveste nu poate începe înainte de această fază

- [ ] T003 Creează `supabase/migrations/20261006000100_refunds.sql` cu coloanele noi pe `public.payments` (data-model.md): `refunded_minor bigint not null default 0`, `refunded_at timestamptz`, `refund_effect text`, `previous_retention_option_id uuid references public.retention_options (id) on delete restrict`, `previous_retention_months int`, `previous_surcharge_minor bigint`, și constrângerile `payments_refunded_range` (`refunded_minor between 0 and amount_minor`), `payments_refund_effect` (`refund_effect is null or refund_effect in ('suspended', 'retention_reverted', 'manual_adjustment', 'none')`), `payments_refund_effect_full` (`refund_effect is null or refunded_minor = amount_minor`), `payments_previous_retention` (cele trei coloane `previous_*` toate null sau toate setate, și setate doar pentru `purpose = 'retention_extension'`; `previous_retention_months between 1 and 60`, `previous_surcharge_minor >= 0`). Fără schimbări de RLS
- [ ] T004 În aceeași migrație, scheletul `public.register_refund(p_payment_intent_id text, p_refunded_minor bigint, p_refunded_at timestamptz) returns table (outcome text, event_id uuid)` (contracts/database-functions.md): `INVALID_INPUT` pentru sumă negativă; blochează plata după `stripe_payment_intent_id` (`for update`), `ignored` dacă lipsește sau dacă `p_refunded_minor <= refunded_minor`; altfel `refunded_minor := least(p_refunded_minor, amount_minor)`, `refunded_at := p_refunded_at`; `partial` sub sumă; la sumă integrală cu `refund_effect` deja setat → `ignored`; `refund_due` → `refund_effect = 'none'`, `none`. Ramurile pe scop vin în US1 și US2 (până atunci: `none`). `revoke … from public, anon, authenticated; grant … to service_role`
- [ ] T005 Aplică migrația local (`corepack pnpm exec supabase migration up --local`) și regenerează `packages/shared/src/db.types.ts` (`corepack pnpm db:types` sau comanda folosită în 003)
- [ ] T006 [P] Test DB în `supabase/tests/functions/payment-refund.test.ts` (nou), scris înaintea T004 și verificat că pică: plată necunoscută → `ignored`; parțial → `partial` cu `refunded_minor` și `refunded_at` setate; repetarea aceleiași sume și o sumă mai mică după una mai mare → `ignored`, suma nu scade; sumă peste plată → limitată la `amount_minor`; sumă negativă → `INVALID_INPUT`; plată `refund_due` rambursată integral → `none`, evenimentul neschimbat (FR-011, SC-004); `authenticated` și `anon` nu pot apela funcția
- [ ] T007 [P] Test unitar în `apps/web/tests/unit/stripe-webhook.test.ts`, scris înaintea T008: `charge.refunded` apelează `db.registerRefund(payment_intent, amount_refunded, data din event.created)` și scrie în jurnal valoarea întoarsă; `payment_intent` lipsă sau `currency` diferit de `ron` → `ignored` fără apel
- [ ] T008 În `apps/web/lib/stripe/webhook.ts`: adaugă `registerRefund: (paymentIntentId: string, refundedMinor: number, refundedAt: string) => Promise<string>` în `WebhookDb` și ramura `case "charge.refunded"` în `handleStripeEvent` (contracts/stripe-webhooks.md); în `apps/web/app/api/stripe/webhook/route.ts` implementează `registerRefund` cu `supabase.rpc("register_refund", …)`, ca `registerDispute`

**Checkpoint**: rambursările se înregistrează (sumă, dată), fără efecte asupra evenimentului

---

## Phase 3: User Story 1 - Rambursarea activării suspendă evenimentul (Priority: P1) 🎯 MVP

**Goal**: rambursarea integrală a plății de activare suspendă evenimentul activ cu motivul „Plată rambursată”

**Independent Test**: activare prin plată, `charge.refunded` integral semnat → eveniment suspendat, uploadul refuzat, istoric cu sursa „sistem de plăți” și referința plății

### Tests for User Story 1 ⚠️

> **NOTE: scrie testele întâi și verifică-le că pică**

- [ ] T009 [P] [US1] În `supabase/tests/functions/payment-refund.test.ts`: activare rambursată integral cu eveniment activ → `suspended`, evenimentul `suspended`, rândul din `event_status_changes` are sursa `payment`, motivul „Plată rambursată” și `external_ref` = payment intent, `refund_effect = 'suspended'`; parțial → evenimentul rămâne `active` (FR-005); două parțiale care adunate dau suma → `suspended` (FR-003); după reactivarea manuală de către admin, un nou apel cu aceeași sumă → `ignored`, evenimentul rămâne `active` (FR-006); eveniment deja suspendat (de ex. după `register_dispute`) → `none`, fără a doua intrare de suspendare; eveniment șters (`event_id` null) → `none`
- [ ] T010 [P] [US1] E2E în `apps/web/tests/e2e/refund.spec.ts` (nou): organizatorul plătește activarea prin serverul Stripe fals (ca în `payment.spec.ts`), webhook-ul o confirmă, apoi `sendWebhook(page, "charge.refunded", chargeRefunded(…integral))` → pagina organizatorului arată evenimentul suspendat, iar pagina invitatului (`/e/{token}`) nu mai are formularul de upload; un al doilea test cu rambursare parțială lasă evenimentul activ

### Implementation for User Story 1

- [ ] T011 [US1] În `register_refund` (migrația din T003): ramura `purpose = 'activation'` și `status = 'paid'`: blochează evenimentul (`for update`); dacă e `active`, `perform public.transition_event(pay.event_id, 'suspended', 'payment', null, 'Plată rambursată', p_payment_intent_id)`, `refund_effect = 'suspended'`, întoarce `suspended`; altfel `refund_effect = 'none'`, întoarce `none` (research R4)
- [ ] T012 [US1] Rulează `corepack pnpm test:db` și e2e-ul din T010 pe desktop; verifică `outcome = 'suspended'` în `stripe_webhook_events`

**Checkpoint**: MVP — rambursarea activării oprește uploadul automat

---

## Phase 4: User Story 2 - Rambursarea prelungirii readuce data de ștergere anterioară (Priority: P2)

**Goal**: rambursarea integrală a unei prelungiri readuce perioada, data ștergerii și prețul final de dinainte, sau cere ajustare manuală

**Independent Test**: prelungire 3 → 12 luni plătită, rambursare integrală → 3 luni, data și prețul de dinainte, rând nou în istoricul păstrării cu sursa „sistem de plăți”

### Tests for User Story 2 ⚠️

- [ ] T013 [P] [US2] În `supabase/tests/functions/payment-retention.test.ts` (existent): după `complete_payment` pentru o prelungire, plata are `previous_retention_option_id`, `previous_retention_months` și `previous_surcharge_minor` egale cu valorile evenimentului de dinainte; o activare nu le setează
- [ ] T014 [P] [US2] În `supabase/tests/functions/payment-refund.test.ts`: prelungire 3 → 12 rambursată integral → `retention_reverted`; evenimentul are `retention_months`, `retention_surcharge_minor`, `final_price_minor` și `purge_at` de dinainte; `event_retention_changes` are un rând nou cu `actor_kind = 'payment'`; aceeași revenire funcționează dacă opțiunea de 3 luni a fost dezactivată între timp în catalog. Cazuri `manual_adjustment` (cu mesaj `admin_payment_notice` / `RETENTION_MANUAL` în coada `media_jobs`): o schimbare a păstrării făcută de admin după prelungire (FR-009); `previous_*` null (prelungire dinainte de 004); data recalculată ≤ acum + 7 zile (FR-008). Eveniment suspendat sau expirat → `none`, fără mesaj. Rambursare parțială → păstrarea neschimbată (FR-010)
- [ ] T015 [P] [US2] Test worker în `apps/worker/tests/admin-payment-notice.test.ts` (existent): motivul `RETENTION_MANUAL` produce un email în română care spune că plata prelungirii a fost rambursată și păstrarea trebuie ajustată manual, cu linkul spre fișa evenimentului

### Implementation for User Story 2

- [ ] T016 [US2] În migrația din T003: `create or replace function public.apply_paid_extension(p_payment_id uuid)` ca în `supabase/migrations/20261002000700_retention_payment.sql`, plus, înainte de `update public.events`, `update public.payments set previous_retention_option_id = e.retention_option_id, previous_retention_months = e.retention_months, previous_surcharge_minor = e.retention_surcharge_minor where id = pay.id` (research R5); semnătura și drepturile neschimbate
- [ ] T017 [US2] În `register_refund`: ramura `purpose = 'retention_extension'` și `status = 'paid'` (research R5, data-model.md): eveniment inexistent sau ne-`active` → `none`; dacă `previous_*` sunt null, sau există în `event_retention_changes` un rând pentru eveniment cu `created_at > pay.paid_at`, sau `(upload_ends_at la Europe/Bucharest + previous_retention_months luni)` ≤ `now() + interval '7 days'` → `refund_effect = 'manual_adjustment'`, `pgmq.send('media_jobs', jsonb_build_object('type', 'admin_payment_notice', 'payment_id', pay.id, 'reason', 'RETENTION_MANUAL'))`, întoarce `manual_adjustment`; altfel setează `app.payment_snapshot` = `{"months": previous_retention_months, "surcharge": previous_surcharge_minor}` și `app.retention_actor = 'payment'`, `update public.events set retention_option_id = pay.previous_retention_option_id`, golește setările, `refund_effect = 'retention_reverted'`, întoarce `retention_reverted`
- [ ] T018 [P] [US2] În `apps/worker/src/jobs/types.ts` adaugă `"RETENTION_MANUAL"` la `reason` din `admin_payment_notice`; în `apps/worker/src/email/messages/ro.ts › adminPaymentNotice.reasons` adaugă textul „Plata prelungirii a fost rambursată, dar păstrarea nu a putut fi readusă automat. Ajustează păstrarea din fișa evenimentului.”; în `apps/worker/src/email/templates/plata-de-verificat.ts` acțiunea pentru `RETENTION_MANUAL` e „Ajustează păstrarea din fișa evenimentului” (contracts/worker-jobs.md)
- [ ] T019 [US2] Rulează `corepack pnpm test:db` și `corepack pnpm test:worker`; regenerează `db.types.ts` dacă s-au schimbat semnături

**Checkpoint**: prelungirile rambursate nu mai lasă păstrare gratuită

---

## Phase 5: User Story 3 - Administratorul vede rambursările (Priority: P3)

**Goal**: foaia „Plăți” arată suma rambursată, data și efectul

**Independent Test**: o plată rambursată parțial și una integral apar corect în fișa evenimentului din administrare

### Tests for User Story 3 ⚠️

- [ ] T020 [P] [US3] În `apps/web/tests/e2e/refund.spec.ts`: adminul deschide `/admin/events/{id}` după rambursarea integrală și vede în foaia „Plăți” „Rambursată” cu data și „Eveniment suspendat”; după o rambursare parțială vede „Rambursat parțial: {sumă}”; verificare axe (WCAG 2.2 AA) pe fișă, ca în `apps/web/tests/e2e/a11y.spec.ts`

### Implementation for User Story 3

- [ ] T021 [US3] În `apps/web/lib/admin/queries.ts › listPayments` citește și `refunded_minor`, `refunded_at`, `refund_effect`, `previous_retention_months` și expune-le ca `refundedMinor`, `refundedAt`, `refundEffect`, `previousRetentionMonths`
- [ ] T022 [P] [US3] În `apps/web/lib/i18n/messages/ro.ts` adaugă `admin.payments.refund.partial` („Rambursat parțial: {amount}”), `admin.payments.refund.full` („Rambursată”), `admin.payments.refund.effect.suspended` („Eveniment suspendat”), `admin.payments.refund.effect.retention_reverted` („Păstrarea a revenit la {months}”), `admin.payments.refund.effect.manual_adjustment` („Păstrarea trebuie ajustată manual”), `admin.payments.refund.effect.none` („Fără schimbări”)
- [ ] T023 [US3] În `apps/web/components/admin/PaymentsSheet.tsx` afișează, pentru plățile cu `refundedMinor > 0`, rândul de rambursare din contracts/web-interface.md (sumă formatată cu `formatMoney`, data cu `formatDateTime`, efectul); rambursarea integrală folosește culoarea de atenționare ca `flagged`, cu starea spusă în text (WCAG 1.4.1)
- [ ] T024 [US3] Rulează e2e-ul din T020 pe desktop, Pixel 7 și iPhone 15

**Checkpoint**: toate poveștile funcționează independent

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 [P] În `docs/livrare-server-propriu.md › 8. Plățile` adaugă `charge.refunded` la evenimentele destinației de webhook (6 în total) și nota că rambursările integrale suspendă evenimentul sau readuc păstrarea (FR-013)
- [ ] T026 [P] În `specs/003-stripe-payment-activation/spec.md › FR-016` adaugă trimiterea: „Înlocuită pentru rambursările plăților aplicate de 004/FR-004 și FR-007.”
- [ ] T027 Rulează porțile complete: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test:unit`, `corepack pnpm test:db`, `corepack pnpm test:worker`, e2e (desktop + mobil) cu serverul Stripe fals
- [ ] T028 Scenariile manuale 1–7 din [quickstart.md](./quickstart.md) cu Stripe în modul test și `stripe listen`
- [ ] T029 Scrie `specs/004-stripe-refunds/raport-implementare.md` (constituția: ce s-a realizat, cum, verificare, limitări)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: fără dependențe
- **Foundational (Phase 2)**: după Setup; blochează toate poveștile
- **US1 (Phase 3)**, **US2 (Phase 4)**: după Foundational; independente între ele (ramuri diferite ale aceleiași funcții, scrise în ordine în aceeași migrație)
- **US3 (Phase 5)**: după Foundational; afișarea e completă după US1 și US2, dar poate fi testată cu rambursări parțiale și `none`
- **Polish (Phase 6)**: după poveștile dorite

### Within Each User Story

- Testele întâi, verificate că pică
- Migrația înaintea codului web; tipurile regenerate după migrație
- Povestea completă înainte de următoarea prioritate

### Parallel Opportunities

- T001 ‖ T002
- T006 ‖ T007 (după T003)
- T009 ‖ T010; T013 ‖ T014 ‖ T015; T018 ‖ T016–T017 (fișiere diferite)
- T022 ‖ T021
- T025 ‖ T026

---

## Parallel Example: User Story 2

```text
Task: "T013 [US2] payment-retention.test.ts — valorile previous_* la aplicarea prelungirii"
Task: "T014 [US2] payment-refund.test.ts — revenire și ajustare manuală"
Task: "T015 [US2] admin-payment-notice.test.ts — motivul RETENTION_MANUAL"
Task: "T018 [US2] worker: tipul și textul RETENTION_MANUAL"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2: rambursările se înregistrează
2. Phase 3: rambursarea activării suspendă evenimentul
3. **Stop și validare**: scenariile 1–4 din quickstart
4. Deploy: migrația imediat după merge, apoi `update.sh` (cron-ul instalează imaginile)

### Incremental Delivery

1. MVP (US1) → riscul principal închis
2. US2 → prelungirile rambursate
3. US3 → vizibilitatea în foaia „Plăți”

---

## Notes

- Toate efectele trec prin `register_refund`; codul web doar transmite suma din webhook
- `refund_effect` se setează o singură dată per plată (SC-003)
- Rambursările făcute înainte de deploy au fost marcate „ignored” în jurnal și nu se reaplică

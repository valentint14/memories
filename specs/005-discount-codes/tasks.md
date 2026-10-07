---
description: "Task list for 005 — coduri de reducere"
---

# Tasks: Coduri de reducere

**Input**: Design documents from `/specs/005-discount-codes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluse. Constituția (VI) cere testele pentru fluxurile critice scrise înainte și
verificate că eșuează. Codurile schimbă suma încasată la activare (flux de plată).

**Organization**: sarcinile sunt grupate pe povești de utilizator (US1–US3 din spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: poate rula în paralel (fișiere diferite, fără dependențe nefinalizate)
- **[Story]**: povestea de utilizator (US1…US3)

## Path Conventions

Monorepo: `apps/web/`, `apps/worker/`, `packages/shared/`, `supabase/`. Migrația nouă:
`supabase/migrations/20261007000100_discount_codes.sql`. Funcțiile SQL: `security definer`,
`set search_path = ''`, erori prin `raise_app_error`. Textele prin `t()` și
`apps/web/lib/i18n/messages/ro.ts`. Formularele din administrare urmează `PackageForm` / `EventForm`
(foi, `SheetActions`, `SelectField`, `DateField`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: codurile de eroare și ajutoarele de test

- [X] T001 [P] Adaugă în `packages/shared/src/errors.ts` codurile `DISCOUNT_INVALID`, `DISCOUNT_UNAVAILABLE`, `DISCOUNT_RESERVED` și textele lor în `apps/web/lib/i18n/messages/ro.ts › errors.*`: „Codul nu există sau nu mai este valabil.”, „Codul a fost deja folosit.”, „Codul este folosit într-o plată în curs. Încearcă din nou peste câteva minute.” (contracts/web-interface.md)
- [X] T002 [P] În `supabase/tests/support/payments.ts` adaugă `discountCode(opts)` (inserează direct un rând în `discount_codes` ca `postgres`: `kind`, `discount_type`, `discount_value`, `max_uses`, `expires_at`, `disabled_at`, cu cod aleator valid din alfabetul `23456789ABCDEFGHJKMNPQRSTUVWXYZ`) și `prepareWithCode(client, eventId, months, code, expected?)` (apelează `prepare_payment` cu `p_discount_code`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tabelul codurilor, coloanele pe plăți și calculul reducerii, de care depind toate poveștile

**⚠️ CRITICAL**: nicio poveste nu poate începe înainte de această fază

- [X] T003 Creează `supabase/migrations/20261007000100_discount_codes.sql` cu: enum-urile `discount_kind ('personal', 'campaign')` și `discount_type ('fixed', 'percent')`; tabelul `public.discount_codes` din data-model.md (`code text unique` cu format `^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$`; `discount_value bigint` cu „`fixed`: > 0; `percent`: între 1 și 99”; `max_uses int` cu „`personal`: 1; `campaign`: între 2 și 1000”; `note` „cel mult 200 de caractere”; `expires_at`, `disabled_at`, `batch_id uuid not null`, `created_by` → `auth.users on delete set null`, `created_at default now()`); RLS activ, `select` doar pentru `is_admin()`, fără drepturi de scriere pentru `anon`/`authenticated`
- [X] T004 În aceeași migrație: coloanele pe `public.payments` — `discount_code_id uuid references public.discount_codes (id) on delete restrict`, `full_amount_minor bigint`, `discount_minor bigint` — cu constrângerea `payments_discount` („fie toate trei null, fie toate setate”; `discount_minor > 0`; `amount_minor = full_amount_minor - discount_minor`; `amount_minor >= 300`; doar pentru `purpose = 'activation'`) și indexul `payments_discount_code_idx on public.payments (discount_code_id) where status in ('open', 'paid', 'refund_due')`
- [X] T005 În aceeași migrație, funcțiile interne (fără drepturi pentru clienți): `normalize_discount_code(text) returns text` (majuscule, fără spații și cratime), `discount_amount(p_code public.discount_codes, p_full bigint) returns bigint` (research R4: `fixed` → valoarea; `percent` → `round(p_full * valoare / 100.0)`; apoi `least(rezultat, greatest(p_full - 300, 0))`), `discount_code_uses(p_code_id uuid) returns int` (plăți cu codul în `open`, `paid`, `refund_due`) și `check_discount_code(p_code public.discount_codes, p_email citext, p_ignore_payment uuid) returns void` (ridică `DISCOUNT_INVALID` dacă e dezactivat sau expirat; `DISCOUNT_UNAVAILABLE` la `personal` cu o utilizare definitivă, la `campaign` cu utilizări definitive = maxim sau cu o utilizare a aceluiași email; `DISCOUNT_RESERVED` când utilizările, inclusiv cele `open`, ating maximul; plata `p_ignore_payment` nu se numără)
- [X] T006 Aplică migrația local (`corepack pnpm exec supabase migration up --local`) și regenerează tipurile (`corepack pnpm db:types`)
- [X] T007 [P] Test DB `supabase/tests/functions/discount-codes.test.ts` (nou), scris înaintea T003–T005 și verificat că pică: constrângerile tabelului (valori în afara intervalelor, `max_uses` greșit pe fel, format greșit) și ale plății (`payments_discount`); `discount_amount`: sumă fixă, procent rotunjit la ban, limitarea la 3,00 lei, preț întreg sub 3 lei → 0; RLS: un organizator nu vede `discount_codes`, un admin le vede

**Checkpoint**: modelul de date și calculul reducerii sunt gata

---

## Phase 3: User Story 1 - Administratorul generează coduri de reducere (Priority: P1) 🎯 MVP

**Goal**: administratorul generează coduri personale (în lot) și de campanie, le copiază și le dezactivează

**Independent Test**: 5 coduri personale de 50 lei și un cod de campanie de 15% cu maximum 30 de utilizări apar în listă, distincte, „disponibile”; un cod dezactivat apare „dezactivat”

### Tests for User Story 1 ⚠️

- [X] T008 [P] [US1] În `supabase/tests/functions/discount-codes.test.ts`: `generate_discount_codes` creează `p_count` coduri personale distincte cu același `batch_id` (formatate `XXXX-XXXX` la întoarcere); campania primește un singur cod cu `max_uses`; validările (personal: 1–100; campanie: `p_count = 1`, maxim 2–1000; procent 1–99; sumă > 0; expirare în viitor; notă ≤ 200) → `VALIDATION`; un organizator primește `FORBIDDEN`; `disable_discount_code` setează `disabled_at`, idempotent; `admin_discount_codes` întoarce starea derivată (disponibil, epuizat, expirat, dezactivat) și utilizările
- [X] T009 [P] [US1] E2E `apps/web/tests/e2e/discount.spec.ts` (nou): adminul deschide „Coduri de reducere” din meniu, generează 3 coduri personale de 50 lei, vede 3 coduri `XXXX-XXXX` și butonul „Copiază tot”; generează un cod de campanie 15%, maxim 30, vede „0 din 30”; dezactivează un cod și îl vede „dezactivat”; verificare axe pe pagină

### Implementation for User Story 1

- [X] T010 [US1] În migrația din T003: `generate_discount_codes(...)` conform contracts/database-functions.md (cod din 8 caractere ale alfabetului, cu `extensions.gen_random_bytes`, reîncercare la coliziune), `disable_discount_code(p_id uuid)` și `admin_discount_codes()` (lista cu `uses`, `status` derivat după data-model.md › „Starea afișată” și utilizările: `event_id`, `event_name`, `organizer_email`, starea plății, `paid_at`); toate verifică `is_admin()` (altfel `FORBIDDEN`); `grant execute … to authenticated`
- [X] T011 [P] [US1] `apps/web/lib/admin/discounts.ts` (nou): `listDiscountCodes(filter)` și tipul rândului, din `admin_discount_codes()`, cu `requireAdmin`
- [X] T012 [P] [US1] În `apps/web/lib/actions/admin.ts`: `generateDiscountCodes(input)` (schema zod: `kind`, `discountType`, `value` — lei la sumă fixă, convertiți cu `leiToMinor`, procent întreg —, `count`, `maxUses`, `expiresOn` opțional ca dată → sfârșitul zilei în `Europe/Bucharest`, `note`) și `disableDiscountCode(id)`, cu `requireAdmin` și `revalidatePath("/admin/discounts")`
- [X] T013 [P] [US1] `apps/web/components/admin/DiscountGenerateForm.tsx` (nou): foaia „Generează coduri” cu `SelectField` pentru fel și tip, valoarea (lei sau %), câte coduri (personal) sau maximul de utilizări (campanie), `DateField` pentru expirare, nota (cu indicația „fără date personale”); după generare, lista codurilor noi și „Copiază tot” (clipboard, cu mesaj `role="status"`)
- [X] T014 [P] [US1] `apps/web/components/admin/DiscountCodesSheet.tsx` (nou): foaia „Coduri”, cu filtrul de stare, fiecare cod cu felul, reducerea, „x din y” utilizări, expirarea, nota, data și, extins, utilizările (link spre `/admin/events/{id}`, organizatorul, data sau „plată în curs”) și „Dezactivează” (dialog de confirmare, ca la acțiunile de stare)
- [X] T015 [US1] `apps/web/app/admin/discounts/page.tsx` (nou) cu cele două foi (generarea pe rândul ei, lista pe rândul ei); link „Coduri de reducere” în `apps/web/components/nav/SiteHeader.tsx` (lângă „Pachetul”); textele `admin.discounts.*` în `ro.ts`
- [X] T016 [US1] Rulează testele DB și e2e-ul din T009 pe desktop

**Checkpoint**: adminul poate genera și administra coduri

---

## Phase 4: User Story 2 - Organizatorul plătește mai puțin folosind un cod (Priority: P1)

**Goal**: organizatorul aplică un cod, vede prețurile reduse și plătește suma redusă; codul se consumă corect

**Independent Test**: un cod personal aplicat, plătit prin serverul Stripe fals: suma încasată e cea redusă, evenimentul e activ, codul e „epuizat” cu evenimentul; același cod e respins la alt organizator

### Tests for User Story 2 ⚠️

- [X] T017 [P] [US2] În `supabase/tests/functions/discount-codes.test.ts`: `discount_quote` întoarce prețurile reduse per opțiune (sumă fixă, procent, limitarea la 3 lei), normalizează codul (`k7qm 3xpa`, `K7QM-3XPA`), refuză inexistent/expirat/dezactivat (`DISCOUNT_INVALID`), personal folosit și campanie epuizată sau deja folosită de același email (`DISCOUNT_UNAVAILABLE`), cod rezervat de o plată `open` (`DISCOUNT_RESERVED`); după 10 încercări per email → `RATE_LIMITED`. `prepare_payment` cu cod: îngheață `full_amount_minor`, `discount_minor`, `amount_minor`; `PRICE_CHANGED` dacă suma așteptată e cea întreagă; refuză codul la `retention_extension` (`PAYMENT_NOT_ALLOWED`); o plată expirată sau `failed` eliberează codul; o nouă pregătire a aceluiași eveniment înlocuiește plata și nu se blochează singură; două pregătiri concurente cu același cod personal (două conexiuni, în paralel) → una reușește, cealaltă `DISCOUNT_RESERVED`; `complete_payment` pe plata cu cod activează evenimentul cu `base_price_minor` neschimbat
- [X] T018 [P] [US2] Test unitar în `apps/web/tests/unit/stripe-checkout.test.ts`: cu cod, `price_data.unit_amount` e suma redusă, descrierea conține „Reducere” și codul, `metadata.discount_code` e setat; fără cod, parametrii sunt cei din 003
- [X] T019 [P] [US2] În `apps/web/tests/e2e/discount.spec.ts`: organizatorul aplică un cod personal (generat prin `discountCode`), vede prețul tăiat și prețul redus, plătește prin serverul Stripe fals (ca în `payment.spec.ts`), evenimentul devine activ, iar plata are suma redusă; alt organizator primește „Codul a fost deja folosit.”; „Elimină codul” readuce prețurile întregi; un cod greșit arată mesajul lângă câmp; verificare axe pe foaia de plată

### Implementation for User Story 2

- [X] T020 [US2] În migrația din T003: `discount_quote(p_event_id uuid, p_code text, p_ip_hash text)` conform contracts/database-functions.md (eveniment al utilizatorului în `awaiting_activation`; limitele `discount:email:` 10/oră și `discount:ip:` 30/oră prin `check_rate_limit`; `check_discount_code` fără blocare; opțiunile din `activation_quote` cu `full_amount_minor`, `discount_minor`, `amount_minor`), `grant execute … to authenticated`
- [X] T021 [US2] În aceeași migrație: `drop function` + `create function public.prepare_payment(p_event_id uuid, p_purpose public.payment_purpose, p_option_id uuid, p_expected_amount_minor bigint, p_discount_code text default null)`, ca în `supabase/migrations/20261002000400_payment_functions.sql` (inclusiv expirarea la 23 h), plus ramura de cod din contracts/database-functions.md (doar `activation`; limita per email; `select … from public.discount_codes where code = normalize_discount_code(p_discount_code) for update`; `check_discount_code` cu `p_ignore_payment` = plata deschisă a evenimentului; reducerea cu `discount_amount`; reluarea plății deschise doar la același cod și aceeași sumă); aceleași drepturi ca în 003
- [X] T022 [US2] Regenerează `packages/shared/src/db.types.ts`; în `apps/web/lib/organizer/activation.ts` tipul opțiunii primește `fullAmountMinor` și `discountMinor` (0 fără cod)
- [X] T023 [US2] În `apps/web/lib/actions/payments.ts`: `applyDiscountForm(prev, formData)` (`eventId`, `discountCode`; `discount_quote` cu `hashedClientIp()`; întoarce opțiunile reduse și codul formatat, sau eroarea) și, în `startPaymentForm`, `discountCode` opțional trimis ca `p_discount_code`
- [X] T024 [US2] În `apps/web/lib/stripe/checkout.ts`: parametrii sesiunii primesc opțional `discountMinor` și `discountCode` (descrierea și `metadata.discount_code`, contracts/stripe-checkout.md); `startPaymentForm` îi citește din plata pregătită (`full_amount_minor`, `discount_minor`, codul)
- [X] T025 [US2] În `apps/web/components/self-service/PayActivationForm.tsx`: câmpul „Cod de reducere” cu „Aplică” (`formAction` = `applyDiscountForm`), starea codului aplicat („Cod {COD} · reducere {sumă}”, „Elimină codul”), prețul întreg tăiat (cu text pentru cititoare de ecran) și prețul redus la fiecare opțiune, câmpurile ascunse `discountCode` și `amount_{id}` reduse, erorile cu `role="alert"`; textele `activation.discount.*` în `ro.ts`
- [X] T026 [US2] Rulează testele DB, unitare și e2e-ul din T019 pe desktop, Pixel 7 și iPhone 15

**Checkpoint**: MVP complet — codurile se generează și se folosesc la plată

---

## Phase 5: User Story 3 - Administratorul urmărește codurile (Priority: P2)

**Goal**: lista arată utilizările, iar foaia „Plăți” arată reducerea

**Independent Test**: după plata cu cod, lista codurilor arată evenimentul și data, iar foaia „Plăți” arată prețul întreg, reducerea, codul și suma încasată

### Tests for User Story 3 ⚠️

- [ ] T027 [P] [US3] În `apps/web/tests/e2e/discount.spec.ts`: după plata cu cod, adminul vede la cod utilizarea (evenimentul cu link și data), iar în `/admin/events/{id}` foaia „Plăți” arată „Preț întreg … · reducere … (cod …)”; filtrul „epuizat” arată codul

### Implementation for User Story 3

- [ ] T028 [US3] În `apps/web/lib/admin/queries.ts › listPayments` citește `full_amount_minor`, `discount_minor` și codul (`discount_codes(code)`), expuse ca `fullAmountMinor`, `discountMinor`, `discountCode`
- [ ] T029 [US3] În `apps/web/components/admin/PaymentsSheet.tsx`: pentru o plată cu cod, rândul „Preț întreg {sumă} · reducere {sumă} (cod {COD})” (contracts/web-interface.md); textul `admin.payments.discount` în `ro.ts`
- [ ] T030 [US3] Rulează e2e-ul din T027 pe desktop și mobil

**Checkpoint**: toate poveștile funcționează independent

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T031 [P] În `docs/livrare-server-propriu.md › 8. Plățile` adaugă o notă despre codurile de reducere (generate din administrare, suma minimă de 3,00 lei, factura cu prețul întreg și reducerea din foaia „Plăți”)
- [ ] T032 Porțile complete: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test:unit`, `corepack pnpm test:db`, `corepack pnpm test:worker`, e2e (desktop + mobil) cu serverul Stripe fals
- [ ] T033 Scenariile manuale 1–12 din [quickstart.md](./quickstart.md) cu Stripe în modul test
- [ ] T034 Scrie `specs/005-discount-codes/raport-implementare.md` (constituția: ce s-a realizat, cum, verificare, limitări)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: fără dependențe
- **Foundational (Phase 2)**: după Setup; blochează toate poveștile
- **US1 (Phase 3)** și **US2 (Phase 4)**: după Foundational; independente (testele US2 creează codurile direct în bază). US2 folosește în e2e generarea doar dacă US1 e gata; altfel `discountCode` din T002
- **US3 (Phase 5)**: după US2 (are nevoie de plăți cu cod)
- **Polish (Phase 6)**: după poveștile dorite

### Within Each User Story

- Testele întâi, verificate că pică
- Migrația înaintea codului web; tipurile regenerate după migrație
- Povestea completă înainte de următoarea

### Parallel Opportunities

- T001 ‖ T002
- T008 ‖ T009; T011 ‖ T012 ‖ T013 ‖ T014 (după T010)
- T017 ‖ T018 ‖ T019; T024 ‖ T025 (după T023)
- T031 ‖ celelalte din Polish

---

## Parallel Example: User Story 1

```text
Task: "T011 [US1] lib/admin/discounts.ts — listDiscountCodes"
Task: "T012 [US1] lib/actions/admin.ts — generateDiscountCodes, disableDiscountCode"
Task: "T013 [US1] components/admin/DiscountGenerateForm.tsx"
Task: "T014 [US1] components/admin/DiscountCodesSheet.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 + Phase 2: modelul și calculul
2. Phase 3: adminul generează coduri
3. Phase 4: organizatorul le folosește la plată
4. **Stop și validare**: scenariile 1–10 din quickstart
5. Deploy: migrația cu `supabase db push` (e compatibilă cu versiunea veche: coloane noi nule, `prepare_payment` cu parametru opțional), apoi merge

### Incremental Delivery

1. MVP (US1 + US2) → reducerile funcționează
2. US3 → evidența pentru facturare

---

## Notes

- Utilizările unui cod sunt plățile lui `open` / `paid` / `refund_due`: nimic de eliberat manual (research R2)
- Codul e blocat (`for update`) doar în `prepare_payment`; previzualizarea nu blochează
- `activation_quote` rămâne neschimbată; prețul cu cod vine din `discount_quote`

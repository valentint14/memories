# Implementation Plan: Coduri de reducere

**Branch**: `005-discount-codes` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-discount-codes/spec.md`

## Summary

Administratorul generează coduri de reducere (sumă fixă sau procent; personale, câte unul per client,
sau de campanie, cu un număr maxim de utilizări, una per organizator). Organizatorul aplică codul în
foaia de plată a activării și vede prețurile reduse; `prepare_payment` (003) validează codul cu
rândul lui blocat, calculează reducerea (suma de plată nu coboară sub 3,00 lei) și o îngheață pe
plată, alături de prețul întreg. Utilizările unui cod sunt plățile lui deschise sau încasate, deci
o plată eșuată sau expirată eliberează automat codul. Stripe primește doar suma redusă; webhook-urile
și confirmarea nu se schimbă. Administrarea are o pagină nouă, „Coduri de reducere”, iar foaia
„Plăți” arată reducerea.

## Technical Context

**Language/Version**: TypeScript strict pe Node.js 24 LTS; SQL (Postgres 17) — neschimbat

**Primary Dependencies**: cele existente (Next.js 16.3, React Aria, `stripe` 22.6.2,
`@internationalized/date`); nicio dependență nouă

**Storage**: Supabase Postgres: 1 tabel nou (`discount_codes`), 2 enum-uri, 3 coloane pe `payments`,
3 funcții noi (`generate_discount_codes`, `disable_discount_code`, `discount_quote`) și o listă
pentru admin; `prepare_payment` cu un parametru nou

**Testing**: Vitest (`db`, `web`), Playwright (desktop, Pixel 7, iPhone 15) cu serverul Stripe fals

**Target Platform**: instanța Oracle Cloud ([docs/livrare-server-propriu.md](../../docs/livrare-server-propriu.md)) — neschimbat

**Project Type**: aplicație web, monorepo pnpm (`apps/web`, `apps/worker`, `packages/shared`, `supabase/`)

**Performance Goals**: prețul redus afișat în ≤ 2 s (SC-002); generarea a 100 de coduri într-o
singură cerere

**Constraints**: suma redusă calculată și înghețată în Postgres (003, R6); cel mult `max_uses`
utilizări, inclusiv la plăți simultane (SC-003); suma de plată ≥ 3,00 lei (R4); codurile nu se
pot ghici (R1, R6)

**Scale/Scope**: zeci–sute de coduri; 1 pagină de admin nouă, 1 foaie de plată modificată, foaia
„Plăți” modificată

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principiu | Verificare | Stare |
| --- | --- | --- |
| I. Fără fricțiune pentru invitați | Pagina invitatului neschimbată. | ✅ |
| II. GDPR | Codurile nu conțin date personale; utilizările se leagă de plăți, care se anonimizează ca în 003. Nota internă e pentru administrator; textul de ajutor cere să nu conțină date personale. | ✅ |
| III. Securitate implicită | Coduri aleatoare cu generator criptografic, alfabet de 31 de simboluri, 8 caractere; încercările limitate per email și IP; RLS pe `discount_codes` (citire doar admin, scriere prin funcții); suma calculată pe server. | ✅ |
| IV. Pipeline media scalabil | Neschimbat. | ✅ |
| V. Timp real fiabil | Neschimbat. | ✅ |
| VI. Calitate și testare | Teste DB scrise înainte pentru validare, limite și plăți simultane (flux de plată = critic); e2e pe mobil. | ✅ |
| VII. Simplitate | Utilizările derivate din plăți, fără tabel de utilizări (R2); reducerea calculată în `prepare_payment`, fără cupoane Stripe (R7). | ✅ |
| VIII. Accesibilitate și localizare | Texte în `messages/ro.ts`; erorile cu `role="alert"`; prețul tăiat are și text pentru cititoare de ecran; axe pe pagina nouă de admin și pe foaia de plată. | ✅ |
| Constrângeri tehnologice | Nicio dependență nouă. | ✅ |
| Flux de dezvoltare | Branch `005-discount-codes` din `main` actualizat; raportul la final. | ✅ |

**Re-evaluare după Phase 1**: data-model și contractele nu introduc abateri. Poarta rămâne trecută.

## Project Structure

### Documentation (this feature)

```text
specs/005-discount-codes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── database-functions.md
│   ├── web-interface.md
│   └── stripe-checkout.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/20261007000100_discount_codes.sql  # tabel, enum-uri, coloane pe payments, funcții, prepare_payment
└── tests/functions/discount-codes.test.ts        # nou

apps/web/
├── app/admin/discounts/page.tsx                  # nou
├── components/admin/{DiscountGenerateForm,DiscountCodesSheet,PaymentsSheet}.tsx
├── components/self-service/PayActivationForm.tsx # câmpul de cod, prețurile reduse
├── components/nav/SiteHeader.tsx                 # link „Coduri de reducere”
├── lib/actions/{payments,admin}.ts               # applyDiscountForm, startPaymentForm, generare, dezactivare
├── lib/admin/{discounts,queries}.ts              # lista codurilor; listPayments cu reducerea
├── lib/stripe/checkout.ts                        # descrierea și metadata cu codul
├── lib/i18n/messages/ro.ts
└── tests/
    ├── unit/stripe-checkout.test.ts
    └── e2e/discount.spec.ts                      # nou

packages/shared/src/{errors.ts,db.types.ts}
```

**Structure Decision**: aceeași structură; regulile codurilor stau în Postgres, lângă plăți;
`apps/web` face interfața și transmite codul; worker-ul nu se schimbă.

## Complexity Tracking

| Abatere / complexitate | De ce e necesară | Alternativa mai simplă respinsă pentru că |
| --- | --- | --- |
| Blocarea rândului codului în `prepare_payment` | SC-003 la plăți simultane | Numărarea fără blocare lasă două plăți să treacă de limită |

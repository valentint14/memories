# Data Model: Coduri de reducere (005)

O migrație nouă, `supabase/migrations/20261007000100_discount_codes.sql`.

## `discount_codes` (nou)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | `uuid` pk | `gen_random_uuid()` |
| `code` | `text` unic | 8 caractere din `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, normalizat (R1) |
| `kind` | `discount_kind` (`personal`, `campaign`) | |
| `discount_type` | `discount_type` (`fixed`, `percent`) | |
| `discount_value` | `bigint` | `fixed`: bani, > 0; `percent`: între 1 și 99 |
| `max_uses` | `int` | `personal`: 1; `campaign`: între 2 și 1000 |
| `expires_at` | `timestamptz` | opțional; în viitor la generare |
| `disabled_at` | `timestamptz` | setat la dezactivare |
| `note` | `text` | opțional, cel mult 200 de caractere |
| `batch_id` | `uuid` | același pentru codurile generate împreună |
| `created_by` | `uuid` → `auth.users` (`on delete set null`) | |
| `created_at` | `timestamptz` | `now()` |

Constrângeri: `discount_codes_value` (intervalele de mai sus pe tip), `discount_codes_uses`
(`kind = 'personal' and max_uses = 1` sau `kind = 'campaign' and max_uses between 2 and 1000`),
`discount_codes_code` (format).

RLS: activ; `select` doar pentru `is_admin()`; fără drepturi de scriere pentru clienți (scrierea
prin funcții `security definer`).

## `payments` — coloane noi

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `discount_code_id` | `uuid` → `discount_codes` (`on delete restrict`) | doar pentru `purpose = 'activation'` |
| `full_amount_minor` | `bigint` | prețul întreg; setat împreună cu codul |
| `discount_minor` | `bigint` | > 0; `amount_minor = full_amount_minor − discount_minor`; `amount_minor ≥ 300` |

Constrângere `payments_discount`: fie toate trei null, fie toate setate, cu relațiile de mai sus.
Index `payments_discount_code_idx` pe `(discount_code_id)` `where status in ('open', 'paid', 'refund_due')`.
Anonimizarea plății (003) nu atinge aceste coloane (FR-015).

## Utilizările (derivate, R2)

Utilizare = plată cu `discount_code_id` și `status in ('open', 'paid', 'refund_due')`:
- `open`: rezervată (contează la limită);
- `paid` / `refund_due`: definitivă.

Reguli verificate în `prepare_payment`, cu rândul codului blocat (R3):
- utilizări < `max_uses`;
- `campaign`: nicio utilizare cu același `organizer_email`;
- `personal`: nicio utilizare (max 1).

## Starea afișată a codului

```
disabled_at setat        → dezactivat
expires_at ≤ acum        → expirat
utilizări = max_uses     → epuizat   (utilizări rezervate incluse)
altfel                   → disponibil
```

## Erori noi (`packages/shared/src/errors.ts`)

`DISCOUNT_INVALID` (inexistent, expirat, dezactivat), `DISCOUNT_UNAVAILABLE` (personal folosit,
campanie epuizată sau deja folosită de organizator), `DISCOUNT_RESERVED` (rezervat de o plată în
curs, fără alte utilizări libere). Peste limita de încercări: `RATE_LIMITED` (existent).

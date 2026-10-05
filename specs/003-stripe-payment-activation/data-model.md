# Data Model: Activarea evenimentului prin plată online (Stripe)

Completează modelul din [001](../001-event-qr-upload/data-model.md) și
[002](../002-self-service-events/data-model.md). Toate tabelele noi au RLS activ (constituția
III); scrierea se face doar prin funcțiile din
[contracts/database-functions.md](./contracts/database-functions.md).

## Enumerări

| Tip | Valori | Notă |
| --- | --- | --- |
| `payment_purpose` (nou) | `activation`, `retention_extension` | scopul plății |
| `payment_status` (nou) | `open`, `paid`, `failed`, `expired`, `refund_due` | „începută, reușită, eșuată, expirată, de rambursat” din spec |
| `retention_actor` (extins) | + `payment` | autorul unei prelungiri plătite în istoricul păstrării (001/FR-043) |
| `status_change_source` (existent) | `payment` există deja (002) | sursa activării și a suspendării pentru contestație |

## `payments` (nou)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | uuid PK | |
| `event_id` | uuid null → `events(id)` `on delete set null` | null după ștergerea evenimentului; rândul rămâne pentru facturare (FR-018) |
| `event_name` | text not null | copie la pregătire (pentru emailuri și facturare după ștergere) |
| `organizer_email` | citext not null | copie la pregătire |
| `created_by` | uuid → `auth.users` `on delete set null` | organizatorul care a început plata |
| `purpose` | `payment_purpose` not null | |
| `retention_option_id` | uuid not null → `retention_options` | opțiunea aleasă (activare: opțiunea de păstrare; prelungire: noua opțiune) |
| `retention_months` | int not null | copie a opțiunii la pregătire |
| `base_price_minor` | bigint not null ≥ 0 | activare: prețul pachetului; prelungire: prețul de bază al evenimentului |
| `surcharge_minor` | bigint not null ≥ 0 | suplimentul opțiunii la pregătire |
| `amount_minor` | bigint not null > 0 | suma încasată: activare = bază + supliment; prelungire = (bază + supliment nou) − prețul final plătit anterior |
| `currency` | text not null default `'ron'` | check `= 'ron'` |
| `status` | `payment_status` not null default `'open'` | |
| `stripe_session_id` | text unique | setat după crearea sesiunii Checkout |
| `stripe_payment_intent_id` | text unique null | setat la finalizare; cheia pentru contestații |
| `checkout_url` | text null | URL-ul sesiunii, pentru reluare (R5); golit la închidere |
| `expires_at` | timestamptz not null | ≤ acum + 24 h și ≤ ștergerea automată − 1 h (FR-008) |
| `paid_at` | timestamptz null | |
| `refund_reason` | text null | `EVENT_NOT_AWAITING`, `DUPLICATE_PAYMENT`, `EXTENSION_NOT_POSSIBLE`, `EVENT_DELETED` |
| `disputed_at` | timestamptz null | setat la `charge.dispute.created` |
| `billing_name` | text null | FR-012a (obligatoriu la Stripe) |
| `billing_address` | jsonb null | `{ line1, line2, city, postal_code, state, country }` |
| `billing_company` | text null | opțional |
| `billing_tax_id` | text null | opțional (CUI) |
| `created_at`, `updated_at` | timestamptz | |

**Constrângeri**
- index unic parțial `(event_id, purpose) where status = 'open'` (FR-007);
- index unic parțial `(event_id) where purpose = 'activation' and status = 'paid'` — cel mult o
  activare plătită (a doua plată reușită devine `refund_due`, FR-011);
- `status = 'paid'` ⇒ `paid_at` și `stripe_payment_intent_id` nenule;
- `status = 'refund_due'` ⇒ `refund_reason` nenul.

**RLS**: `select` pentru administratori (`is_admin()`, aal2); organizatorul nu citește tabelul
direct (starea plății pentru pagina lui vine din `organizer_payment_state`). Fără
`insert/update/delete` pentru clienți.

**Retenție (FR-018)**: rândurile se anonimizează odată cu evenimentul (001/FR-047): la
anonimizare se golesc `event_name`, `organizer_email`, `billing_*`; suma, data și referințele
rămân. Plățile `open`/`expired`/`failed` mai vechi de 90 de zile, fără eveniment, se șterg.

### Tranzițiile plății

```text
open ──(Checkout plătit, eveniment eligibil)──▶ paid
open ──(Checkout plătit, eveniment neeligibil sau a doua plată)──▶ refund_due
open ──(checkout.session.expired / înlocuită, R5)──▶ expired
open ──(async_payment_failed)──▶ failed
paid ──(charge.dispute.created)──▶ paid + disputed_at   (starea plății nu se schimbă)
```

O plată care nu e `open` nu se mai modifică, cu excepția `disputed_at`.

## `stripe_webhook_events` (nou)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | text PK | `evt_…` de la Stripe: o singură procesare per eveniment |
| `type` | text not null | |
| `received_at` | timestamptz not null default now() | |
| `processed_at` | timestamptz null | null = de reluat |
| `outcome` | text null | ex. `activated`, `already_active`, `refund_due`, `ignored`, `suspended` |

Nu se păstrează corpul evenimentului (doar identificatorul și rezultatul). Rândurile mai vechi
de 90 de zile se șterg (`pg_cron`). RLS: doar administratori, citire.

## `events` (modificări de comportament, fără coloane noi)

- **Activarea prin plată** (`activate_event` cu sursa `payment` și plata ca parametru): copiază
  din plata înghețată `base_price_minor`, `retention_option_id`, iar snapshot-ul suplimentului
  (`retention_surcharge_minor`, `retention_months`) se setează din plată, nu din opțiunea curentă
  (R6). `final_price_minor` (coloană generată) = suma plătită.
- **Prelungirea plătită**: `retention_option_id` și snapshot-urile se setează din plată, cu
  `app.retention_actor = 'payment'`; `purge_at` se recalculează ca în 001/FR-040.
- **Suspendarea pentru contestație**: tranziție `active → suspended`, sursa `payment`, motivul
  „Plată contestată”, `external_ref` = `stripe_payment_intent_id`.

## `activation_requests` (002, scos din flux)

Tabelul rămâne pentru istoric; `request_activation` nu mai e apelabilă (FR-015). Registrul
adminului nu mai folosește `last_activation_request_at` pentru grupare.

## `retention_notices` (002, prag `activation_7d`)

Neschimbat ca model; doar textul emailului trimite la plată.

## Coduri de eroare noi (`packages/shared/src/errors.ts`)

| Cod | Când |
| --- | --- |
| `PAYMENT_NOT_ALLOWED` | evenimentul nu e în starea potrivită pentru scopul plății sau nu aparține organizatorului |
| `PAYMENT_WINDOW_CLOSED` | sub 30 de minute până la ștergerea automată (R5) |
| `PAYMENT_UNAVAILABLE` | procesatorul nu răspunde sau refuză crearea sesiunii (cazul „procesatorul indisponibil”) |
| `RETENTION_NOT_LONGER`, `OPTION_INACTIVE`, `PRICE_CHANGED` | existente (001), refolosite la pregătirea prelungirii |

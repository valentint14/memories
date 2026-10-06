# Data Model: Rambursările plăților Stripe (004)

Completează [003/data-model.md](../003-stripe-payment-activation/data-model.md). O singură
migrație nouă; nicio tabelă nouă.

## `payments` — coloane noi

| Coloană | Tip | Reguli | Cerință |
| --- | --- | --- | --- |
| `refunded_minor` | `bigint not null default 0` | `0 <= refunded_minor <= amount_minor`; nu scade niciodată | FR-002, FR-003 |
| `refunded_at` | `timestamptz` | momentul ultimei rambursări (`event.created`); null cât `refunded_minor = 0` | FR-002, FR-012 |
| `refund_effect` | `text` | null până la rambursarea integrală; apoi una dintre `suspended`, `retention_reverted`, `manual_adjustment`, `none`; setat o singură dată | FR-004–FR-012, SC-003 |
| `previous_retention_option_id` | `uuid` → `retention_options` (`on delete restrict`) | doar pentru prelungiri aplicate; null altfel | FR-007, FR-009 |
| `previous_retention_months` | `int` | idem; între 1 și 60 | FR-007 |
| `previous_surcharge_minor` | `bigint` | idem; ≥ 0 | FR-007 |

Constrângeri noi:

- `payments_refunded_range`: `refunded_minor between 0 and amount_minor`;
- `payments_refund_effect`: `refund_effect is null or refund_effect in ('suspended', 'retention_reverted', 'manual_adjustment', 'none')`;
- `payments_refund_effect_full`: `refund_effect is null or refunded_minor = amount_minor`;
- `payments_previous_retention`: cele trei coloane `previous_*` sunt fie toate null, fie toate
  setate, și doar pentru `purpose = 'retention_extension'`.

Starea `payment_status` nu se schimbă (research R2). Stările derivate, pentru afișare:

| Condiție | Afișare |
| --- | --- |
| `refunded_minor = 0` | ca în 003 |
| `0 < refunded_minor < amount_minor` | „rambursată parțial” + suma |
| `refunded_minor = amount_minor` | „rambursată” + efectul (`refund_effect`) |

RLS și drepturi: neschimbate (citire doar admin, scriere doar prin funcții `security definer`).
Anonimizarea (003, `anonymize_event_payments`) nu atinge coloanele noi: nu sunt date personale.

## Efectul rambursării integrale (`register_refund`)

```
plată găsită după payment_intent ── nu ──▶ ignored
   │ da
suma primită ≤ refunded_minor ──────── da ──▶ ignored (repetare / ordine inversă)
   │ nu: refunded_minor := min(sumă, amount_minor), refunded_at := moment
refunded_minor < amount_minor ──────── da ──▶ partial
   │ nu (integrală)
refund_effect setat deja ────────────── da ──▶ ignored
   │ nu
status = refund_due ─────────────────────────▶ none
purpose = activation:
   eveniment activ ─── da ──▶ suspended (transition_event, „Plată rambursată”)
                   └── nu ──▶ none
purpose = retention_extension:
   eveniment inactiv sau șters ─────────────▶ none
   previous_* lipsă, schimbare a păstrării după paid_at,
   sau noua dată ≤ acum + 7 zile ────────────▶ manual_adjustment (+ email RETENTION_MANUAL)
   altfel ───────────────────────────────────▶ retention_reverted (opțiunea de dinainte, cu snapshot)
```

## Tranziții de stare ale evenimentului

Doar `active → suspended`, prin `transition_event` (002), cu sursa `payment`, motivul
„Plată rambursată” și `external_ref` = `payment_intent`. Reactivarea: doar administratorul (002).

## Istoricul păstrării

Revenirea scrie un rând în `event_retention_changes` prin triggerul existent, cu
`actor_kind = 'payment'` (research R6).

## Jurnalul webhook-urilor

`stripe_webhook_events.outcome` primește valorile noi `partial`, `suspended`, `retention_reverted`,
`manual_adjustment`, `none` pentru `charge.refunded` (alături de `ignored`).

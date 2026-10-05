# Contract: webhook-ul Stripe (004)

Completează [003/contracts/stripe-webhooks.md](../../003-stripe-payment-activation/contracts/stripe-webhooks.md).
Endpointul, verificarea semnăturii, deduplicarea și răspunsurile rămân cele din 003.

## Tip nou

| Tip Stripe | Condiție | Acțiune |
| --- | --- | --- |
| `charge.refunded` | `charge.payment_intent` e un string, `charge.currency = "ron"` | `register_refund(charge.payment_intent, charge.amount_refunded, to_timestamp(event.created))` |
| `charge.refunded` | `payment_intent` lipsă sau altă monedă | `outcome = 'ignored'` |

`outcome` = valoarea întoarsă de `register_refund` (`ignored`, `partial`, `none`, `suspended`,
`retention_reverted`, `manual_adjustment`). O eroare a funcției → **500**, ca în 003 (Stripe
reîncearcă).

## Configurare

Destinația de webhook din Stripe (Workbench › Webhooks) primește **6** tipuri: cele 5 din 003 plus
`charge.refunded`. Același endpoint și același secret de semnare.

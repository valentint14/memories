# Contract: Stripe Checkout (005)

Completează [003/contracts/stripe-webhooks.md](../../003-stripe-payment-activation/contracts/stripe-webhooks.md) › „Crearea sesiunii Checkout”.

Pentru o plată cu cod:

| Câmp | Valoare |
| --- | --- |
| `line_items[0].price_data.unit_amount` | `payments.amount_minor` (suma redusă) |
| `line_items[0].price_data.product_data.description` | numele evenimentului + „ · Reducere {discount_minor formatat} (cod {COD})” |
| `metadata` | în plus `discount_code`: codul formatat |

Webhook-urile și verificarea la întoarcere nu se schimbă: suma și codul sunt deja pe plată.

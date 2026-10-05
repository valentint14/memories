# Contract: funcții SQL (004)

Completează [003/contracts/database-functions.md](../../003-stripe-payment-activation/contracts/database-functions.md).
Funcțiile sunt `security definer`, cu `set search_path = ''`.

## Nouă

### `register_refund(p_payment_intent_id text, p_refunded_minor bigint, p_refunded_at timestamptz) → table(outcome text, event_id uuid)`

Execuție: doar `service_role` (handler-ul de webhook). Blochează rândul plății (`for update`).

| Situație | Efect | `outcome` |
| --- | --- | --- |
| nicio plată cu acest `stripe_payment_intent_id` | nimic | `ignored` |
| `p_refunded_minor <= refunded_minor` (repetare, eveniment vechi) | nimic | `ignored` |
| suma nouă < `amount_minor` | `refunded_minor`, `refunded_at` actualizate | `partial` |
| integrală, `refund_effect` deja setat | sumele actualizate, fără efect | `ignored` |
| integrală, `status = 'refund_due'` | `refund_effect = 'none'` | `none` |
| integrală, activare, eveniment `active` | `transition_event(…, 'suspended', 'payment', null, 'Plată rambursată', p_payment_intent_id)`; `refund_effect = 'suspended'` | `suspended` |
| integrală, activare, eveniment inactiv sau șters | `refund_effect = 'none'` | `none` |
| integrală, prelungire, eveniment inactiv sau șters | `refund_effect = 'none'` | `none` |
| integrală, prelungire, condițiile din R5 îndeplinite | opțiunea de dinainte aplicată cu snapshot (`app.payment_snapshot`, `app.retention_actor = 'payment'`); `refund_effect = 'retention_reverted'` | `retention_reverted` |
| integrală, prelungire, eveniment activ, o condiție din R5 neîndeplinită | `refund_effect = 'manual_adjustment'`; `pgmq.send('media_jobs', {type: 'admin_payment_notice', payment_id, reason: 'RETENTION_MANUAL'})` | `manual_adjustment` |

`p_refunded_minor` peste `amount_minor` se limitează la `amount_minor`. Valori negative →
`VALIDATION`.

## Modificate

### `apply_paid_extension(p_payment_id uuid) → text`

Ca în 003, plus: înainte de schimbarea opțiunii, salvează pe plată `previous_retention_option_id`,
`previous_retention_months` și `previous_surcharge_minor` (valorile curente ale evenimentului).
Semnătura și drepturile neschimbate.

## Drepturi

```sql
revoke execute on function public.register_refund(text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.register_refund(text, bigint, timestamptz) to service_role;
```

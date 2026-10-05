# Contract: webhook-ul Stripe și apelurile către Stripe (003)

## Endpoint

`POST /api/stripe/webhook` (Route Handler, runtime Node.js, în `apps/web`).

1. Citește corpul brut (`await request.text()`, maximum 1 MB, altfel 413).
2. Verifică semnătura din antetul `Stripe-Signature` cu `STRIPE_WEBHOOK_SECRET`
   (`stripe.webhooks.constructEvent`, toleranță implicită 300 s). Semnătură lipsă sau invalidă →
   **400**, fără efecte, cu log `webhook_signature_invalid` (fără corp) (FR-017).
3. `record_webhook_event(event.id, event.type)`; dacă a fost deja procesat → **200**.
4. Tratează tipul (tabelul de mai jos); la eroare neprevăzută → **500** (Stripe reîncearcă),
   `processed_at` rămâne null.
5. `finish_webhook_event(event.id, outcome)` → **200**.

| Tip Stripe | Condiție | Acțiune |
| --- | --- | --- |
| `checkout.session.completed` | `payment_status = "paid"` | `complete_payment(session.id, session.payment_intent, billing)` |
| `checkout.session.completed` | `payment_status = "unpaid"` (metodă întârziată) | nimic; se așteaptă evenimentul următor |
| `checkout.session.async_payment_succeeded` | — | `complete_payment(...)` |
| `checkout.session.async_payment_failed` | — | `fail_payment(session.id)` |
| `checkout.session.expired` | — | `expire_payment(session.id)` |
| `charge.dispute.created` | — | `register_dispute(dispute.payment_intent)` |
| orice alt tip | — | `outcome = 'ignored'` |

`billing` se construiește din `session.customer_details`: `name`, `address`, iar firma și codul
fiscal din `customer_details.business_name` și `customer_details.tax_ids[0].value` (dacă
există). Evenimentele cu `metadata.payment_id` lipsă sau necunoscut → `ignored`.

Evenimentele de abonat în contul Stripe (Dashboard › Webhooks): exact cele 5 tipuri de mai sus.

## Crearea sesiunii Checkout (Server Action `startPayment`)

Parametrii trimiși la `checkout.sessions.create` (cheie de idempotență = `payment_id`):

| Câmp | Valoare |
| --- | --- |
| `mode` | `"payment"` |
| `managed_payments.enabled` | `false` (platforma e vânzătorul, FR-012; research R1) |
| `line_items[0].price_data` | `currency: "ron"`, `unit_amount: amount_minor`, `product_data.name`: „Memories — pachet complet, {N} luni” sau „Memories — prelungirea păstrării la {N} luni”, `product_data.description`: numele evenimentului |
| `line_items[0].quantity` | 1 |
| `customer_email` | emailul organizatorului |
| `billing_address_collection` | `"required"` (FR-012a) |
| `tax_id_collection.enabled` | `true` (firmă și CUI opționale, FR-012a) |
| `payment_intent_data.receipt_email` | emailul organizatorului (chitanța Stripe, FR-012) |
| `metadata` | `{ payment_id, event_id, purpose }` (și pe `payment_intent_data.metadata`) |
| `expires_at` | `payments.expires_at` (R5) |
| `locale` | `"ro"` |
| `success_url` | `{APP_URL}/events/{event_id}?plata={CHECKOUT_SESSION_ID}` |
| `cancel_url` | `{APP_URL}/events/{event_id}?plata=anulata` |

La reluarea unei plăți înlocuite: `checkout.sessions.expire(replaced_session_id)`; eroarea
„sesiune deja expirată/finalizată” se ignoră (dacă era finalizată, webhook-ul o va trata ca
`refund_due` sau activare, conform FR-011).

## Verificarea la întoarcere

Pe `/events/{id}?plata={sessionId}`: serverul apelează `checkout.sessions.retrieve(sessionId)`,
verifică `metadata.event_id = id` și, dacă `payment_status = "paid"`, apelează
`complete_payment(...)` exact ca webhook-ul. Altfel nu face nimic (pagina arată starea din
`organizer_payment_state`). Valoarea `anulata` nu apelează Stripe.

## Configurare (variabile de mediu, doar server, `apps/web`)

| Variabilă | Exemplu | Notă |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…` | modul test în dev și CI (FR-019): în afara `NODE_ENV=production`, o cheie `sk_live_` oprește pornirea |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | din Dashboard sau din `stripe listen` |
| `STRIPE_API_BASE` | `http://stripe-mock:12111` | doar teste; gol în producție |

# Contract: interfața web (003)

Completează [contractul din 002](../../002-self-service-events/contracts/web-interface.md).
Textele noi trec prin `t()` (`apps/web/lib/i18n/messages/ro.ts`); butoanele din foi respectă
`SheetActions`.

## Rute

| Rută | Acces | Schimbare |
| --- | --- | --- |
| `/events/[eventId]` (în așteptarea activării) | organizatorul proprietar | foaia „Activarea pachetului complet”: opțiunile de păstrare (radio), cu prețul final și data ștergerii pentru fiecare, preselectată cea inclusă; butonul „Plătește și activează”; mesajele de stare a plății (FR-001, FR-009) |
| `/events/[eventId]` (activ) | organizatorul proprietar | foaia „Păstrarea fișierelor”: după alegerea opțiunii, dialogul arată diferența de plată și noua dată, cu butonul „Plătește prelungirea” (FR-020) |
| `/events/[eventId]?plata={sessionId}` | organizatorul proprietar | verificarea la întoarcere ([stripe-webhooks.md](./stripe-webhooks.md#verificarea-la-întoarcere)), apoi aceeași pagină |
| `/events/[eventId]?plata=anulata` | organizatorul proprietar | mesajul „Plata nu a fost finalizată. Poți încerca din nou.” |
| `POST /api/stripe/webhook` | Stripe (semnătură) | [stripe-webhooks.md](./stripe-webhooks.md) |
| `/admin/events` | administrator | fără grupa „requested” și fără numărul cererilor; evenimentele plătite apar la „active” (FR-015) |
| `/admin/events/[eventId]` | administrator | foaie nouă „Plăți” (pe rândul ei, crește în timp): suma, scopul, starea, data, referința Stripe, datele de facturare, „contestată” (FR-013) |

## Server Actions

### `startPayment({ eventId, purpose, optionId, expectedAmountMinor }) → redirect`

1. Zod: `eventId` uuid, `purpose` ∈ {`activation`, `retention_extension`}, `optionId` uuid,
   `expectedAmountMinor` întreg > 0.
2. `prepare_payment(...)` cu clientul organizatorului (RLS + proprietar).
3. `reuse_url` → `redirect(reuse_url)`.
4. Altfel: dacă `replaced_session_id`, `sessions.expire`; `sessions.create` (parametrii din
   contract); `attach_checkout_session`; `redirect(session.url)`.
5. Erori: `PRICE_CHANGED` (cu suma nouă: pagina se reîncarcă cu prețul actualizat),
   `PAYMENT_WINDOW_CLOSED`, `PAYMENT_NOT_ALLOWED`, `PAYMENT_UNAVAILABLE` → mesaje în foaie,
   deasupra butonului.

Funcționează și fără JavaScript (formular nativ cu acțiune de server; CSP `form-action` include
`https://checkout.stripe.com`, R10).

### `paymentState(eventId) → { status, purpose, paidAt } | null`

Pentru starea „plata se confirmă”: componenta client reîntreabă la 3 s, cel mult 2 minute, și
reîmprospătează pagina când starea devine `paid` (FR-009). După 2 minute: „Confirmarea întârzie;
pagina se va actualiza când sosește. Nu plăti din nou.”

## Mesajele organizatorului

| Situație | Mesaj (rezumat) |
| --- | --- |
| întors cu plată reușită, confirmare sosită | evenimentul apare activ; banda „Plată primită pe {dată}” |
| întors cu plată reușită, confirmare încă nesosită | „Plata se confirmă…” (rol `status`, actualizat automat) |
| plată eșuată / anulată | „Plata nu a reușit sau a fost anulată. Nu s-a încasat nimic. Poți încerca din nou.” |
| `PAYMENT_WINDOW_CLOSED` | „Evenimentul se șterge în curând și nu mai poate fi plătit.” |
| `PAYMENT_UNAVAILABLE` | „Plata nu poate fi pornită acum. Încearcă din nou în câteva minute.” |
| `PRICE_CHANGED` | „Prețul s-a schimbat între timp. Verifică noul preț și apasă din nou.” |

## Eliminate (FR-015)

- `RequestActivationButton`, acțiunea `requestActivation` și textele `activation.request*`.
- Grupa `requested` din `lib/admin/ledger.ts` și banda „Cerere de activare” din fișa adminului
  (rămâne în istoricul stărilor, pentru evenimentele vechi).
- Dialogul de confirmare a prelungirii fără plată (`ExtendRetentionDialog` devine pasul de
  revizuire dinaintea plății).

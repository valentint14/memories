# Raport de implementare: Activarea evenimentului prin plată online (Stripe)

**Branch**: `003-stripe-payment-activation` | **Data**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

## Ce s-a realizat

**Povești de utilizator**: toate patru, cu testele lor.

| Poveste | Cerințe | Stare |
| --- | --- | --- |
| US1 — plată și activare (P1) | FR-001–FR-006, FR-009, FR-010, FR-012, FR-012a | ✅ |
| US2 — plăți eșuate sau abandonate (P1) | FR-007, FR-008, FR-011 | ✅ |
| US3 — administrare, contestații (P2) | FR-013–FR-016a | ✅ |
| US4 — prelungirea plătită (P3) | FR-020–FR-022 | ✅ |
| Securitate și date | FR-017, FR-018, FR-019 | ✅ |

**Sarcini** (`tasks.md`): 57 din 58 finalizate. Rămasă: **T054** (versiune nouă a politicii de
confidențialitate), cu motivul de la „Limitări”.

**Fișiere principale**

- Migrații: `supabase/migrations/20261002000100_payments.sql` … `20261002000800_payment_retention.sql`
  (9 fișiere: tabelele `payments` și `stripe_webhook_events`, `activate_event` cu plată, jurnalul
  webhook-urilor, pregătirea / finalizarea / expirarea plăților, `activation_quote`,
  contestațiile, prelungirea plătită, anonimizarea și curățarea).
- Web: `apps/web/lib/stripe/{client,checkout,billing,webhook,return}.ts`,
  `apps/web/app/api/stripe/webhook/route.ts`, `apps/web/lib/actions/payments.ts`,
  `apps/web/components/self-service/{PayActivationForm,PaymentStatus}.tsx`,
  `apps/web/components/admin/PaymentsSheet.tsx`; modificate: pagina evenimentului organizatorului,
  fișa și registrul adminului, panoul de păstrare, CSP, `proxy.ts`.
- Worker: joburile `payment_confirmation` și `admin_payment_notice`, șabloanele
  `plata-confirmata` și `plata-de-verificat`, textul `stergere-neactivat`.
- Eliminate: `RequestActivationButton`, acțiunile `requestActivation` și `extendRetention`,
  funcția `extendEventRetention`, grupa „Cer activare” din registru.

## Cum s-a realizat

- **Sursa de adevăr pentru bani e Postgres.** `prepare_payment` verifică proprietarul, starea,
  opțiunea și suma așteptată, apoi îngheață în `payments` prețul de bază, suplimentul și suma
  (research R6). La activare și la prelungire, triggerul de retenție primește snapshot-ul din
  plată (`app.payment_snapshot`), deci se aplică exact ce s-a încasat, chiar dacă prețul sau
  catalogul s-au schimbat între timp.
- **Două căi de confirmare, o singură finalizare.** Webhook-ul semnat și verificarea la
  întoarcere (sesiunea citită din API-ul Stripe) apelează aceeași funcție `complete_payment`,
  care blochează rândul plății și e idempotentă. Plățile care nu mai pot fi aplicate devin
  `refund_due` și pun în coadă emailul către administratori.
- **O singură plată deschisă** per (eveniment, scop), prin index unic parțial; o nouă apăsare
  reia sesiunea identică sau o închide la Stripe și creează alta.
- **Contestațiile** (`charge.dispute.created`) suspendă evenimentul activ prin `transition_event`,
  cu sursa „payment” și motivul „Plată contestată”.
- **Opțiunile de păstrare la activare** vin din `activation_quote` (SQL), cu aceeași regulă de
  dată ca `activate_event`, ca prețul și data afișate să fie cele aplicate.
- **Formularele de plată funcționează fără JavaScript**: suma fiecărei opțiuni e un câmp ascuns
  (`amount_{id}`), iar CSP-ul permite `form-action https://checkout.stripe.com`.
- **Webhook-ul nu trece prin proxy** (fără sesiune Supabase și fără CSP pe acea rută).

**Abateri de la plan**

| Abatere | Justificare |
| --- | --- |
| Server Stripe fals cu stare în e2e, nu `stripe/stripe-mock` (R9) | stripe-mock întoarce mereu același id de sesiune (ciocnire cu unicitatea `stripe_session_id`) și nu poate marca o sesiune plătită pentru verificarea la întoarcere. Serverul fals (`apps/web/tests/e2e/support/stripe-fake.mjs`) e pornit de Playwright; CI nu mai are pas Docker separat. R9 actualizat. |
| Funcție nouă `activation_quote` (nu era în contracte) | Data de ștergere estimată pentru fiecare opțiune trebuie calculată cu aceeași regulă ca activarea; calculul în TypeScript ar fi dublat logica. |
| Reluarea plății deschise implementată deja în T020 (planificată în T034) | Aceeași funcție `prepare_payment`; testele US2 au fost scrise înainte de rulare, dar o parte au trecut din prima. |
| `payments.event_name` și `organizer_email` nullable (data-model le avea `not null`) | Anonimizarea (001/FR-047) le golește; suma și referințele rămân. |
| Anonimizarea plăților printr-un trigger pe `events.anonymized_at` | Evită rescrierea funcției `anonymize_expired_events` din 001/002. |
| Admin: plățile se citesc direct din tabel (RLS), nu prin `admin_event_payments` | O funcție în plus nu aducea nimic (constituția VII). |

## Verificare

| Suită | Rezultat |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` (toate proiectele) | ✅ fără erori |
| `pnpm test:unit` (shared + web) | ✅ 119 / 119 (noi: webhook 12, Checkout 9, CSP 1, registru actualizat) |
| `pnpm test:db` | ✅ 212 / 212 (noi: plăți 25, contestații 3, RLS plăți 6, retenție plăți 2, activare cu plată 2) |
| `pnpm test:worker` | ✅ 47 / 48; pică doar `iphone.heic` (lipsește `heif-dec` local; în CI rulează în imaginea worker-ului; cod media neatins) |
| E2E plăți (desktop, Pixel 7, iPhone 15) | ✅ `payment.spec`, `awaiting-activation.spec`, `a11y.spec`: 39 / 39 |
| E2E suita completă (desktop + retenție) | ✅ 69 trecute, 2 sărite (condiționate de mediu) |

Accesibilitatea (axe, WCAG 2.2 AA) e verificată pe pagina evenimentului neactivat cu formularul de
plată, pe plata anulată și pe registrul adminului.

## Limitări și pași următori

- **T054 nefinalizată — politica de confidențialitate.** Specificația 002 spune că textele legale
  le furnizează proprietarul platformei, iar o versiune nouă în vigoare cere tuturor
  organizatorilor o nouă acceptare. Paragraful propus, de adăugat de proprietar într-o versiune
  nouă (`apps/web/content/legal/privacy/<data>.md` + rândul din `legal_documents`):
  > Plățile online sunt procesate de Stripe Payments Europe, Ltd. (Irlanda). Datele cardului se
  > introduc doar pe pagina Stripe; noi nu le primim și nu le stocăm. Păstrăm suma, data,
  > referința plății și datele de facturare (nume, adresă și, opțional, firma și codul fiscal),
  > cât timp păstrăm datele necesare facturării evenimentului, apoi le anonimizăm.
- **Neverificat cu Stripe real**: pagina Checkout găzduită (locale, câmpurile de facturare, codul
  fiscal), webhook-urile livrate de Stripe și chitanțele. De parcurs scenariile din
  [quickstart.md](./quickstart.md) cu un cont Stripe în modul test și `stripe listen`.
- **Producție**: migrațiile 003 de aplicat pe Supabase; cheile și endpointul de webhook din
  [docs/livrare-server-propriu.md](../../docs/livrare-server-propriu.md) › 8. Plățile; regula Cloudflare
  pentru `POST /api/stripe/webhook`.
- **Imaginea worker-ului** trebuie reconstruită (joburile noi `payment_confirmation` și
  `admin_payment_notice`); local, containerul pornit mai vechi nu le cunoaște.
- **`stripe` 23.x**: de evaluat după primul patch (R2).

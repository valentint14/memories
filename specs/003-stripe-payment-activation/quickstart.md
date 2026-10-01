# Quickstart: validarea plății online (003)

Scenarii care dovedesc funcționalitatea cap-coadă. Pornirea aplicației locale: ca în
[docs/pornire-locala.md](../../docs/pornire-locala.md). Detaliile tehnice sunt în
[contracts/](./contracts/) și [data-model.md](./data-model.md).

## Pregătire (o singură dată)

1. Cont Stripe în **modul test** (fără date de firmă pentru test). Din *Developers › API keys*:
   cheia secretă `sk_test_…`.
2. Stripe CLI instalat și autentificat (`stripe login`).
3. În `apps/web/.env.local`:
   ```text
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # afișat de comanda de la pasul 4
   ```
4. Redirecționarea webhook-urilor către aplicația locală (lasă terminalul deschis):
   ```bash
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.dispute.created --forward-to localhost:3000/api/stripe/webhook
   ```
5. Migrațiile 003 aplicate (`supabase migration up`); aplicația și worker-ul pornite.

## Scenarii manuale

| # | Pași | Rezultat așteptat |
| --- | --- | --- |
| 1 | Creează un eveniment self-service, deschide-l, lasă opțiunea inclusă, „Plătește și activează”, card `4242 4242 4242 4242`, nume + adresă | Pe Checkout: numele evenimentului, suma în lei, câmpurile de facturare. După plată: evenimentul e activ, data ștergerii = perioada inclusă; istoricul arată „sistem de plăți” cu referința; email „Plata … a fost primită” în Mailpit |
| 2 | Alt eveniment, alege 12 luni, plătește | Suma = pachet + supliment; după plată, opțiunea 12 luni și data ei |
| 3 | Card `4000 0000 0000 0002` (refuzat), apoi închide Checkout | Evenimentul rămâne în așteptare; mesajul „Plata nu a reușit…”; nicio plată `paid` |
| 4 | Apasă „Plătește și activează” în două file, plătește în prima, apoi în a doua | Prima sesiune a fost închisă la deschiderea celei de-a doua; dacă totuși ambele trec, a doua plată e `refund_due` și adminul primește emailul |
| 5 | Plătește, iar înainte de webhook oprește `stripe listen` | La întoarcere pagina arată activ (verificarea la întoarcere) sau „Plata se confirmă…”; după repornirea `stripe listen`, nicio dublă activare |
| 6 | Pe un eveniment activ: alege o opțiune mai lungă, „Plătește prelungirea” | Diferența de preț pe Checkout; după plată, noua dată de ștergere; istoricul păstrării cu autorul „plată” |
| 7 | Plătește cu `4000 0000 0000 0259` (contestație automată) | Evenimentul devine suspendat cu motivul „Plată contestată”; adminul primește emailul |
| 8 | Admin: fișa evenimentului de la #1 | Foaia „Plăți” cu suma, data, referința, numele și adresa; în registru nu mai există grupa „cer activare” |
| 9 | Retrimite un webhook din Dashboard (*Resend*) | Răspuns 200, nimic nu se schimbă (`stripe_webhook_events`) |
| 10 | Trimite un webhook cu semnătură greșită (`curl` fără antet) | 400, nimic nu se schimbă |

## Teste automate

```bash
pnpm test:db      # funcțiile de plată: pregătire, finalizare, idempotență, contestație, RLS
pnpm test:unit    # handler-ul de webhook cu evenimente semnate, parametrii sesiunii, CSP
pnpm test:worker  # emailurile plata-confirmata și plata-de-verificat
pnpm test:e2e     # cu stripe-mock: redirect spre Checkout + webhook semnat → eveniment activ
```

## Înainte de producție

1. Contul Stripe activat (datele firmei, IBAN), *Settings › Public details* cu numele
   platformei; *Customer emails › Successful payments* activat (chitanțele).
2. *Developers › Webhooks*: endpoint `https://<domeniu>/api/stripe/webhook`, doar cele 5 tipuri;
   secretul în `deploy/web.env` ca `STRIPE_WEBHOOK_SECRET`; `STRIPE_SECRET_KEY=sk_live_…`.
3. Cloudflare: fără provocare (Bot Fight / WAF) pe `POST /api/stripe/webhook`.
4. Politica de confidențialitate: versiune nouă cu Stripe ca procesator (R13).
5. O plată reală mică pe un eveniment de test, rambursată apoi din Dashboard.

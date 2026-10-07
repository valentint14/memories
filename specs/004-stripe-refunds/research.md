# Research: Rambursările plăților Stripe (004)

Contextul tehnic e cel din [003/research.md](../003-stripe-payment-activation/research.md): Stripe
Checkout, webhook-ul semnat `POST /api/stripe/webhook`, jurnalul `stripe_webhook_events`, regulile
de plată în Postgres. Nicio dependență nouă.

## R1. Evenimentul Stripe pentru rambursări

- **Decision**: `charge.refunded`. Obiectul e `Charge`, cu `payment_intent`, `amount` și
  `amount_refunded` (suma **cumulată** rambursată, în unități minore). Stripe îl trimite la fiecare
  rambursare, integrală sau parțială. Momentul rambursării = `event.created`.
- **Rationale**: suma cumulată face procesarea independentă de ordine și de repetări: se reține
  maximul dintre suma înregistrată și cea primită (FR-002). Plata se găsește după
  `payment_intent`, ca la contestații (`register_dispute`).
- **Alternatives considered**: `refund.created` / `refund.updated` (obiectul `Refund`, câte unul per
  rambursare): ar cere însumarea rambursărilor și deduplicarea după id-ul rambursării, plus
  tratarea stărilor `pending`/`failed`; mai mult cod pentru același rezultat. `charge.refund.updated`
  (eșecul unei rambursări): neabonat; anularea unei rambursări nu inversează automat efectele
  (spec, cazuri limită).

## R2. Unde stă suma rambursată

- **Decision**: coloane noi pe `payments`: `refunded_minor` (cumulat, implicit 0, între 0 și
  `amount_minor`), `refunded_at`, `refund_effect` (efectul aplicat o singură dată). Starea plății
  (`payment_status`) rămâne neschimbată: „rambursată integral / parțial” se deduce din
  `refunded_minor` comparat cu `amount_minor`.
- **Rationale**: o valoare nouă în enum (`refunded`) ar schimba semnificația indexului
  `payments_one_paid_activation`, a constrângerii `payments_paid_complete` și a afișării stărilor din
  003; o plată `refund_due` rambursată și-ar pierde motivul. Coloanele separate păstrează istoricul
  plății intact (FR-012, 003/FR-018).
- **Alternatives considered**: un tabel `payment_refunds` cu un rând per rambursare: util pentru
  detalii per rambursare, dar specificația cere doar suma totală și data (VII).

## R3. Idempotența efectelor

- **Decision**: funcția `register_refund` blochează rândul plății (`for update`); aplică efectul
  doar când suma devine integrală **și** `refund_effect` e încă null, apoi îl setează. Deduplicarea
  per eveniment Stripe rămâne în `stripe_webhook_events` (003).
- **Rationale**: aceeași rambursare poate fi anunțată de mai multe ori, sub id-uri de eveniment
  diferite (de ex. retrimitere manuală); `refund_effect` garantează un singur efect per plată
  (SC-003), inclusiv după reactivarea manuală (FR-006).

## R4. Suspendarea la rambursarea activării

- **Decision**: ca la contestații: `transition_event(event, 'suspended', 'payment', null,
  'Plată rambursată', payment_intent)`, doar dacă plata e `paid`, scopul e `activation` și evenimentul
  e `active`. Altfel `refund_effect = 'none'`.
- **Rationale**: aceeași cale ca 003/FR-016a: efectele suspendării (încărcări oprite, fișiere
  păstrate, istoric cu sursa „sistem de plăți”) vin din 002, fără cod nou. O plată deja contestată
  are evenimentul suspendat, deci nu se adaugă o a doua suspendare.

## R5. Revenirea păstrării la rambursarea prelungirii

- **Decision**: la aplicarea prelungirii (`apply_paid_extension`), plata reține opțiunea de dinainte:
  `previous_retention_option_id`, `previous_retention_months`, `previous_surcharge_minor`. La
  rambursarea integrală se readuce opțiunea cu snapshot-ul de dinainte (`app.payment_snapshot`,
  `app.retention_actor = 'payment'`), iar `compute_purge_at` recalculează data ștergerii și prețul
  final; istoricul păstrării înregistrează schimbarea prin triggerul existent.
- **Condiții** (FR-007–FR-009): evenimentul e `active`; valorile de dinainte sunt cunoscute; nu
  există în istoricul păstrării nicio schimbare după `paid_at`-ul prelungirii; data ștergerii
  recalculată (sfârșitul uploadului + lunile de dinainte) e după `acum + 7 zile`. Dacă evenimentul e
  activ, dar o condiție nu e îndeplinită: `refund_effect = 'manual_adjustment'` și email către
  administratori. Dacă evenimentul nu e activ: `'none'`.
- **Rationale**: data ștergerii e derivată (sfârșitul uploadului + perioada), deci nu poate fi
  fixată la „rambursare + 7 zile” fără o coloană nouă pe care orice editare ulterioară a
  evenimentului ar suprascrie-o. Specificația a fost aliniată (FR-008 duce la ajustarea manuală).
  Opțiunea de dinainte poate fi între timp dezactivată în catalog; snapshot-ul o aplică oricum, ca la
  plăți (003, R6).
- **Alternatives considered**: deducerea valorilor de dinainte din `event_retention_changes`
  (`from_months`, `from_final_price_minor`): lipsesc opțiunea și suplimentul, deci nu se poate
  reface exact. Un câmp „data minimă de ștergere”: complexitate în `compute_purge_at` pentru un caz
  rar (VII).

## R6. Referința plății în istoricul păstrării

- **Decision**: istoricul păstrării rămâne neschimbat (sursa „sistem de plăți”, fără coloană de
  referință); legătura dintre plată și efect se vede în foaia „Plăți” (`refund_effect`).
- **Rationale**: `event_retention_changes` nu are coloană de referință nici pentru prelungirile din
  003; adăugarea ei doar pentru revenire ar crea istoric inconsecvent. Specificația a fost aliniată
  (FR-007).

## R7. Emailul pentru ajustarea manuală

- **Decision**: jobul existent `admin_payment_notice`, cu motivul nou `RETENTION_MANUAL` și textul în
  `messages/ro.ts` al worker-ului.
- **Rationale**: aceleași date (eveniment, organizator, sumă, referință, link spre fișa din
  administrare) și aceiași destinatari ca la plățile de rambursat și contestații. Rambursările care
  suspendă evenimentul nu trimit email: administratorul le-a inițiat.

## R8. Testarea

- **Decision**: teste DB pentru `register_refund` (parțial, integral, cumulat, repetat, vechi,
  `refund_due`, contestată, eveniment inactiv, revenirea păstrării și fiecare caz de ajustare
  manuală); teste unitare pentru dispecerul webhook-ului; e2e: plata în serverul Stripe fals, apoi
  un `charge.refunded` semnat cu secretul de test, ca în `payment.spec.ts`; manual cu Stripe în
  modul test (rambursare din Dashboard) și `stripe listen`.
- **Rationale**: logica e în Postgres; webhook-ul e deja testat cu evenimente semnate (003, R9).

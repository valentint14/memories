# Quickstart: validarea rambursărilor (004)

Pregătirea mediului local și a Stripe în modul test: ca în
[003/quickstart.md](../003-stripe-payment-activation/quickstart.md) (Supabase local, worker-ul în
Docker, `stripe listen --forward-to localhost:3000/api/stripe/webhook`). `stripe listen` trimite
toate tipurile de evenimente, inclusiv `charge.refunded`.

## Teste automate

```powershell
corepack pnpm test:db                                   # register_refund, apply_paid_extension
corepack pnpm test:unit                                 # dispecerul webhook-ului
corepack pnpm --filter web exec playwright test tests/e2e/refund.spec.ts
```

Așteptat: toate trec; e2e-ul rulează și pe Pixel 7 și iPhone 15.

## Scenarii manuale (Stripe în modul test)

Fiecare scenariu: plătește din aplicație cu cardul `4242 4242 4242 4242`, apoi rambursează din
Dashboard (*Payments › plata › Refund*).

| # | Pași | Rezultat așteptat | Cerințe |
| --- | --- | --- | --- |
| 1 | Activează un eveniment prin plată; rambursează **integral** | evenimentul devine „Suspendat”, motivul „Plată rambursată”, sursa „sistem de plăți”; pagina invitatului nu mai acceptă fișiere; foaia „Plăți”: „Rambursată · Eveniment suspendat” | FR-004, FR-012 |
| 2 | Activează; rambursează **parțial** (de ex. 50 lei) | evenimentul rămâne activ; foaia „Plăți”: „Rambursat parțial: 50,00 lei” | FR-005 |
| 3 | După 2, rambursează restul | evenimentul se suspendă ca în 1 | FR-003, FR-004 |
| 4 | După 1, reactivează din administrare; în Stripe retrimite evenimentul `charge.refunded` (*Workbench › Events › Resend*) | evenimentul rămâne activ | FR-006, SC-003 |
| 5 | Prelungește păstrarea unui eveniment activ (3 → 12 luni) prin plată; rambursează integral plata prelungirii | păstrarea revine la 3 luni, cu data și prețul de dinainte; istoricul păstrării arată schimbarea cu sursa „sistem de plăți”; foaia „Plăți”: „Păstrarea a revenit la 3 luni” | FR-007 |
| 6 | Ca 5, dar schimbă opțiunea din administrare înainte de rambursare | păstrarea nu se schimbă; administratorul primește emailul „păstrarea trebuie ajustată manual” | FR-009 |
| 7 | Plătește de două ori activarea (două ferestre); rambursează plata marcată „de rambursat” | evenimentul rămâne activ; plata apare rambursată | FR-011, SC-004 |

## Producție

1. Stripe, modul live: *Workbench › Webhooks* › destinația existentă › *Edit* › adaugă evenimentul
   `charge.refunded` (în total 6).
2. Migrația 004 cu `supabase db push`, imediat după merge (cron-ul de pe instanță instalează
   imaginile noi în cel mult 15 minute).
3. Evenimentele rambursate înainte de 004 se suspendă manual.

# Contract: interfața web (004)

Completează [003/contracts/web-interface.md](../../003-stripe-payment-activation/contracts/web-interface.md).

## Foaia „Plăți” (administrare › eveniment)

Pentru fiecare plată, pe lângă câmpurile din 003:

| Condiție | Afișare (textele în `messages/ro.ts`) |
| --- | --- |
| `refunded_minor = 0` | neschimbat |
| rambursare parțială | „Rambursat parțial: {sumă} · {dată}” |
| rambursare integrală | „Rambursată · {dată}” + efectul: „Eveniment suspendat”, „Păstrarea a revenit la {luni}”, „Păstrarea trebuie ajustată manual”, „Fără schimbări” |

Rambursarea integrală e marcată vizual ca plățile de rambursat (culoarea de atenționare), iar textul
spune starea; culoarea nu e singurul indiciu (WCAG 1.4.1).

## Organizatorul

Fără ecrane noi: evenimentul suspendat apare ca orice suspendare (002); păstrarea readusă apare în
panoul de păstrare cu data nouă.

## Interogări

`lib/admin/queries.ts › listPayments` citește în plus `refunded_minor`, `refunded_at`,
`refund_effect`, `previous_retention_months`.

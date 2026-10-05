# Contract: interfața web (004)

Completează [003/contracts/web-interface.md](../../003-stripe-payment-activation/contracts/web-interface.md).

## Foaia „Plăți” (administrare › eveniment)

Pentru fiecare plată, pe lângă câmpurile din 003:

| Condiție | Afișare (textele în `messages/ro.ts`) |
| --- | --- |
| `refunded_minor = 0` | neschimbat |
| rambursare parțială | starea neschimbată + rândul „Rambursat parțial: {sumă} · {dată}” |
| rambursare integrală | starea „Rambursată” + rândul „Rambursare pe {dată} · {efect}”, efectul fiind „Eveniment suspendat”, „Păstrarea a revenit la {luni}”, „Păstrarea trebuie ajustată manual” sau „Fără schimbări” |

Starea „Rambursată” folosește culoarea de atenționare, iar textul spune starea; culoarea nu e
singurul indiciu (WCAG 1.4.1). O plată „De rambursat” rambursată integral nu mai arată instrucțiunea
„rambursează plata din Stripe”.

## Organizatorul

Fără ecrane noi: evenimentul suspendat apare ca orice suspendare (002); păstrarea readusă apare în
panoul de păstrare cu data nouă.

## Interogări

`lib/admin/queries.ts › listPayments` citește în plus `refunded_minor`, `refunded_at`,
`refund_effect`, `previous_retention_months`.

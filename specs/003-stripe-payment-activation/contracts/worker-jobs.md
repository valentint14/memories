# Contract: joburi worker și emailuri (003)

Completează contractul din [002](../../002-self-service-events/contracts/worker-jobs.md):
aceeași coadă `media_jobs`, același format, aceleași reîncercări. Textele în
`apps/worker/src/email/messages/ro.ts`.

## `payment_confirmation` (nou)

```json
{ "type": "payment_confirmation", "payment_id": "uuid" }
```

Email către `payments.organizer_email` (FR-010). Pentru `activation`: suma, data plății, numele
evenimentului, perioada de păstrare și data ștergerii, „invitații pot încărca de acum”, linkul
către eveniment. Pentru `retention_extension`: suma, noua perioadă, noua dată de ștergere.
Menționează că chitanța vine separat, de la Stripe (FR-012). Plata trebuie să fie `paid`, altfel
jobul se încheie fără email.

## `admin_payment_notice` (nou)

```json
{ "type": "admin_payment_notice", "payment_id": "uuid", "reason": "EVENT_NOT_AWAITING" | "DUPLICATE_PAYMENT" | "EVENT_DELETED" | "EXTENSION_NOT_POSSIBLE" | "DISPUTE" }
```

Email către administratori (`ADMIN_NOTIFY_EMAILS`, altfel `platform_admins`), FR-011 și FR-016a:
motivul în cuvinte, evenimentul (sau numele salvat, dacă a fost șters), emailul organizatorului,
suma, data, referința Stripe și ce are de făcut („rambursează din contul Stripe” / „evenimentul a
fost suspendat; reactivează-l după rezolvarea disputei”), cu link către fișa evenimentului.

## `admin_activation_notice` (002)

Nu se mai pune în coadă (FR-015). Codul jobului rămâne pentru mesajele deja aflate în coadă la
lansare, apoi se elimină într-o versiune ulterioară.

## Șabloane

| Șablon | Subiect | Conținut obligatoriu |
| --- | --- | --- |
| `plata-confirmata` | „Plata pentru {eveniment} a fost primită” | vezi `payment_confirmation` |
| `plata-de-verificat` (admin) | „Plată de verificat: {eveniment}” | vezi `admin_payment_notice` |
| `stergere-neactivat` (modificat) | neschimbat | „activează evenimentul plătind pachetul complet din pagina evenimentului” în loc de „solicită activarea” |

Aceleași reguli ca în 002: `multipart/alternative`, fără imagini externe, numele evenimentului
escapat în HTML, teste de conținut.

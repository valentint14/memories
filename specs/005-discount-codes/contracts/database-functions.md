# Contract: funcții SQL (005)

Completează [003](../../003-stripe-payment-activation/contracts/database-functions.md) și
[004](../../004-stripe-refunds/contracts/database-functions.md). Funcțiile sunt
`security definer`, cu `set search_path = ''`, și ridică erori prin `raise_app_error`.

## Administrare (doar `is_admin()`)

### `generate_discount_codes(p_kind discount_kind, p_discount_type discount_type, p_discount_value bigint, p_count int, p_max_uses int, p_expires_at timestamptz, p_note text) → table(id uuid, code text)`

- `personal`: `p_count` între 1 și 100, `p_max_uses` ignorat (1);
- `campaign`: `p_count` = 1, `p_max_uses` între 2 și 1000;
- valoare: `fixed` > 0 (bani), `percent` între 1 și 99; `p_expires_at` null sau în viitor;
  `p_note` cel mult 200 de caractere. Altfel `VALIDATION`.
- Toate codurile primesc același `batch_id`; întoarce codurile, formatate `XXXX-XXXX`.

### `disable_discount_code(p_id uuid) → void`

Setează `disabled_at` (idempotent). `NOT_FOUND` dacă lipsește.

### `delete_discount_code(p_id uuid) → void`

Șterge un cod fără plăți `open` / `paid` / `refund_due` (altfel `DISCOUNT_UNAVAILABLE`); plățile
abandonate (`expired`, `failed`) pierd legătura cu codul. `NOT_FOUND` dacă lipsește. Migrația
`20261008000100_delete_discount_code.sql`.

### `admin_discount_codes()` (vedere sau funcție) → rânduri pentru listă

Pentru fiecare cod: câmpurile din data-model, `uses` (utilizări rezervate + definitive), `status`
derivat și, pentru fiecare utilizare: `event_id`, `event_name`, `organizer_email`, `paid_at` sau
starea plății.

## Aplicarea codului (doar `service_role`, din Server Action)

### `discount_quote(p_event_id uuid, p_code text, p_email citext, p_ip_hash text, p_ip_limit int) → table(option_id uuid, months int, full_amount_minor bigint, discount_minor bigint, amount_minor bigint, purge_at timestamptz, included boolean, code text, error text)`

Serverul trimite emailul din sesiunea verificată, IP-ul hash-uit și limita din
`RATE_LIMIT_DISCOUNT_IP_PER_HOUR` (implicit 30): un client care ar apela funcția direct și-ar alege
adresa IP, ocolind limita.

1. Eveniment al emailului, în `awaiting_activation`; altfel nimic.
2. Limitarea încercărilor (research R6): `discount:email:` 10/oră, `discount:ip:{limită}:` → rând cu
   `error = RATE_LIMITED`.
3. Normalizează codul; validează (`DISCOUNT_INVALID`, `DISCOUNT_UNAVAILABLE`, `DISCOUNT_RESERVED`),
   fără blocare. **Refuzul vine în coloana `error`** (un singur rând), nu ca excepție: o excepție ar
   anula și numărarea încercării.
4. La succes reține aplicarea în `discount_applications` (eveniment → cod) și întoarce opțiunile
   active, cu prețul întreg, reducerea (R4), suma și codul formatat.

## Modificate

### `activation_quote(p_event_id uuid)` — neschimbată

Rămâne prețul fără cod; pagina o folosește când nu e aplicat niciun cod.

### `prepare_payment(p_event_id uuid, p_purpose payment_purpose, p_option_id uuid, p_expected_amount_minor bigint, p_discount_code text default null)`

Ca în 003, plus, când `p_discount_code` nu e null:
- doar pentru `activation` (altfel `PAYMENT_NOT_ALLOWED`);
- acceptă doar un cod **aplicat** pe eveniment în ultimele 24 h (`discount_applications`), altfel
  `DISCOUNT_INVALID`: apelată direct, funcția nu devine o cale de încercare a codurilor fără limită;
- blochează rândul codului (`for update`), validează ca `discount_quote` (fără plata deschisă a
  aceluiași eveniment și scop, care va fi înlocuită);
- calculează reducerea (R4); `p_expected_amount_minor` trebuie să fie suma redusă, altfel
  `PRICE_CHANGED` cu suma nouă;
- inserează plata cu `discount_code_id`, `full_amount_minor`, `discount_minor`, `amount_minor`.

Reluarea plății deschise (003/R5) cere și același cod; altfel plata veche e înlocuită (`expired`),
ceea ce îi eliberează utilizarea.

## Drepturi

```sql
grant execute on function public.generate_discount_codes(...) to authenticated;   -- verifică is_admin()
grant execute on function public.disable_discount_code(uuid) to authenticated;    -- verifică is_admin()
grant execute on function public.discount_quote(uuid, text, citext, text, int) to service_role;
-- prepare_payment: semnătura nouă primește aceleași drepturi ca în 003
```

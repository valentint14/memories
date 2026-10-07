# Research: Coduri de reducere (005)

Contextul tehnic e cel din [003/research.md](../003-stripe-payment-activation/research.md) și
[004/research.md](../004-stripe-refunds/research.md): plata pregătită și înghețată în Postgres
(`prepare_payment`), Stripe Checkout cu `price_data`, confirmarea idempotentă (`complete_payment`).
Nicio dependență nouă.

## R1. Formatul și generarea codului

- **Decision**: 8 caractere din alfabetul `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31 de simboluri, fără
  0/O, 1/I/L), afișate în două grupe, `K7QM-3XPA`. Se generează în Postgres cu
  `extensions.gen_random_bytes` (generator criptografic), cu reîncercare la coliziune pe indexul
  unic. Se stochează normalizat (majuscule, fără cratime sau spații); la aplicare se normalizează la
  fel (FR-012).
- **Rationale**: 31⁸ ≈ 8,5 × 10¹¹ combinații; cu limitarea încercărilor (R6) un cod nu poate fi
  ghicit (FR-003, SC-005). Alfabetul fără caractere ambigue e cel al linkului lizibil (constituția,
  principiul III).
- **Alternatives considered**: UUID (greu de dictat); coduri alese de administrator pentru campanii
  (de ex. `TARG2027`): ușor de ghicit și în afara specificației (Assumptions).

## R2. Utilizările codului: derivate din plăți, fără tabel separat

- **Decision**: plata reține codul aplicat (`payments.discount_code_id`), plus prețul întreg și
  reducerea. O utilizare a codului = o plată cu acel cod în starea `open` (rezervată), `paid` sau
  `refund_due` (definitivă). Plățile `failed` și `expired` nu contează, deci utilizarea „se
  eliberează” automat când plata eșuează, expiră sau e înlocuită (FR-010), fără cod nou în
  funcțiile din 003.
- **Rationale**: un singur loc de adevăr (plata), fără o stare de sincronizat în `fail_payment`,
  `expire_payment`, `expire_stale_payments` și înlocuirea plății din `prepare_payment`. Constituția
  VII.
- **Alternatives considered**: tabel `discount_redemptions` cu stări (`reserved`, `used`,
  `released`): aceleași informații, dar fiecare cale de închidere a plății ar trebui să-l
  actualizeze.

## R3. Limita de utilizări la plăți simultane

- **Decision**: `prepare_payment` blochează rândul codului (`select … for update`) înainte să numere
  utilizările și să insereze plata. Două pregătiri simultane cu același cod se serializează: a doua
  vede plata rezervată de prima.
- **Rationale**: garanția din SC-003 („inclusiv la încercări simultane”) fără tabel de contoare.
  Blocarea ține doar cât tranzacția de pregătire (milisecunde).

## R4. Calculul reducerii și minimul de plată

- **Decision**: prețul întreg = prețul activării din 003 (pachet + suplimentul perioadei).
  Reducerea brută: suma fixă, sau `round(prețul întreg × procent / 100)` la ban (rotunjire
  aritmetică). Reducerea aplicată = `min(reducerea brută, prețul întreg − 300)`, adică suma de plată nu
  coboară sub **3,00 lei** (FR-006a). Dacă prețul întreg e deja sub minim, codul nu reduce nimic.
- **Rationale**: Stripe cere minimum 2,00 lei pentru plățile în lei; dacă contul virează în euro,
  minimul e echivalentul a 0,50 € (circa 2,5 lei). 3,00 lei acoperă ambele, iar reducerea
  limitată e afișată organizatorului (US2, scenariul 5).
- **Alternatives considered**: minim de 2,00 lei: riscă refuzul plății pentru conturi cu virare în
  euro.

## R5. Aplicarea codului de către organizator

- **Decision**: un câmp „Cod de reducere” cu butonul „Aplică” în foaia de plată a activării.
  Butonul trimite formularul către o acțiune care validează codul și întoarce prețurile reduse
  pentru fiecare perioadă (`discount_quote`); formularul păstrează codul într-un câmp ascuns și
  sumele reduse în câmpurile `amount_{id}`, iar „Plătește și activează” trimite codul la
  `prepare_payment`. Butonul „Elimină codul” revine la prețurile întregi.
- **Rationale**: același formular nativ din 003 (funcționează și fără JavaScript, cu
  `useActionState`); suma confirmată de organizator e cea verificată de `prepare_payment`
  (`PRICE_CHANGED`, 003/FR-022).

## R6. Limitarea încercărilor

- **Decision**: încercările de aplicare se numără cu `check_rate_limit` (001): `discount:email:{hash}`
  10 pe oră și `discount:ip:{hash}` 30 pe oră (adresa IP trimisă hash-uită de server, ca la
  emailurile de autentificare). Peste limită: `RATE_LIMITED`, fără a dezvălui dacă codul există.
  `prepare_payment` cu cod verifică aceeași limită per email, pentru apelurile directe ale funcției.
- **Rationale**: FR-011, SC-005. Un organizator legitim aplică un cod de 1–3 ori.

## R7. Ce vede organizatorul la Stripe și în chitanță

- **Decision**: linia din Checkout rămâne una, cu suma redusă; descrierea produsului adaugă
  „Reducere {suma} (cod {cod})”. Emailul de confirmare al aplicației arată suma plătită, ca acum.
- **Rationale**: Checkout cu `price_data` nu are nevoie de cupoane Stripe (care ar duplica regulile
  R2–R4 în afara bazei de date).
- **Alternatives considered**: cupoane și coduri promoționale Stripe: alt loc de adevăr pentru
  limite și expirare, plus sincronizare.

## R8. Administrarea codurilor

- **Decision**: pagină nouă `/admin/discounts` (meniul de administrare): formularul de generare
  (felul, tipul, valoarea, câte coduri sau maximul de utilizări, expirarea, nota), lista codurilor cu
  filtrul de stare, copierea codurilor generate și dezactivarea. Starea e derivată: dezactivat →
  expirat → epuizat (utilizări = maxim) → disponibil.
- **Rationale**: aceleași componente ca registrul evenimentelor și pachetul (foi, `SelectField`,
  `DateField`).

## R9. Testarea

- **Decision**: teste DB pentru generare (unicitate, validare), aplicare (fiecare motiv de refuz,
  normalizare, limită), plăți simultane, procent și sumă fixă, minimul de 3 lei, eliberarea la
  expirare; e2e: generarea de către admin, aplicarea și plata prin serverul Stripe fals, refuzul
  unui cod folosit, foaia „Plăți”.

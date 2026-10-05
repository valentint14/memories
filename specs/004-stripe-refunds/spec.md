# Feature Specification: Rambursările plăților Stripe

**Feature Branch**: `004-stripe-refunds`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Când administratorul rambursează din Stripe o plată, aplicația reacționează automat (completare la 003-stripe-payment-activation). Rambursarea integrală a plății care a activat evenimentul suspendă evenimentul activ, cu motivul „Plată rambursată” (sursa: sistemul de plăți); reactivarea rămâne manuală, ca la contestații. Rambursarea parțială a plății de activare nu schimbă starea evenimentului. Rambursarea plăților care nu au fost aplicate (plăți duble, eveniment activat sau șters între timp, prelungire imposibilă — starea refund_due) nu schimbă evenimentul. Rambursarea integrală a plății unei prelungiri a păstrării readuce data de ștergere la cea de dinaintea prelungirii (și perioada de păstrare / prețul final corespunzător), cu schimbarea înregistrată în istoricul păstrării. Toate rambursările (integrale sau parțiale, suma rambursată, data) apar în foaia „Plăți” a administratorului. Rambursarea vine prin webhook-ul Stripe semnat (un tip nou de eveniment, de abonat în Dashboard), este idempotentă și nu se aplică de două ori."

## Context

Funcționalitatea 003 a introdus plata online a activării și a prelungirii păstrării. Rambursările
se fac de administrator, din contul procesatorului de plăți, iar 003/FR-016 a stabilit că o
rambursare nu schimbă automat evenimentul. În practică, un eveniment rambursat integral rămânea
activ, cu încărcările deschise, fără ca platforma să fi încasat ceva. Această funcționalitate
înlocuiește 003/FR-016 în privința rambursărilor: aplicația reacționează automat, dar doar pentru
plățile care au produs efectul (activarea sau prelungirea), nu pentru cele deja marcate de
rambursat.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rambursarea activării suspendă evenimentul (Priority: P1)

Administratorul rambursează integral, din contul procesatorului de plăți, plata cu care
organizatorul și-a activat evenimentul (de exemplu, la cererea organizatorului, înainte de
eveniment). Fără nicio altă acțiune, evenimentul devine suspendat cu motivul „Plată rambursată”:
invitații nu mai pot încărca fișiere, fișierele existente rămân, iar schimbarea apare în istoricul
stărilor cu sursa „sistem de plăți”. Dacă administratorul decide altfel (de exemplu, o rambursare
de bunăvoință), reactivează manual evenimentul.

**Why this priority**: Un eveniment activ fără plată oferă serviciul gratuit; e riscul financiar
principal al rambursărilor și cazul cerut explicit.

**Independent Test**: Se activează un eveniment printr-o plată de test, se rambursează integral
plata din procesator și se verifică, fără altă intervenție, că evenimentul e suspendat cu motivul
„Plată rambursată”, că pagina de upload refuză fișiere noi și că istoricul arată sursa „sistem de
plăți” și referința plății.

**Acceptance Scenarios**:

1. **Given** un eveniment activ, activat printr-o plată reușită, **When** plata este rambursată
   integral, **Then** evenimentul devine suspendat cu motivul „Plată rambursată”, sursa „sistem de
   plăți” și referința plății, iar încărcările se opresc.
2. **Given** un eveniment activ, **When** plata de activare este rambursată parțial, **Then**
   starea evenimentului nu se schimbă, iar suma rambursată apare în foaia „Plăți”.
3. **Given** o plată de activare rambursată parțial, **When** o a doua rambursare parțială
   completează suma plătită, **Then** plata devine rambursată integral și evenimentul se suspendă
   ca în scenariul 1.
4. **Given** un eveniment suspendat din cauza rambursării, **When** administratorul îl reactivează
   manual, **Then** evenimentul redevine activ, iar o nouă notificare pentru aceeași rambursare nu
   îl mai suspendă.
5. **Given** o plată marcată „de rambursat” (plată dublă, eveniment activat sau șters între timp),
   **When** administratorul o rambursează, **Then** evenimentul nu se schimbă, iar plata apare
   rambursată în foaia „Plăți”.

---

### User Story 2 - Rambursarea prelungirii readuce data de ștergere anterioară (Priority: P2)

Administratorul rambursează integral plata unei prelungiri a păstrării. Evenimentul rămâne în
starea în care e, dar perioada de păstrare, data ștergerii automate și prețul final revin la
valorile de dinaintea prelungirii, iar schimbarea apare în istoricul prețului și al păstrării cu
referința plății rambursate.

**Why this priority**: Fără ea, organizatorul păstrează gratuit fișierele mai mult timp; impactul e
mai mic decât la activare, pentru că evenimentul a fost plătit.

**Independent Test**: Se prelungește păstrarea unui eveniment activ printr-o plată de test, se
rambursează integral plata și se verifică că perioada, data ștergerii și prețul final sunt cele de
dinainte, cu o intrare nouă în istoricul păstrării.

**Acceptance Scenarios**:

1. **Given** un eveniment cu păstrarea prelungită de la 3 la 12 luni printr-o plată, **When** plata
   prelungirii este rambursată integral, **Then** perioada revine la 3 luni, data ștergerii și
   prețul final revin la valorile de dinainte, iar istoricul păstrării arată schimbarea cu sursa
   „sistem de plăți” și referința plății.
2. **Given** aceeași prelungire, **When** plata ei este rambursată parțial, **Then** păstrarea nu
   se schimbă, iar suma rambursată apare în foaia „Plăți”.
3. **Given** o prelungire rambursată după ce data de ștergere de dinainte a trecut sau e la mai
   puțin de 7 zile, **When** vine rambursarea integrală, **Then** păstrarea nu se schimbă automat
   (fișierele nu se șterg pe loc), iar administratorii primesc un email că trebuie ajustată manual.
4. **Given** o prelungire urmată de o altă schimbare a păstrării (o a doua prelungire sau o
   schimbare făcută de administrator), **When** prima prelungire este rambursată, **Then**
   păstrarea nu se schimbă automat, iar administratorii primesc un email că trebuie ajustată
   manual.

---

### User Story 3 - Administratorul vede rambursările (Priority: P3)

În foaia „Plăți” a evenimentului, administratorul vede pentru fiecare plată suma rambursată, data
ultimei rambursări și dacă rambursarea e integrală sau parțială, împreună cu efectul aplicat
(eveniment suspendat, păstrare readusă, nicio schimbare).

**Why this priority**: Rambursările se fac din contul procesatorului; foaia „Plăți” e locul din
aplicație unde administratorul verifică ce s-a întâmplat și pregătește stornarea facturii.

**Independent Test**: Se rambursează parțial o plată și integral alta, apoi se deschide foaia
„Plăți” a evenimentului și se verifică sumele, datele și stările afișate.

**Acceptance Scenarios**:

1. **Given** o plată rambursată parțial, **When** administratorul deschide foaia „Plăți”, **Then**
   vede suma plătită, suma rambursată, data rambursării și mențiunea „rambursată parțial”.
2. **Given** o plată rambursată integral, **When** administratorul deschide foaia „Plăți”, **Then**
   vede starea „rambursată” și efectul aplicat evenimentului.

---

### Edge Cases

- **Notificare repetată sau întârziată**: aceeași rambursare anunțată de mai multe ori se aplică o
  singură dată; o notificare veche, primită după una mai nouă, nu micșorează suma rambursată
  înregistrată.
- **Rambursarea unei plăți necunoscute** (fără legătură cu o plată din aplicație): se ignoră și se
  înregistrează în jurnalul notificărilor.
- **Evenimentul nu mai e activ** (suspendat, expirat sau șters) când vine rambursarea activării:
  starea rămâne neschimbată, iar rambursarea apare în foaia „Plăți” (dacă evenimentul mai există).
- **Plată deja contestată**: evenimentul a fost suspendat la contestație (003/FR-016a); rambursarea
  ulterioară nu schimbă starea și nu adaugă o a doua intrare de suspendare.
- **Prelungire rambursată pentru un eveniment expirat, suspendat sau șters**: păstrarea nu se
  schimbă; rambursarea apare în foaia „Plăți”.
- **Rambursare anulată sau eșuată la procesator** după ce a fost aplicată: aplicația nu reactivează
  automat evenimentul și nu reaplică prelungirea; administratorul decide manual.
- **Eveniment creat de administrator** (fără plată): nu are plăți, deci nu e afectat.

## Requirements *(mandatory)*

### Functional Requirements

**Recepția rambursărilor**

- **FR-001**: Sistemul TREBUIE să primească anunțurile de rambursare ale procesatorului de plăți pe
  aceeași cale verificată ca celelalte notificări de plată (003/FR-017); anunțurile care nu pot fi
  verificate TREBUIE respinse.
- **FR-002**: Pentru fiecare plată, sistemul TREBUIE să înregistreze suma totală rambursată și
  momentul ultimei rambursări. Suma înregistrată nu TREBUIE să scadă la o notificare veche sau
  repetată, iar efectele (suspendare, revenirea păstrării) TREBUIE aplicate cel mult o dată per
  plată.
- **FR-003**: O plată este „rambursată integral” când suma rambursată este egală cu suma plătită;
  altfel, cu o sumă rambursată mai mare decât zero, este „rambursată parțial”.

**Plata activării**

- **FR-004**: Când plata care a activat evenimentul devine rambursată integral și evenimentul este
  activ, evenimentul TREBUIE suspendat automat, cu efectele din 002/FR-028a și FR-031 (fișierele
  rămân, încărcările se opresc), iar schimbarea TREBUIE înregistrată cu sursa „sistem de plăți”,
  motivul „Plată rambursată” și referința plății (002/FR-024). Această cerință înlocuiește
  003/FR-016 pentru rambursările plăților aplicate.
- **FR-005**: Rambursarea parțială a plății de activare NU TREBUIE să schimbe starea evenimentului.
- **FR-006**: Reactivarea unui eveniment suspendat din cauza rambursării se face doar manual, de
  administrator (002/FR-028); după reactivare, notificările ulterioare pentru aceeași rambursare NU
  TREBUIE să-l suspende din nou.

**Plata prelungirii**

- **FR-007**: Când plata unei prelungiri a păstrării devine rambursată integral, evenimentul este
  activ, iar prelungirea plătită este ultima schimbare a păstrării, perioada de păstrare, data
  ștergerii automate și prețul final TREBUIE readuse la valorile de dinaintea prelungirii, iar
  schimbarea TREBUIE înregistrată în istoricul prețului și al păstrării (001/FR-043) cu sursa
  „sistem de plăți”; plata rambursată se vede în foaia „Plăți” cu efectul aplicat (FR-012).
- **FR-008**: Dacă data ștergerii de dinaintea prelungirii este mai devreme decât momentul
  rambursării plus 7 zile, păstrarea NU TREBUIE readusă automat (fișierele nu se pot șterge din
  cauza unei rambursări fără ca organizatorul să aibă timp să le descarce); se aplică FR-009.
- **FR-009**: Dacă după prelungirea rambursată a existat o altă schimbare a păstrării, dacă nu se
  cunosc valorile de dinaintea prelungirii, sau în cazul din FR-008, păstrarea NU TREBUIE
  schimbată automat; dacă evenimentul este activ, administratorii TREBUIE să primească un email în
  română cu evenimentul și plata, ca să ajusteze manual păstrarea. Dacă evenimentul nu este activ,
  păstrarea rămâne neschimbată, fără email.
- **FR-010**: Rambursarea parțială a plății unei prelungiri NU TREBUIE să schimbe păstrarea.

**Plățile neaplicate și afișarea**

- **FR-011**: Rambursarea unei plăți marcate „de rambursat” (003/FR-011, FR-021) NU TREBUIE să
  schimbe evenimentul; plata TREBUIE să apară ca rambursată.
- **FR-012**: Foaia „Plăți” a administratorului (003/FR-013) TREBUIE să arate, pentru fiecare
  plată cu rambursări: suma rambursată, data ultimei rambursări, mențiunea „rambursată integral”
  sau „rambursată parțial” și efectul aplicat (eveniment suspendat, păstrare readusă, ajustare
  manuală necesară, nicio schimbare).
- **FR-013**: Configurarea producției TREBUIE să includă abonarea la anunțurile de rambursare ale
  procesatorului, documentată în ghidul de livrare.

### Key Entities

- **Plată** (din 003): primește suma totală rambursată, momentul ultimei rambursări și efectul
  aplicat la rambursare. O plată rambursată integral rămâne în istoric cu toate datele ei (003/FR-018).
- **Schimbare de stare** (din 002): suspendarea la rambursare are sursa „sistem de plăți”, motivul
  „Plată rambursată” și referința plății.
- **Schimbare a păstrării** (din 001): revenirea la rambursarea prelungirii are sursa „sistem de
  plăți”.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un eveniment a cărui plată de activare e rambursată integral nu mai acceptă încărcări
  în cel mult 1 minut de la primirea anunțului de rambursare.
- **SC-002**: 100% dintre rambursările anunțate pentru plăți din aplicație apar în foaia „Plăți”,
  cu suma corectă, fără intervenție manuală.
- **SC-003**: Anunțurile repetate ale aceleiași rambursări (oricâte) produc exact o schimbare de
  stare sau de păstrare.
- **SC-004**: Nicio rambursare a unei plăți marcate „de rambursat” nu schimbă starea sau păstrarea
  evenimentului.

## Assumptions

- Rambursările se inițiază doar de administrator, din contul procesatorului de plăți; aplicația nu
  are un buton de rambursare.
- Organizatorul nu primește un email automat la rambursare: procesatorul trimite propria
  confirmare, iar administratorul comunică direct cu organizatorul. Organizatorul vede evenimentul
  suspendat ca la orice suspendare (002).
- Marja de 7 zile (FR-008) urmează principiul din 001 că organizatorul are timp să-și descarce
  fișierele înainte de ștergere. Data ștergerii se calculează din perioada de păstrare, deci nu
  poate fi fixată la „rambursare plus 7 zile”; în acest caz decide administratorul.
- Plățile de prelungire aplicate înainte de această funcționalitate nu au păstrate valorile de
  dinainte; rambursarea lor integrală duce la ajustarea manuală (FR-009).
- Anularea sau eșecul unei rambursări la procesator, după ce a fost aplicată, sunt rare; aplicația
  nu le inversează automat (cazuri limită).
- Factura de stornare se emite în afara aplicației, ca factura inițială (003, Q2).
- Evenimentele afectate de rambursări anterioare acestei funcționalități se tratează manual de
  administrator.

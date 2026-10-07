# Feature Specification: Coduri de reducere

**Feature Branch**: `005-discount-codes`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Vreau un concept nou: coduri de reducere, in calitate de administrator sa se poata genera coduri unice de reducere cu valori la alegere. Organizatorul (clientul) sa poata folosi acel co doar o singura data."

## Context

Din 003, organizatorul își activează evenimentul plătind online pachetul complet, la prețul
calculat de platformă, iar din 004 rambursările se reflectă automat în aplicație. Nu există încă o
cale de a oferi unui client un preț mai mic (o promoție, o compensare, un partener) fără plată în
afara aplicației și activare manuală. Codurile de reducere permit administratorului să ofere o
reducere controlată, folosită o singură dată, direct în fluxul de plată.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administratorul generează coduri de reducere (Priority: P1)

Administratorul deschide secțiunea „Coduri de reducere” și alege:
- tipul reducerii: o sumă fixă în lei sau un procent din preț, și valoarea ei;
- felul codului: **personal** (se folosește o singură dată, de un singur client; se pot genera mai
  multe deodată) sau **de campanie** (un singur cod, folosit de mai mulți organizatori, câte o dată
  fiecare, până la un număr maxim de utilizări);
- opțional, o dată de expirare și o notă internă (de ex. „Târgul de nunți, martie”).

Primește codurile generate, gata de copiat și trimis clienților. Fiecare cod e unic și greu de
ghicit.

**Why this priority**: Fără coduri generate nu există nimic de folosit; e punctul de pornire al
funcționalității.

**Independent Test**: Se generează 5 coduri cu o reducere aleasă și se verifică în listă că sunt 5
coduri distincte, cu valoarea, expirarea și nota alese, toate „disponibile”.

**Acceptance Scenarios**:

1. **Given** administratorul în secțiunea „Coduri de reducere”, **When** generează 5 coduri
   personale cu o reducere de 50 lei, **Then** vede 5 coduri noi, distincte, în starea
   „disponibil”, pe care le poate copia.
2. **Given** administratorul, **When** generează un cod de campanie cu reducerea de 15% și cel mult
   30 de utilizări, **Then** vede un singur cod, cu 0 din 30 de utilizări.
3. **Given** o valoare a reducerii invalidă (zero, negativă, un procent de 100 sau mai mare), **When**
   administratorul încearcă să genereze, **Then** primește un mesaj clar și nu se creează niciun
   cod.
4. **Given** un cod încă disponibil, **When** administratorul îl dezactivează, **Then** codul nu mai
   poate fi folosit și apare ca „dezactivat”; utilizările deja făcute rămân în evidență.

---

### User Story 2 - Organizatorul plătește mai puțin folosind un cod (Priority: P1)

Pe pagina evenimentului în așteptarea activării, organizatorul introduce codul primit. Aplicația
verifică imediat codul și arată prețul redus pentru fiecare perioadă de păstrare. La plată,
organizatorul plătește suma redusă; după plata reușită, utilizarea codului se înregistrează: un cod personal nu
mai poate fi folosit de nimeni, iar un cod de campanie nu mai poate fi folosit de același organizator
și are o utilizare mai puțin disponibilă.

**Why this priority**: Este valoarea pentru client și motivul funcționalității.

**Independent Test**: Cu un cod generat la US1, organizatorul aplică codul, vede prețul redus,
plătește prin procesatorul de plăți în modul de test și se verifică: suma încasată este cea redusă,
evenimentul e activ, iar utilizarea codului apare legată de acel eveniment.

**Acceptance Scenarios**:

1. **Given** un cod valid, **When** organizatorul îl aplică, **Then** vede reducerea și prețul
   final redus pentru fiecare perioadă de păstrare, înainte de plată.
2. **Given** un cod aplicat, **When** plata reușește, **Then** suma încasată este cea redusă, iar
   utilizarea codului e înregistrată, legată de eveniment și de organizator.
3. **Given** un cod personal deja utilizat, un cod de campanie epuizat sau deja folosit de același
   organizator, ori un cod expirat sau dezactivat, **When** organizatorul îl introduce,
   **Then** vede un mesaj clar că acel cod nu poate fi folosit, iar prețul rămâne cel întreg.
4. **Given** un cod aplicat într-o plată începută, dar abandonată sau expirată, **When** plata nu se
   finalizează, **Then** codul redevine disponibil.
5. **Given** o reducere care ar coborî prețul sub suma minimă acceptată de procesatorul de plăți,
   **When** organizatorul aplică codul, **Then** prețul de plată este suma minimă (reducerea se
   limitează), iar reducerea afișată e cea aplicată efectiv.
6. **Given** un cod inexistent, **When** organizatorul îl introduce de mai multe ori, **Then**
   încercările sunt limitate, ca un cod să nu poată fi ghicit prin încercări repetate.

---

### User Story 3 - Administratorul urmărește codurile (Priority: P2)

Administratorul vede lista codurilor cu felul, starea fiecăruia (disponibil, epuizat, expirat,
dezactivat), reducerea, nota, data generării, numărul de utilizări (inclusiv cele rezervate de plăți
în curs) și, pentru fiecare utilizare, evenimentul, organizatorul și data. În foaia „Plăți” a evenimentului se vede codul folosit
și reducerea aplicată, pentru factura emisă în afara aplicației.

**Why this priority**: Controlul și evidența contabilă; funcționalitatea e utilizabilă și fără, dar
nu și auditabilă.

**Independent Test**: După ce un cod a fost folosit la US2, lista codurilor arată utilizarea, cu
evenimentul și data, iar foaia „Plăți” a evenimentului arată codul și suma reducerii.

**Acceptance Scenarios**:

1. **Given** coduri în stări diferite, **When** administratorul deschide lista, **Then** vede starea
   fiecăruia și poate filtra după stare.
2. **Given** un eveniment plătit cu un cod, **When** administratorul deschide foaia „Plăți”, **Then**
   vede prețul întreg, reducerea, codul și suma încasată.

---

### Edge Cases

- **Plăți simultane cu același cod**: un cod personal poate fi rezervat de o singură plată în curs;
  un cod de campanie, de cel mult atâtea plăți în curs câte utilizări mai are. Încercarea în plus
  primește mesajul „codul este folosit într-o plată în curs”.
- **Același organizator, două evenimente, același cod de campanie**: codul se folosește o singură
  dată per organizator (după adresa de email), deci la al doilea eveniment e respins.
- **Reducerea acoperă tot prețul sau aproape tot**: activarea gratuită nu se face prin cod; prețul
  de plată nu coboară sub suma minimă acceptată de procesator. Pentru o activare gratuită,
  administratorul folosește activarea manuală (003/FR-014).
- **Codul expiră cât timp plata e în curs**: plata începută înainte de expirare se poate finaliza la
  prețul redus.
- **Plata cu cod e rambursată integral** (004): utilizarea codului rămâne (nu se eliberează automat);
  administratorul poate genera un cod nou dacă e cazul.
- **Prețul pachetului se schimbă după aplicarea codului**: se aplică regula din 003 (organizatorul
  vede noul preț redus înainte de plată).
- **Codul introdus cu litere mici, spații sau cratime în plus**: se acceptă, normalizat.

## Requirements *(mandatory)*

### Functional Requirements

**Generarea și administrarea codurilor**

- **FR-001**: Administratorul TREBUIE să poată genera coduri alegând felul (personal sau de
  campanie), tipul și valoarea reducerii, opțional o dată de expirare și o notă internă. Codurile
  personale se pot genera în loturi (cel mult 100 într-o generare); un cod de campanie se generează
  unul câte unul, cu un număr maxim de utilizări (între 2 și 1000).
- **FR-002**: Administratorul TREBUIE să aleagă la generare tipul reducerii: o **sumă fixă** în lei
  (mai mare decât zero) sau un **procent** din preț (între 1% și 99%). Procentul se aplică prețului
  final al activării (pachet plus perioada de păstrare aleasă), iar rezultatul se rotunjește la
  ban.
- **FR-003**: Fiecare cod TREBUIE să fie unic, generat aleator, greu de ghicit și ușor de dictat sau
  copiat (fără caractere care se confundă, ca O/0 sau I/1).
- **FR-004**: Administratorul TREBUIE să poată dezactiva un cod; un cod dezactivat sau expirat nu mai
  poate fi aplicat, iar utilizările deja făcute rămân în evidență.
- **FR-005**: Doar administratorii TREBUIE să poată genera, vedea și dezactiva coduri.

**Folosirea codului**

- **FR-006**: Un cod **personal** TREBUIE să poată fi folosit o singură dată în total. Un cod **de
  campanie** TREBUIE să poată fi folosit de mai mulți organizatori, câte o dată fiecare (după
  adresa de email), până la numărul maxim de utilizări.
- **FR-006a**: Prețul de plată după reducere NU TREBUIE să coboare sub suma minimă acceptată de
  procesatorul de plăți pentru lei; dacă reducerea ar coborî sub minim, se limitează. Codurile nu
  pot face o activare gratuită.
- **FR-007**: Organizatorul TREBUIE să poată aplica un cod pe pagina evenimentului în așteptarea
  activării, înainte de plată, și să vadă prețul redus pentru fiecare perioadă de păstrare.
- **FR-008**: Reducerea se aplică plății de activare a pachetului complet (003). Prelungirea
  păstrării (003/FR-020) se plătește fără reducere.
- **FR-009**: Suma redusă TREBUIE calculată și fixată de platformă la începerea plății, ca suma
  întreagă din 003; organizatorul plătește exact suma redusă afișată.
- **FR-010**: O plată începută cu un cod TREBUIE să rezerve o utilizare a codului; utilizarea devine
  definitivă doar după confirmarea plății și se eliberează dacă plata eșuează, expiră sau e
  înlocuită. Utilizările rezervate contează la limita din FR-006.
- **FR-011**: Codurile invalide, folosite (sau epuizate), expirate sau dezactivate TREBUIE respinse cu un mesaj în
  română, fără a dezvălui alte coduri; încercările de aplicare TREBUIE limitate per organizator și
  per adresă IP.
- **FR-012**: Codul TREBUIE acceptat indiferent de litere mari/mici, spații sau cratime.

**Evidență**

- **FR-013**: Lista codurilor din administrare TREBUIE să arate pentru fiecare cod: felul, tipul și
  valoarea reducerii, nota, data generării, expirarea, starea, numărul de utilizări din maxim și,
  pentru fiecare utilizare, evenimentul, organizatorul și data.
- **FR-014**: Foaia „Plăți” (003/FR-013) TREBUIE să arate, pentru o plată cu cod: prețul întreg,
  reducerea, codul și suma încasată.
- **FR-015**: Codurile utilizate și legătura lor cu plata TREBUIE păstrate cât se păstrează datele
  plății (003/FR-018); anonimizarea plății nu șterge codul.

### Key Entities

- **Cod de reducere**: textul codului, felul (personal sau de campanie), tipul (sumă fixă sau
  procent) și valoarea reducerii, numărul maxim de utilizări (1 la cele personale), nota internă,
  data generării, expirarea opțională și dacă e dezactivat.
- **Utilizare a codului**: legătura dintre un cod și o plată (rezervată cât plata e în curs,
  definitivă după plată), cu evenimentul, organizatorul și momentul; cel mult una per organizator
  pentru un cod de campanie.
- **Plată** (din 003): primește, la activarea cu cod, codul aplicat, prețul întreg și reducerea
  (fixate la începerea plății, ca suma).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administratorul generează și copiază 10 coduri în mai puțin de un minut.
- **SC-002**: Organizatorul vede prețul redus în cel mult 2 secunde după introducerea codului.
- **SC-003**: Niciun cod nu are mai multe utilizări reușite decât permite FR-006 (una la cele
  personale, maximul ales la cele de campanie, una per organizator), inclusiv la încercări simultane.
- **SC-004**: 100% dintre plățile cu cod încasează exact suma redusă afișată organizatorului.
- **SC-005**: Un cod nu poate fi ghicit prin încercări: după limita de încercări, aplicarea e blocată
  temporar.

## Assumptions

- Generarea în loturi (până la 100) acoperă codurile personale; codurile se distribuie de
  administrator în afara aplicației (email, mesaj, tipărit). Textul unui cod de campanie e generat,
  ca la cele personale.
- Organizatorul e identificat după adresa de email a contului (002).
- Reducerea nu se aplică prelungirii păstrării (FR-008); se poate extinde ulterior.
- Rambursarea unei plăți cu cod nu eliberează utilizarea codului (cazuri limită).
- Factura fiscală, emisă în afara aplicației, folosește prețul întreg, reducerea și suma încasată din
  foaia „Plăți”.
- Activarea gratuită rămâne o acțiune a administratorului (activarea manuală din 003), nu a
  codurilor (FR-006a).

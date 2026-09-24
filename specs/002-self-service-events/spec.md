# Feature Specification: Creare self-service a evenimentelor de către organizatori

**Feature Branch**: `002-self-service-events`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Crearea evenimentelor în regim self-service de către organizatori, pe baza adresei de email, fără parolă. Oricine își poate crea singur un eveniment în regim de probă; administratorul păstrează controlul asupra activării pachetului complet, iar crearea de către administrator rămâne disponibilă. Modelul de pachete și stările evenimentului (neconfirmat, probă, activ, suspendat, expirat) trebuie să permită ulterior activarea automată de către un sistem de plăți, cu istoricul fiecărei schimbări de stare și al sursei ei."

**Relația cu funcționalitatea 001** ([spec 001](../001-event-qr-upload/spec.md)): această
funcționalitate înlocuiește regula „nu există înregistrare self-service” (001/FR-006) și
presupunerea că organizatorul nu poate modifica datele evenimentului. Restul comportamentului din
001 (upload invitați, galerie, descărcare, ștergerea fișierelor, retenție, anonimizare) se aplică
neschimbat și evenimentelor create self-service, în limitele pachetului lor.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vizitatorul își creează singur un eveniment (Priority: P1)

Un vizitator ajunge pe pagina principală, introduce adresa de email, numele evenimentului și
data lui, bifează acceptarea termenilor și a politicii de confidențialitate și trimite
formularul. Nu alege parolă și nu completează alt formular de înregistrare. Primește un email în
română care conține un link și un cod numeric de unică folosință. Linkul deschide o pagină de
confirmare cu un buton; codul poate fi introdus pe dispozitivul pe care a început, dacă emailul e
citit pe alt dispozitiv. După confirmare, vizitatorul devine organizator autentificat și ajunge
direct la evenimentul nou creat, cu codul QR gata de descărcat.

**Why this priority**: este bucla de achiziție a produsului: fără ea, fiecare client depinde de
administrator. Livrată singură, permite deja unui client nou să folosească aplicația de la cap
la coadă în regim de probă.

**Independent Test**: se completează formularul de pe pagina principală cu o adresă nouă, se
confirmă o dată prin link și o dată prin cod pe alt dispozitiv; se verifică autentificarea,
ajungerea la eveniment și descărcarea codului QR.

**Acceptance Scenarios**:

1. **Given** un vizitator pe pagina principală, **When** introduce email, nume eveniment, dată,
   bifează acceptarea termenilor și trimite, **Then** vede un mesaj care îi cere să își verifice
   emailul și primește un email cu un link și un cod numeric.
2. **Given** emailul de confirmare, **When** vizitatorul deschide linkul, **Then** vede o pagină
   de confirmare cu un buton, iar evenimentul nu este confirmat până nu apasă butonul.
3. **Given** pagina de confirmare deschisă din link, **When** vizitatorul apasă butonul,
   **Then** este autentificat ca organizator și ajunge la evenimentul nou creat, cu codul QR
   disponibil pentru descărcare.
4. **Given** vizitatorul a început pe laptop și citește emailul pe telefon, **When** introduce
   codul din email în pagina rămasă deschisă pe laptop, **Then** este autentificat pe laptop și
   ajunge la eveniment.
5. **Given** formularul, **When** vizitatorul nu bifează acceptarea termenilor sau lasă câmpuri
   invalide, **Then** formularul nu se trimite și erorile apar lângă câmpurile respective.
6. **Given** două trimiteri ale formularului, una cu o adresă nouă și una cu o adresă deja
   folosită, **When** se compară răspunsurile afișate, **Then** mesajele sunt identice.
7. **Given** un link sau un cod deja folosit ori expirat, **When** este folosit, **Then**
   confirmarea este refuzată cu un mesaj clar și opțiunea de a cere un email nou.

---

### User Story 2 - Organizatorul revine în cont și își vede toate evenimentele (Priority: P1)

Un organizator care a mai folosit aplicația introduce aceeași adresă de email, confirmă prin
link sau cod și vede toate evenimentele asociate adresei sale, indiferent dacă le-a creat singur
sau le-a creat administratorul pentru el. Din cont poate crea evenimente noi fără alt pas de
confirmare prin email.

**Why this priority**: fără acces la evenimentele existente, un client care revine (sau unul
creat de administrator) nu își poate folosi evenimentele; unifică cele două surse de evenimente.

**Independent Test**: pentru o adresă cu un eveniment creat de administrator și unul creat
self-service, autentificarea arată ambele; crearea unui al treilea eveniment din cont nu cere un
email nou.

**Acceptance Scenarios**:

1. **Given** o adresă cu evenimente create de administrator și self-service, **When**
   organizatorul se autentifică, **Then** vede toate evenimentele adresei, cu starea fiecăruia.
2. **Given** un organizator autentificat, **When** creează un eveniment nou din cont, **Then**
   evenimentul este creat direct în regim de probă, fără email de confirmare.
3. **Given** un organizator care a atins limita de evenimente în probă active simultan, **When**
   încearcă să creeze încă unul, **Then** primește un mesaj care explică limita și modul de
   activare a pachetului complet pentru un eveniment existent.
4. **Given** un organizator autentificat care trimite formularul de pe pagina principală,
   **When** îl trimite, **Then** evenimentul se creează direct în contul lui, fără email de
   confirmare.

---

### User Story 3 - Evenimentul în regim de probă, cu limite vizibile (Priority: P1)

Un eveniment creat self-service începe în regim de probă: toate funcțiile sunt disponibile
(upload invitați, galerie, descărcare, ștergere), dar cu un număr maxim de fișiere pe eveniment
și o durată de păstrare mai scurtă. Organizatorul vede clar limitele, consumul curent și cum
activează pachetul complet.

**Why this priority**: regimul de probă face posibilă crearea liberă fără pierderi pentru
platformă; fără el, US1 ar oferi gratuit pachetul complet.

**Independent Test**: un eveniment nou creat self-service afișează limitele și consumul;
atingerea limitei de fișiere oprește uploadurile noi.

**Acceptance Scenarios**:

1. **Given** un eveniment în probă, **When** organizatorul îl deschide, **Then** vede numărul
   de fișiere încărcate din maximul permis, data ștergerii automate și instrucțiunile de
   activare a pachetului complet.
2. **Given** un eveniment în probă aproape de limita de fișiere (cel puțin 80% consumat),
   **When** organizatorul îl deschide, **Then** vede o avertizare vizibilă.
3. **Given** un eveniment în probă activat de administrator la pachetul complet, **When**
   organizatorul îl redeschide, **Then** limitele afișate sunt cele ale pachetului complet, iar
   fișierele deja încărcate rămân neschimbate.

---

### User Story 4 - Administratorul gestionează evenimentele self-service (Priority: P2)

Administratorul vede lista evenimentelor create self-service, cu emailul organizatorului, starea,
consumul curent (fișiere, spațiu) și data ștergerii. Poate activa pachetul complet, prelungi
perioada de probă sau suspenda (și reactiva) un eveniment. Fiecare schimbare de stare se
păstrează în istoric, cu sursa ei.

**Why this priority**: este mecanismul prin care proba devine venit; până la plata online, doar
administratorul poate face asta.

**Independent Test**: administratorul activează, prelungește și suspendă evenimente de test și
verifică istoricul fiecăruia.

**Acceptance Scenarios**:

1. **Given** evenimente self-service în diferite stări, **When** administratorul deschide
   lista, **Then** vede pentru fiecare emailul organizatorului, starea, consumul și data
   ștergerii, și poate filtra după stare.
2. **Given** un eveniment în probă, **When** administratorul activează pachetul complet,
   **Then** evenimentul trece în starea activ, primește limitele pachetului complet și prețul
   pachetului, iar istoricul arată schimbarea, autorul și momentul.
3. **Given** un eveniment în probă, **When** administratorul prelungește proba cu un număr de
   zile, **Then** data ștergerii automate se mută cu acel număr de zile, iar schimbarea apare în
   istoric.
4. **Given** un eveniment în probă sau activ, **When** administratorul îl suspendă cu un motiv,
   **Then** invitații nu mai pot încărca, organizatorul vede că evenimentul este suspendat, iar
   administratorul îl poate reactiva în starea anterioară.
5. **Given** administratorul, **When** vede lista, **Then** nu poate vedea sau descărca
   fișierele media (001/FR-007 rămâne valabil).

---

### User Story 5 - Administratorul configurează pachetele (Priority: P2)

Administratorul stabilește, fără modificări de cod, limitele regimului de probă și ale
pachetului complet: numărul maxim de fișiere pe eveniment, durata de păstrare, prețul pachetului
complet și numărul maxim de evenimente în probă active simultan per organizator.

**Why this priority**: limitele potrivite se descoperă din utilizare; fără configurare, fiecare
ajustare ar cere o versiune nouă a aplicației.

**Independent Test**: administratorul schimbă limita de fișiere a probei; un eveniment nou în
probă o aplică, iar unul existent își păstrează limita de la creare.

**Acceptance Scenarios**:

1. **Given** administratorul în ecranul pachetelor, **When** modifică limitele probei și
   salvează, **Then** evenimentele create ulterior folosesc noile limite.
2. **Given** evenimente existente în probă sau active, **When** administratorul modifică
   limitele pachetelor, **Then** limitele acelor evenimente nu se schimbă.
3. **Given** valori invalide (zero, negative, peste plafoanele platformei), **When**
   administratorul salvează, **Then** salvarea este refuzată cu mesaje explicite.

---

### User Story 6 - Invitatul primește un mesaj clar când nu mai poate încărca (Priority: P2)

Un invitat care scanează codul QR al unui eveniment suspendat sau care a atins limita de fișiere
a probei vede un mesaj clar și politicos, nu o eroare.

**Why this priority**: invitații sunt la eveniment, în fața altor oameni; o eroare tehnică
afectează imaginea organizatorului și a produsului.

**Independent Test**: se atinge limita unui eveniment de probă și se suspendă alt eveniment;
pagina invitatului arată mesajele potrivite.

**Acceptance Scenarios**:

1. **Given** un eveniment în probă care a atins limita de fișiere, **When** un invitat deschide
   pagina de upload, **Then** vede un mesaj că evenimentul nu mai acceptă fișiere noi și o
   recomandare să ia legătura cu organizatorul.
2. **Given** un invitat care încarcă mai multe fișiere și limita se atinge în timpul
   încărcării, **When** fișierele rămase sunt refuzate, **Then** fișierele deja încărcate sunt
   confirmate, iar cele refuzate sunt marcate cu același mesaj politicos.
3. **Given** un eveniment suspendat, **When** un invitat deschide pagina de upload, **Then**
   vede un mesaj că evenimentul nu primește momentan fișiere, fără detalii despre motiv.

---

### User Story 7 - Organizatorul își modifică sau șterge evenimentul (Priority: P2)

Organizatorul poate schimba numele și data evenimentului său și îl poate șterge definitiv,
împreună cu toate fișierele, după o confirmare explicită.

**Why this priority**: clientul trebuie să poată corecta o greșeală de tastare și să își
retragă datele fără să scrie administratorului.

**Independent Test**: organizatorul redenumește evenimentul, schimbă data și apoi îl șterge;
linkul invitaților devine invalid, iar fișierele nu mai sunt accesibile.

**Acceptance Scenarios**:

1. **Given** un eveniment al organizatorului, **When** acesta schimbă numele și data, **Then**
   modificările apar în galerie, în lista lui și pe pagina invitaților, iar linkul și codul QR
   rămân aceleași.
2. **Given** un eveniment al organizatorului, **When** acesta cere ștergerea și confirmă prin
   tastarea numelui evenimentului, **Then** evenimentul, toate fișierele (originale și derivate)
   și sesiunile invitaților sunt șterse definitiv, iar linkul de upload devine invalid.
3. **Given** un eveniment al altui organizator, **When** un organizator încearcă să îl
   modifice sau să îl șteargă, **Then** acțiunea este refuzată.

---

### Edge Cases

- Vizitatorul trimite formularul de mai multe ori pentru același eveniment înainte de
  confirmare: fiecare trimitere creează o cerere separată, în limita de emailuri; confirmarea
  uneia nu le confirmă pe celelalte, iar cele neconfirmate se șterg după 24 de ore.
- Vizitatorul confirmă după ce evenimentul neconfirmat a fost șters (după 24 de ore): link-ul și
  codul au expirat deja; i se cere să creeze din nou evenimentul.
- Linkul din email este deschis automat de un scaner de securitate al furnizorului de email:
  deschiderea nu confirmă nimic, fiindcă e nevoie de apăsarea butonului.
- Se introduce greșit codul de mai multe ori: după 5 încercări greșite codul este invalidat și
  trebuie cerut un email nou.
- Vizitatorul cere un email nou: codul și linkul din emailul anterior devin invalide.
- Adresa de email are majuscule sau spații la capete: adresa este normalizată, astfel încât
  „Ana@Exemplu.ro ” și „ana@exemplu.ro” reprezintă același organizator.
- Data evenimentului este în trecut: este refuzată; data poate fi cel mult cu 2 ani în viitor.
- Organizatorul schimbă data unui eveniment în probă: perioada de upload și data ștergerii se
  recalculează după noua dată, dar data ștergerii nu poate fi mutată mai devreme decât momentul
  modificării.
- Organizatorul schimbă data unui eveniment activ după ce perioada de upload s-a încheiat: data
  ștergerii nu se modifică (retenția rămâne calculată ca în 001/FR-040).
- Administratorul activează pachetul complet pentru un eveniment care a atins limita de fișiere
  a probei: invitații pot încărca din nou imediat, fără alt pas.
- Un organizator cu evenimente create de administrator creează primul eveniment self-service:
  i se cere acceptarea termenilor (dacă nu a acceptat versiunea curentă), fără email de
  confirmare dacă este deja autentificat.
- Versiunea termenilor se schimbă: un organizator care creează un eveniment nou trebuie să
  accepte noua versiune; acceptările anterioare rămân în istoric.
- Un eveniment suspendat ajunge la data ștergerii automate: se șterge conform 001/FR-044.
- Organizatorul șterge un eveniment pentru care pachetul complet a fost activat: datele
  necesare facturării (nume, dată, email, preț, istoric de stări) se păstrează până la
  anonimizare (001/FR-047); fișierele și sesiunile invitaților se șterg imediat.
- Același email primește simultan cereri din surse diferite: limita per adresă se aplică
  indiferent de sursă.

## Requirements *(mandatory)*

### Functional Requirements

**Crearea self-service**

- **FR-001**: Pagina principală TREBUIE să conțină un formular de creare a evenimentului cu:
  adresa de email, numele evenimentului, data evenimentului și acceptarea explicită (casetă
  nebifată implicit) a termenilor și a politicii de confidențialitate, cu linkuri către ambele
  documente. Formularul NU TREBUIE să ceară parolă sau alte date de înregistrare.
- **FR-002**: Sistemul TREBUIE să valideze datele formularului (email valid, nume de 1–120 de
  caractere, dată între ziua curentă și 2 ani în viitor, termeni acceptați) și să afișeze
  erorile lângă câmpurile respective.
- **FR-003**: După trimiterea unui formular valid de către un vizitator neautentificat, sistemul
  TREBUIE să creeze evenimentul în starea „neconfirmat” și să trimită un email de confirmare.
  Mesajul afișat după trimitere TREBUIE să fie identic, ca text și ca durată aproximativă de
  răspuns, indiferent dacă adresa este deja asociată unui organizator.
- **FR-004**: Un eveniment neconfirmat NU TREBUIE să fie accesibil nimănui (nici invitaților,
  nici în listele organizatorului) și TREBUIE șters automat, împreună cu datele formularului,
  dacă nu este confirmat în 24 de ore de la creare.
- **FR-005**: Un organizator deja autentificat TREBUIE să poată crea evenimente noi (din cont
  sau de pe pagina principală) fără email de confirmare; evenimentul începe direct în probă.

**Confirmarea și autentificarea**

- **FR-006**: Emailul de confirmare TREBUIE să conțină un link și un cod numeric de 6 cifre,
  ambele de unică folosință, valabile 15 minute. Folosirea unuia dintre ele le invalidează pe
  amândouă; cererea unui email nou le invalidează pe cele anterioare.
- **FR-007**: Linkul din email TREBUIE să deschidă o pagină de confirmare cu un buton; simpla
  accesare a linkului NU TREBUIE să confirme evenimentul sau să autentifice utilizatorul.
- **FR-008**: După trimiterea formularului, pagina TREBUIE să ofere un câmp pentru codul din
  email, astfel încât confirmarea să poată fi finalizată pe dispozitivul pe care a început,
  chiar dacă emailul este citit pe alt dispozitiv. După 5 coduri greșite, codul curent TREBUIE
  invalidat.
- **FR-009**: La confirmare, sistemul TREBUIE să creeze contul de organizator pentru adresă
  (dacă nu există), să treacă evenimentul în starea „probă”, să autentifice utilizatorul pe
  dispozitivul pe care a confirmat și să îl ducă direct la pagina evenimentului, cu codul QR
  disponibil pentru descărcare (PNG și SVG, ca în 001/FR-005).
- **FR-010**: Autentificarea organizatorului care revine TREBUIE să folosească același mecanism:
  email cu link (care deschide o pagină cu buton) și cod numeric, cu aceleași reguli de
  expirare și unică folosință. Aceasta înlocuiește linkul din 001/FR-008.
- **FR-011**: Pentru o adresă fără cont, cererea de autentificare TREBUIE să afișeze același
  mesaj ca pentru o adresă existentă și NU TREBUIE să creeze cont.
- **FR-012**: Organizatorul autentificat TREBUIE să vadă toate evenimentele asociate adresei
  sale, indiferent de cine le-a creat (el sau administratorul), cu starea fiecăruia; evenimentele
  neconfirmate nu apar.
- **FR-013**: Emailurile de confirmare și de autentificare TREBUIE să fie în limba română, să
  conțină numele produsului, scopul emailului, codul, linkul și mențiunea că pot fi ignorate
  dacă destinatarul nu a făcut cererea.

**Pachete și regimul de probă**

- **FR-014**: Sistemul TREBUIE să definească două pachete: „probă” și „complet”. Fiecare pachet
  are: număr maxim de fișiere pe eveniment, număr maxim de fișiere per invitat, durata de
  păstrare și, pentru pachetul complet, prețul și opțiunile de retenție disponibile (catalogul
  din 001/FR-038).
- **FR-015**: Administratorul TREBUIE să poată modifica limitele și prețul pachetelor, precum și
  numărul maxim de evenimente în probă active simultan per organizator, fără modificări de cod.
  Modificările se aplică doar evenimentelor create sau activate ulterior.
- **FR-016**: Fiecare eveniment TREBUIE să păstreze pachetul și limitele aplicate la momentul
  creării sau al ultimei activări, independent de modificările ulterioare ale pachetelor.
- **FR-017**: Un eveniment în probă TREBUIE să ofere toate funcțiile din 001 (upload invitați,
  galerie în timp real, descărcare individuală și arhivă, ștergere), în limitele pachetului de
  probă.
- **FR-018**: Pagina evenimentului în probă TREBUIE să afișeze: numărul de fișiere încărcate din
  maximul permis, data ștergerii automate și instrucțiunile de activare a pachetului complet
  (prețul și modul de contact al administratorului). La un consum de cel puțin 80% TREBUIE
  afișată o avertizare vizibilă.
- **FR-019**: Pentru evenimentele în probă, sistemul TREBUIE să refuze pe server orice fișier
  care ar depăși numărul maxim de fișiere pe eveniment; fișierele deja acceptate nu sunt
  afectate.
- **FR-020**: Pentru evenimentele în probă, organizatorul NU TREBUIE să poată prelungi singur
  retenția (001/FR-041 se aplică doar evenimentelor active).
- **FR-021**: Un organizator NU TREBUIE să poată avea simultan mai multe evenimente în probă
  decât limita configurată (implicit 2). Evenimentele neconfirmate nu se numără.

**Stările evenimentului și istoricul**

- **FR-022**: Fiecare eveniment TREBUIE să aibă exact una dintre stările: neconfirmat, probă,
  activ, suspendat, expirat. Tranzițiile permise sunt: neconfirmat → probă (confirmare);
  probă → activ (activarea pachetului complet); probă sau activ → suspendat; suspendat →
  starea dinaintea suspendării (reactivare); probă, activ sau suspendat → expirat (la data
  ștergerii automate). Orice altă tranziție TREBUIE refuzată.
- **FR-023**: Evenimentele create de administrator TREBUIE să înceapă direct în starea activ, cu
  pachetul complet, ca în 001.
- **FR-024**: Fiecare schimbare de stare TREBUIE înregistrată, fără posibilitate de modificare
  ulterioară, cu: starea anterioară și cea nouă, momentul, sursa (organizator, administrator,
  sistem automat sau sistem de plăți), autorul atunci când este o persoană și un motiv sau o
  referință externă opțională (de ex. referința unei plăți).
- **FR-025**: Activarea pachetului complet TREBUIE să poată fi declanșată de administrator și,
  într-o funcționalitate ulterioară, automat de un sistem de plăți, prin aceeași operație și cu
  aceleași efecte: starea devine activ, se aplică limitele și prețul pachetului complet, iar
  data ștergerii se recalculează după durata de păstrare a pachetului complet (001/FR-040).
- **FR-026**: Activarea TREBUIE să fie idempotentă: o a doua activare a aceluiași eveniment
  (de ex. o notificare de plată repetată) NU TREBUIE să schimbe din nou prețul sau data ștergerii
  și TREBUIE înregistrată ca atare.

**Administrare**

- **FR-027**: Administratorul TREBUIE să vadă lista evenimentelor create self-service, cu:
  numele, data, emailul organizatorului, starea, numărul de fișiere, spațiul ocupat, data creării
  și data ștergerii, cu filtrare după stare.
- **FR-028**: Administratorul TREBUIE să poată activa pachetul complet, prelungi perioada de
  probă cu un număr de zile (1–90) și suspenda sau reactiva un eveniment, cu un motiv opțional.
  Fiecare acțiune TREBUIE să ceară confirmare și TREBUIE înregistrată conform FR-024.
- **FR-029**: Administratorul TREBUIE să vadă istoricul stărilor fiecărui eveniment.
- **FR-030**: Crearea evenimentelor de către administrator (001/FR-001) TREBUIE să rămână
  disponibilă, iar evenimentele create astfel apar organizatorului conform FR-012.

**Comportamentul pentru invitați**

- **FR-031**: Pentru un eveniment suspendat, pagina de upload TREBUIE să afișeze un mesaj
  politicos că evenimentul nu primește momentan fișiere, fără a dezvălui motivul, și să refuze
  pe server orice upload.
- **FR-032**: Pentru un eveniment în probă care a atins limita de fișiere, pagina de upload
  TREBUIE să afișeze un mesaj politicos că evenimentul nu mai acceptă fișiere noi, cu
  recomandarea de a lua legătura cu organizatorul; fișierele refuzate în timpul unei încărcări
  în curs TREBUIE marcate cu același mesaj.

**Modificare și ștergere de către organizator**

- **FR-033**: Organizatorul TREBUIE să poată modifica numele și data oricăruia dintre
  evenimentele sale care nu este expirat, cu aceleași validări ca la creare. Linkul public și
  codul QR NU TREBUIE să se schimbe.
- **FR-034**: Pentru evenimentele create self-service, perioada de upload TREBUIE să înceapă la
  confirmare și să se încheie la sfârșitul zilei următoare datei evenimentului (ora României);
  la schimbarea datei, perioada se recalculează.
- **FR-035**: Organizatorul TREBUIE să poată șterge definitiv oricare dintre evenimentele sale,
  după confirmare prin tastarea numelui evenimentului, cu aceleași efecte ca 001/FR-006b.
  Pentru evenimentele care au avut pachetul complet activat, datele necesare facturării se
  păstrează până la anonimizare (001/FR-047).

**Protecție împotriva abuzului**

- **FR-036**: Sistemul TREBUIE să limiteze emailurile de confirmare și de autentificare: cel
  mult 3 pe 15 minute și 10 pe zi către aceeași adresă, și cel mult 20 pe oră din aceeași sursă
  de rețea. Depășirea TREBUIE să afișeze același mesaj neutru, fără a confirma existența
  adresei.
- **FR-037**: Formularul de creare TREBUIE protejat printr-o verificare anti-bot care, pentru
  utilizatorii reali, nu cere în mod obișnuit nicio acțiune suplimentară; o provocare vizibilă
  apare doar în cazurile suspecte, și TREBUIE să fie accesibilă (WCAG 2.2 AA).
- **FR-038**: Toate limitele din FR-021 și FR-036 TREBUIE aplicate pe server.

**Termeni și confidențialitate**

- **FR-039**: Sistemul TREBUIE să publice termenii și politica de confidențialitate ca pagini
  accesibile public, fiecare cu un identificator de versiune și data intrării în vigoare.
- **FR-040**: Acceptarea TREBUIE înregistrată per organizator, cu: momentul, versiunea fiecărui
  document acceptat și evenimentul la a cărui creare s-a făcut. Pentru un eveniment neconfirmat,
  acceptarea se păstrează doar dacă evenimentul este confirmat.
- **FR-041**: Dacă versiunea curentă a unui document diferă de ultima versiune acceptată de
  organizator, crearea unui eveniment nou TREBUIE să ceară acceptarea noii versiuni.

**Calitate**

- **FR-042**: Toate ecranele noi (pagina principală, confirmare, cod, administrare pachete și
  evenimente self-service) TREBUIE să fie în limba română, mobile-first și conforme WCAG 2.2 AA.

### Key Entities

- **Pachet**: set de limite și condiții comerciale: tip (probă sau complet), număr maxim de
  fișiere pe eveniment, număr maxim de fișiere per invitat, durată de păstrare, preț (pentru
  pachetul complet). Configurabil de administrator.
- **Setări self-service**: numărul maxim de evenimente în probă active simultan per organizator.
- **Eveniment** (extins față de 001): în plus, sursa creării (administrator sau self-service),
  stare (neconfirmat, probă, activ, suspendat, expirat), pachetul și limitele aplicate (copie la
  momentul creării sau activării), starea dinaintea unei suspendări. Stările tehnice din 001 („în
  expirare”, „în ștergere”) rămân etape interne ale expirării și ștergerii.
- **Schimbare de stare**: istoricul imuabil al unui eveniment: stare anterioară și nouă, moment,
  sursă (organizator, administrator, sistem automat, sistem de plăți), autor, motiv sau
  referință externă.
- **Cerere de confirmare**: legată de o adresă de email și, la creare, de un eveniment
  neconfirmat: link și cod de unică folosință, expirare, număr de încercări greșite, stare
  (în așteptare, folosită, expirată, invalidată).
- **Document legal**: termeni sau politică de confidențialitate, cu versiune și dată de intrare
  în vigoare.
- **Acceptare**: organizator, document, versiune, moment, eveniment asociat.
- **Organizator** (extins față de 001): poate fi creat și prin confirmarea unui eveniment
  self-service, nu doar de administrator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un vizitator nou creează un eveniment, îl confirmă și descarcă codul QR în sub 3
  minute, fără ajutor, în cel puțin 90% din testele cu utilizatori.
- **SC-002**: Confirmarea reușește în 100% din cazurile testate atât prin link, cât și prin cod
  introdus pe alt dispozitiv decât cel pe care a fost citit emailul.
- **SC-003**: 0 evenimente sau conturi confirmate prin simpla accesare a linkului, fără
  apăsarea butonului (inclusiv la deschiderea automată de către scanere de email).
- **SC-004**: Răspunsurile formularului de creare și ale cererii de autentificare sunt
  identice, ca text și ca timp de răspuns (diferență medie sub 100 ms), pentru adrese
  existente și inexistente.
- **SC-005**: 100% dintre evenimentele neconfirmate sunt șterse în cel mult 25 de ore de la
  creare.
- **SC-006**: 0 emailuri trimise peste limitele din FR-036 în testele de abuz automatizate.
- **SC-007**: Cel puțin 95% dintre utilizatorii reali trimit formularul fără să vadă o
  provocare anti-bot, iar trimiterile automate fără verificare sunt blocate în 100% din
  testele automatizate.
- **SC-008**: Emailurile de confirmare ajung în inbox (nu în spam sau promoții) în testele pe
  cel puțin trei furnizori de email larg folosiți în România.
- **SC-009**: 100% dintre fișierele care ar depăși limita probei sunt refuzate, iar invitatul
  vede mesajul politicos, nu o eroare tehnică.
- **SC-010**: 100% dintre schimbările de stare au o intrare în istoric cu sursa și momentul; o
  activare repetată nu modifică prețul sau data ștergerii.
- **SC-011**: Administratorul activează pachetul complet pentru un eveniment în sub 1 minut,
  iar invitații pot încărca din nou imediat după activare.
- **SC-012**: 100% dintre evenimentele create includ acceptarea termenilor, cu versiunea și
  momentul înregistrate.

## Assumptions

- Plata online nu este în scop; „modul de activare a pachetului complet” afișat organizatorului
  înseamnă prețul pachetului și contactul administratorului (email). Activarea o face
  administratorul, după încasarea în afara aplicației (ca în 001).
- Valorile inițiale ale pachetelor (modificabile de administrator): proba permite 100 de
  fișiere pe eveniment, 20 de fișiere per invitat și păstrare 7 zile după sfârșitul perioadei de
  upload; pachetul complet păstrează valorile din 001 (fișiere per invitat conform
  evenimentului, fără limită pe eveniment, 3 luni incluse, catalogul de retenție pentru
  prelungire).
- Prelungirea probei mută data ștergerii automate; nu schimbă limitele de fișiere.
- Dimensiunile maxime per fișier pentru evenimentele self-service sunt plafoanele platformei
  (001/FR-001a); organizatorul nu le poate modifica.
- Suspendarea oprește doar uploadurile; organizatorul își păstrează accesul la fișiere
  (vizualizare, descărcare, ștergere), pentru ca datele lui să rămână accesibile.
- Textele termenilor și ale politicii de confidențialitate sunt furnizate de proprietarul
  platformei; publicarea unei versiuni noi se face printr-o versiune nouă a aplicației, nu din
  interfața de administrare.
- Adresele de email se compară fără diferențe de majuscule și fără spații la capete.
- Codul de 6 cifre, valabilitatea de 15 minute și cele 5 încercări sunt valori standard pentru
  coduri de unică folosință; valabilitatea linkului scade astfel de la 1 oră (001/FR-008) la 15
  minute.
- Autentificarea administratorului (link pe email și al doilea factor, 001/FR-006a) rămâne
  neschimbată, dar primește același tip de email (link către pagină cu buton și cod).
- Evenimentele create de administrator nu au limită pe numărul de evenimente per organizator și
  nu trec prin probă.
- Accesul mai multor organizatori la același eveniment, autentificarea prin Google sau alți
  furnizori și plata online rămân în afara scopului.

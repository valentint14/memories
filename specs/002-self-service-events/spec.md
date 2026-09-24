# Feature Specification: Creare self-service a evenimentelor de către organizatori

**Feature Branch**: `002-self-service-events`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Crearea evenimentelor în regim self-service de către organizatori, pe baza adresei de email, fără parolă. Oricine își poate crea singur un eveniment în regim de probă; administratorul păstrează controlul asupra activării pachetului complet, iar crearea de către administrator rămâne disponibilă. Modelul de pachete și stările evenimentului (neconfirmat, probă, activ, suspendat, expirat) trebuie să permită ulterior activarea automată de către un sistem de plăți, cu istoricul fiecărei schimbări de stare și al sursei ei."

**Relația cu funcționalitatea 001** ([spec 001](../001-event-qr-upload/spec.md)): această
funcționalitate înlocuiește regula „nu există înregistrare self-service” (001/FR-006),
restricția ca organizatorul să nu poată șterge evenimentul (001/FR-006b) și presupunerea că
organizatorul nu poate modifica datele evenimentului. După activare, un eveniment
creat self-service se comportă exact ca unul creat de administrator (upload invitați, galerie,
descărcare, ștergerea fișierelor, retenție, anonimizare).

## Clarifications

### Session 2026-09-24

- Q: Care să fie limitele inițiale ale regimului de probă? → A: Nu există regim de probă. Un
  eveniment creat self-service ajunge, după confirmarea emailului, în starea „în așteptarea
  activării”: organizatorul îl vede, îl poate edita și descarcă codul QR, dar invitații nu pot
  încărca fișiere până la activarea pachetului complet (de administrator acum, prin plată online
  ulterior). Starea „probă” din descrierea inițială este înlocuită de „în așteptarea activării”.
- Q: Ce se întâmplă cu un eveniment care rămâne în așteptarea activării și nu este activat
  niciodată? → A: Se șterge automat la 30 de zile după data evenimentului; organizatorul
  primește un email de avertizare cu 7 zile înainte.
- Q: Ce mai poate face organizatorul cu fișierele unui eveniment suspendat de administrator?
  → A: Uploadurile se opresc; organizatorul poate doar descărca și șterge fișiere, fără galerie
  live și fără prelungirea retenției.
- Q: Poate organizatorul să șteargă singur și evenimentele create sau activate de
  administrator? → A: Da, pentru toate evenimentele lui (neactivate, active, suspendate), cu
  confirmare prin tastarea numelui; datele de facturare se păstrează.
- Q: Cum află administratorul că un organizator vrea să își activeze evenimentul? → A: Buton
  „Solicită activarea”: administratorul primește un email, iar evenimentul apare marcat în
  lista lui; organizatorul vede că cererea a fost trimisă.

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
administrator pentru a începe. Livrată singură, permite unui client nou să își pregătească
evenimentul și codul QR fără intervenția administratorului.

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
   **Then** este autentificat ca organizator și ajunge la evenimentul nou creat, aflat în
   așteptarea activării, cu codul QR disponibil pentru descărcare.
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
   evenimentul este creat direct în așteptarea activării, fără email de confirmare.
3. **Given** un organizator care a atins limita de evenimente în așteptarea activării, **When**
   încearcă să creeze încă unul, **Then** primește un mesaj care explică limita și cum se
   activează un eveniment existent.
4. **Given** un organizator autentificat care trimite formularul de pe pagina principală,
   **When** îl trimite, **Then** evenimentul se creează direct în contul lui, fără email de
   confirmare.

---

### User Story 3 - Evenimentul în așteptarea activării (Priority: P1)

Un eveniment creat self-service și confirmat este „în așteptarea activării”. Organizatorul îl
vede în cont, îi poate modifica numele și data și poate descărca codul QR, ca să îl pregătească
din timp (invitații, afișe, mese). Pagina evenimentului arată clar că invitații nu pot încărca
fișiere până la activarea pachetului complet, prețul pachetului și cum se face activarea. După
activare, evenimentul funcționează complet, cu același cod QR.

**Why this priority**: fără această stare, crearea liberă ar oferi gratuit stocare și procesare;
cu ea, organizatorul își pregătește evenimentul, iar platforma nu consumă resurse până la plată.

**Independent Test**: un eveniment nou creat self-service afișează starea, prețul și
instrucțiunile de activare; un invitat nu poate încărca; după activare de către administrator,
același cod QR permite uploadul.

**Acceptance Scenarios**:

1. **Given** un eveniment în așteptarea activării, **When** organizatorul îl deschide, **Then**
   vede starea, codul QR pentru descărcare, prețul pachetului complet, instrucțiunile de
   activare și data la care evenimentul se șterge dacă nu este activat, iar galeria este goală,
   cu explicația că invitații vor putea încărca după activare.
2. **Given** un eveniment în așteptarea activării, **When** administratorul activează pachetul
   complet, **Then** organizatorul vede evenimentul activ, cu data ștergerii automate și prețul
   final, iar invitații pot încărca folosind același cod QR.
3. **Given** un eveniment în așteptarea activării, **When** organizatorul apasă „Solicită
   activarea”, **Then** administratorul primește un email cu datele evenimentului, evenimentul
   apare marcat „activare solicitată” în lista administratorului, iar organizatorul vede că
   cererea a fost trimisă și nu o poate retrimite în următoarele 24 de ore.
4. **Given** un eveniment neactivat la 23 de zile după data lui, **When** sistemul verifică
   termenele, **Then** organizatorul primește un singur email de avertizare că evenimentul se
   șterge peste 7 zile, iar la 30 de zile după dată evenimentul este șters definitiv.

---

### User Story 4 - Administratorul gestionează evenimentele self-service (Priority: P2)

Administratorul vede lista evenimentelor create self-service, cu emailul organizatorului, starea
și, pentru cele active, consumul curent (fișiere, spațiu) și data ștergerii. Poate activa
pachetul complet și poate suspenda (și reactiva) un eveniment. Fiecare schimbare de stare se
păstrează în istoric, cu sursa ei.

**Why this priority**: este mecanismul prin care un eveniment creat self-service devine venit;
până la plata online, doar administratorul poate face asta.

**Independent Test**: administratorul activează, suspendă și reactivează evenimente de test și
verifică istoricul fiecăruia.

**Acceptance Scenarios**:

1. **Given** evenimente self-service în diferite stări, **When** administratorul deschide
   lista, **Then** vede pentru fiecare emailul organizatorului, starea, data creării și, pentru
   evenimentele active, consumul și data ștergerii, și poate filtra după stare.
2. **Given** un eveniment în așteptarea activării, **When** administratorul activează pachetul
   complet, **Then** evenimentul devine activ, primește limitele și prețul pachetului complet și
   data ștergerii automate, iar istoricul arată schimbarea, autorul și momentul.
3. **Given** un eveniment activ, **When** administratorul îl suspendă cu un motiv, **Then**
   invitații nu mai pot încărca, organizatorul vede că evenimentul este suspendat și poate doar
   vizualiza, descărca și șterge fișierele, iar administratorul îl poate reactiva.
4. **Given** administratorul, **When** vede lista, **Then** nu poate vedea sau descărca
   fișierele media (001/FR-007 rămâne valabil).

---

### User Story 5 - Administratorul configurează pachetul complet (Priority: P2)

Administratorul stabilește, fără modificări de cod, condițiile pachetului complet (prețul,
numărul maxim de fișiere per invitat, durata de păstrare inclusă) și numărul maxim de evenimente
în așteptarea activării per organizator.

**Why this priority**: prețul și limitele potrivite se ajustează din utilizare; fără
configurare, fiecare ajustare ar cere o versiune nouă a aplicației.

**Independent Test**: administratorul schimbă prețul pachetului; un eveniment activat ulterior
primește noul preț, iar unul deja activ îl păstrează pe cel vechi.

**Acceptance Scenarios**:

1. **Given** administratorul în ecranul pachetului, **When** modifică prețul sau limitele și
   salvează, **Then** evenimentele activate ulterior folosesc noile valori, iar evenimentele în
   așteptarea activării afișează noul preț.
2. **Given** evenimente deja active, **When** administratorul modifică pachetul, **Then**
   limitele și prețul acelor evenimente nu se schimbă.
3. **Given** valori invalide (zero, negative, peste plafoanele platformei), **When**
   administratorul salvează, **Then** salvarea este refuzată cu mesaje explicite.

---

### User Story 6 - Invitatul primește un mesaj clar când nu poate încărca (Priority: P2)

Un invitat care scanează codul QR al unui eveniment încă neactivat sau suspendat vede un mesaj
clar și politicos, nu o eroare.

**Why this priority**: codul QR poate fi tipărit și distribuit înainte de activare; invitații
sunt la eveniment, în fața altor oameni, iar o eroare tehnică afectează imaginea
organizatorului și a produsului.

**Independent Test**: se deschide pagina de upload pentru un eveniment neactivat și pentru unul
suspendat; ambele afișează mesajele potrivite și refuză uploadul.

**Acceptance Scenarios**:

1. **Given** un eveniment în așteptarea activării, **When** un invitat deschide pagina de
   upload, **Then** vede numele evenimentului și un mesaj că încărcarea fișierelor nu este încă
   deschisă, cu recomandarea de a reveni mai târziu sau de a lua legătura cu organizatorul.
2. **Given** un eveniment suspendat, **When** un invitat deschide pagina de upload, **Then**
   vede un mesaj că evenimentul nu primește momentan fișiere, fără detalii despre motiv.
3. **Given** un invitat care încarcă fișiere când evenimentul este suspendat, **When** fișierele
   rămase sunt refuzate, **Then** fișierele deja încărcate sunt confirmate, iar cele refuzate
   sunt marcate cu același mesaj politicos.

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
- Vizitatorul confirmă după ce evenimentul neconfirmat a fost șters (după 24 de ore): linkul și
  codul au expirat deja; i se cere să creeze din nou evenimentul.
- Vizitatorul confirmă un eveniment nou, dar adresa lui are deja numărul maxim de evenimente în
  așteptarea activării: este autentificat și vede lista evenimentelor, cu un mesaj care explică
  limita și cum se activează un eveniment existent; evenimentul nou nu se creează (rămâne
  neconfirmat și se șterge după 24 de ore).
- Linkul din email este deschis automat de un scaner de securitate al furnizorului de email:
  deschiderea nu confirmă nimic, fiindcă e nevoie de apăsarea butonului.
- Se introduce greșit codul de mai multe ori: după 5 încercări greșite codul este invalidat și
  trebuie cerut un email nou.
- Vizitatorul cere un email nou: codul și linkul din emailul anterior devin invalide.
- Adresa de email are majuscule sau spații la capete: adresa este normalizată, astfel încât
  „Ana@Exemplu.ro ” și „ana@exemplu.ro” reprezintă același organizator.
- Data evenimentului este în trecut: este refuzată; data poate fi cel mult cu 2 ani în viitor.
- Administratorul activează un eveniment a cărui dată a trecut deja: perioada de upload începe
  la activare și se încheie la sfârșitul zilei următoare activării, astfel încât invitații au
  cel puțin o zi pentru încărcare.
- Organizatorul mută data unui eveniment neactivat după ce a primit emailul de avertizare:
  data ștergerii se recalculează, iar un nou email de avertizare se trimite o singură dată,
  cu 7 zile înainte de noul termen.
- Administratorul activează un eveniment în ultima zi dinaintea ștergerii automate: activarea
  are prioritate, iar evenimentul nu mai este șters.
- Organizatorul schimbă data unui eveniment activ după ce perioada de upload s-a încheiat: data
  ștergerii nu se modifică (retenția rămâne calculată ca în 001/FR-040).
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
  sau de pe pagina principală) fără email de confirmare; evenimentul începe direct în
  așteptarea activării.

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
  (dacă nu există), să treacă evenimentul în starea „în așteptarea activării”, să autentifice
  utilizatorul pe dispozitivul pe care a confirmat și să îl ducă direct la pagina evenimentului,
  cu codul QR disponibil pentru descărcare (PNG și SVG, ca în 001/FR-005).
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

**Pachetul complet și activarea**

- **FR-014**: Sistemul TREBUIE să definească pachetul complet, cu: preț, număr maxim de fișiere
  per invitat, durata de păstrare inclusă și opțiunile de retenție disponibile pentru
  prelungire (catalogul din 001/FR-038). Modelul TREBUIE să permită adăugarea ulterioară a altor
  pachete fără a schimba stările sau istoricul.
- **FR-015**: Administratorul TREBUIE să poată modifica prețul și limitele pachetului complet,
  precum și numărul maxim de evenimente în așteptarea activării per organizator, fără
  modificări de cod. Modificările se aplică doar evenimentelor activate ulterior.
- **FR-016**: Fiecare eveniment activat TREBUIE să păstreze pachetul, prețul și limitele
  aplicate la momentul activării, independent de modificările ulterioare ale pachetului.
- **FR-017**: Un eveniment în așteptarea activării TREBUIE să permită organizatorului: să îl
  vadă, să îi modifice numele și data, să descarce codul QR și să îl șteargă. Invitații NU
  TREBUIE să poată încărca fișiere; refuzul se aplică pe server.
- **FR-018**: Pagina unui eveniment în așteptarea activării TREBUIE să afișeze starea, prețul
  curent al pachetului complet, ce include (durata de păstrare, limita de fișiere per invitat)
  și un buton „Solicită activarea”.
- **FR-018a**: La apăsarea butonului „Solicită activarea”, sistemul TREBUIE să înregistreze
  cererea (momentul), să trimită administratorilor un email în română cu numele și data
  evenimentului, emailul organizatorului și un link către evenimentul din administrare, și să
  afișeze organizatorului că cererea a fost trimisă, cu data ei. O nouă cerere pentru același
  eveniment este posibilă doar după 24 de ore. Cererea nu schimbă starea evenimentului.
- **FR-019**: Un eveniment în așteptarea activării TREBUIE șters automat și definitiv la 30 de
  zile după data evenimentului (sfârșitul zilei, ora României), dacă nu a fost activat până
  atunci. Organizatorul TREBUIE să primească un singur email de avertizare, cu 7 zile înainte,
  cu data ștergerii și modul de activare; pagina evenimentului afișează aceeași dată. Schimbarea
  datei evenimentului recalculează data ștergerii. La activare, această regulă nu se mai aplică,
  iar data ștergerii fișierelor se stabilește conform FR-025. Dacă organizatorul nu mai are alte
  evenimente, datele lui de organizator se șterg odată cu evenimentul.
- **FR-020**: Organizatorul NU TREBUIE să poată prelungi retenția (001/FR-041) decât pentru
  evenimentele active.
- **FR-021**: Un organizator NU TREBUIE să poată avea simultan mai multe evenimente în
  așteptarea activării decât limita configurată (implicit 2). Evenimentele neconfirmate nu se
  numără.

**Stările evenimentului și istoricul**

- **FR-022**: Fiecare eveniment TREBUIE să aibă exact una dintre stările: neconfirmat, în
  așteptarea activării, activ, suspendat, expirat. Tranzițiile permise sunt: neconfirmat → în
  așteptarea activării (confirmare); în așteptarea activării → activ (activarea pachetului
  complet); activ → suspendat; suspendat → activ (reactivare); activ sau suspendat → expirat (la
  data ștergerii automate). Un eveniment neconfirmat (FR-004) sau în așteptarea activării
  (FR-019) nu expiră, ci se șterge complet. Expirarea și ștergerea trec prin etapele interne din
  001 („în expirare”, „în ștergere”), care nu sunt stări vizibile utilizatorilor. Orice altă
  tranziție TREBUIE refuzată.
- **FR-023**: Evenimentele create de administrator TREBUIE să înceapă direct în starea activ, cu
  pachetul complet, ca în 001.
- **FR-024**: Fiecare schimbare de stare TREBUIE înregistrată, fără posibilitate de modificare
  ulterioară, cu: starea anterioară și cea nouă, momentul, sursa (organizator, administrator,
  sistem automat sau sistem de plăți), autorul atunci când este o persoană și un motiv sau o
  referință externă opțională (de ex. referința unei plăți).
- **FR-025**: Activarea pachetului complet TREBUIE să poată fi declanșată de administrator și,
  într-o funcționalitate ulterioară, automat de un sistem de plăți, prin aceeași operație și cu
  aceleași efecte: starea devine activ, se aplică limitele și prețul pachetului complet,
  perioada de upload începe, iar data ștergerii se calculează după durata de păstrare a
  pachetului (001/FR-040).
- **FR-026**: Activarea TREBUIE să fie idempotentă: o a doua activare a aceluiași eveniment
  (de ex. o notificare de plată repetată) NU TREBUIE să schimbe din nou prețul sau data ștergerii
  și TREBUIE înregistrată ca atare.

**Administrare**

- **FR-027**: Administratorul TREBUIE să vadă lista evenimentelor create self-service, cu:
  numele, data, emailul organizatorului, starea, data creării, data ultimei cereri de activare
  (dacă există) și, pentru evenimentele active sau suspendate, numărul de fișiere, spațiul
  ocupat și data ștergerii, cu filtrare după stare și după „activare solicitată”.
- **FR-028**: Administratorul TREBUIE să poată activa pachetul complet și suspenda sau reactiva
  un eveniment, cu un motiv obligatoriu (1–500 de caractere). Fiecare acțiune TREBUIE să ceară
  confirmare și TREBUIE înregistrată conform FR-024, împreună cu motivul. Pentru un eveniment
  în așteptarea activării, administratorul poate modifica doar numele și data (ca
  organizatorul); prețul, limitele și perioada de upload se stabilesc la activare, din pachetul
  complet.
- **FR-028a**: Pentru un eveniment suspendat, organizatorul TREBUIE să vadă un mesaj de
  suspendare și TREBUIE să poată în continuare vizualiza, descărca (individual și arhivă) și
  șterge fișierele. Actualizarea în timp real a galeriei (001, US7) nu este disponibilă, iar
  organizatorul NU TREBUIE să poată prelungi retenția sau modifica numele și data evenimentului
  până la reactivare. Ștergerea definitivă a întregului eveniment rămâne disponibilă.
- **FR-029**: Administratorul TREBUIE să vadă istoricul stărilor fiecărui eveniment.
- **FR-030**: Crearea evenimentelor de către administrator (001/FR-001) TREBUIE să rămână
  disponibilă, iar evenimentele create astfel apar organizatorului conform FR-012.

**Comportamentul pentru invitați**

- **FR-031**: Pentru un eveniment suspendat, pagina de upload TREBUIE să afișeze un mesaj
  politicos că evenimentul nu primește momentan fișiere, fără a dezvălui motivul, și să refuze
  pe server orice upload; fișierele refuzate în timpul unei încărcări în curs TREBUIE marcate cu
  același mesaj.
- **FR-032**: Pentru un eveniment în așteptarea activării, pagina de upload TREBUIE să afișeze
  numele evenimentului și un mesaj politicos că încărcarea nu este încă deschisă, cu
  recomandarea de a reveni mai târziu sau de a lua legătura cu organizatorul.

**Modificare și ștergere de către organizator**

- **FR-033**: Organizatorul TREBUIE să poată modifica numele și data oricăruia dintre
  evenimentele sale care nu este expirat sau suspendat (FR-028a), cu aceleași validări ca la creare. Linkul public și
  codul QR NU TREBUIE să se schimbe.
- **FR-034**: Pentru evenimentele create self-service, perioada de upload TREBUIE să înceapă la
  activare și să se încheie la sfârșitul zilei următoare datei evenimentului (ora României), dar
  nu mai devreme de sfârșitul zilei următoare activării; la schimbarea datei, perioada se
  recalculează.
- **FR-035**: Organizatorul TREBUIE să poată șterge definitiv oricare dintre evenimentele sale
  (în așteptarea activării, active sau suspendate, indiferent dacă au fost create de el sau de
  administrator), după confirmare prin tastarea numelui evenimentului, cu aceleași efecte ca
  001/FR-006b. Aceasta înlocuiește restricția din 001/FR-006b („organizatorul nu poate șterge
  evenimentul”). Ștergerea TREBUIE înregistrată în istoricul evenimentului, cu sursa
  „organizator”.
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

- **FR-042**: Toate ecranele noi (pagina principală, confirmare, cod, administrare pachet și
  evenimente self-service) TREBUIE să fie în limba română, mobile-first și conforme WCAG 2.2 AA.

### Key Entities

- **Pachet**: condițiile comerciale ale unui eveniment activ: preț, număr maxim de fișiere per
  invitat, durata de păstrare inclusă. În această funcționalitate există un singur pachet
  (complet), configurabil de administrator.
- **Setări self-service**: numărul maxim de evenimente în așteptarea activării per organizator.
- **Cerere de activare**: eveniment, momentul cererii; ultima cerere se afișează organizatorului
  și administratorului. Nu este o schimbare de stare.
- **Eveniment** (extins față de 001): în plus, sursa creării (administrator sau self-service),
  stare (neconfirmat, în așteptarea activării, activ, suspendat, expirat), pachetul, prețul și
  limitele aplicate la activare (copie la momentul activării). Stările tehnice din 001 („în
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
- **SC-009**: 0 fișiere acceptate pentru evenimente în așteptarea activării sau suspendate, iar
  invitatul vede mesajul politicos, nu o eroare tehnică, în 100% din cazurile testate.
- **SC-010**: 100% dintre schimbările de stare au o intrare în istoric cu sursa și momentul; o
  activare repetată nu modifică prețul sau data ștergerii.
- **SC-011**: Administratorul activează pachetul complet pentru un eveniment în sub 1 minut,
  iar invitații pot încărca imediat după activare, cu același cod QR.
- **SC-012**: 100% dintre evenimentele create includ acceptarea termenilor, cu versiunea și
  momentul înregistrate.
- **SC-013**: 100% dintre evenimentele neactivate sunt șterse în cel mult 24 de ore după
  termenul din FR-019, iar fiecare organizator afectat a primit exact un email de avertizare.
- **SC-014**: Emailul de confirmare sau de autentificare ajunge la destinatar în cel mult 30 de
  secunde de la trimiterea formularului, în cel puțin 95% din cazurile testate.

## Assumptions

- Nu există regim de probă sau utilizare gratuită: invitații pot încărca doar după activarea
  pachetului complet (vezi Clarifications).
- Plata online nu este în scop; după cererea de activare (FR-018a), administratorul ia
  legătura cu organizatorul, încasează în afara aplicației (ca în 001) și activează evenimentul.
  Emailul către administratori merge la adresele de administrator preconfigurate (001/FR-006a).
- Valorile inițiale ale pachetului complet (modificabile de administrator) sunt cele din 001:
  preț de bază configurat de administrator, plafoanele de dimensiune per fișier (001/FR-001a),
  3 luni de păstrare incluse și catalogul de retenție pentru prelungire.
- Suspendarea este o măsură temporară; pentru abuzuri grave, administratorul folosește
  ștergerea definitivă a evenimentului (001/FR-006b).
- Textele termenilor și ale politicii de confidențialitate sunt furnizate de proprietarul
  platformei; publicarea unei versiuni noi se face printr-o versiune nouă a aplicației, nu din
  interfața de administrare.
- Adresele de email se compară fără diferențe de majuscule și fără spații la capete.
- Codul de 6 cifre, valabilitatea de 15 minute și cele 5 încercări sunt valori standard pentru
  coduri de unică folosință; valabilitatea linkului scade astfel de la 1 oră (001/FR-008) la 15
  minute.
- Autentificarea administratorului (link pe email și al doilea factor, 001/FR-006a) rămâne
  neschimbată, dar primește același tip de email (link către pagină cu buton și cod).
- Evenimentele create de administrator nu intră în limita de evenimente în așteptarea
  activării și sunt active de la creare.
- Accesul mai multor organizatori la același eveniment, autentificarea prin Google sau alți
  furnizori și plata online rămân în afara scopului.

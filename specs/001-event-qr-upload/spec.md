# Feature Specification: Bucla de bază — eveniment, cod QR, upload invitați, galerie organizator

**Feature Branch**: `001-event-qr-upload`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Bucla de bază a aplicației: eveniment, cod QR, upload invitați, galerie
organizator. Administratorul creează evenimentele pentru clienți (fără înregistrare self-service și
fără plăți); invitații anonimi scanează un cod QR și încarcă poze/video; organizatorul se
autentifică prin link pe email, vede, descarcă și șterge fișierele. În afara scopului: ecranul
live, moderarea, ștergerea automată la expirare, plățile, brandingul personalizat."

## Clarifications

### Session 2026-09-23

- Q: Poate administratorul vizualiza și descărca fișierele invitaților? → A: Nu; accesul la
  conținutul media este exclusiv al organizatorului, administratorul vede doar statistici
  agregate (număr de fișiere, spațiu ocupat).
- Q: Câți organizatori poate avea un eveniment? → A: Exact o adresă de email per eveniment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administratorul creează un eveniment și obține codul QR (Priority: P1)

Administratorul platformei introduce datele unui eveniment vândut unui client: nume, dată,
adresa de email a organizatorului, perioada în care uploadul este permis și limitele (număr
maxim de fișiere per invitat, dimensiune maximă per fișier). După salvare, primește linkul
public de upload și poate descărca codul QR la rezoluție de tipar, în format PNG și SVG.

**Why this priority**: fără un eveniment și un cod QR nu există niciun punct de intrare pentru
invitați sau organizator; este fundamentul întregii bucle.

**Independent Test**: administratorul creează un eveniment, descarcă PNG-ul și SVG-ul, iar
scanarea codului tipărit cu un telefon deschide pagina de upload a acelui eveniment.

**Acceptance Scenarios**:

1. **Given** administratorul este autentificat, **When** completează toate câmpurile obligatorii
   și salvează, **Then** evenimentul este creat și i se afișează linkul public de upload și
   opțiunile de descărcare a codului QR.
2. **Given** un eveniment creat, **When** administratorul descarcă codul QR, **Then** primește
   un fișier PNG de cel puțin 2000×2000 px și un fișier SVG, ambele codificând linkul de upload.
3. **Given** formularul de creare, **When** administratorul introduce un email invalid, o
   perioadă de upload în care sfârșitul precede începutul sau limite nepozitive, **Then**
   salvarea este refuzată, cu mesaj explicit lângă câmpul greșit.
4. **Given** două evenimente create, **When** se compară linkurile lor de upload, **Then**
   niciunul nu poate fi dedus din celălalt.
5. **Given** un eveniment cu fișiere încărcate, **When** administratorul îl deschide, **Then**
   vede doar numărul de fișiere și spațiul ocupat, fără acces la conținutul fișierelor.

---

### User Story 2 - Invitatul încarcă poze și video de pe telefon (Priority: P1)

Invitatul scanează codul QR și ajunge direct pe pagina de upload a evenimentului, fără cont și
fără instalarea vreunei aplicații. Opțional își scrie numele. Selectează mai multe poze și
video din galeria telefonului sau face o poză pe loc, vede progresul fiecărui fișier și
primește confirmare când totul s-a încărcat. Dacă evenimentul nu a început, s-a încheiat sau a
atins limita, primește un mesaj clar în loc de o eroare.

**Why this priority**: colectarea amintirilor de la invitați este valoarea principală a
produsului; fără această poveste organizatorul nu are ce vedea.

**Independent Test**: pe un telefon, se scanează codul QR al unui eveniment activ, se încarcă
trei poze și un video, iar fișierele apar ca primite pentru acel eveniment.

**Acceptance Scenarios**:

1. **Given** un eveniment aflat în perioada de upload, **When** invitatul scanează codul QR,
   **Then** pagina de upload a evenimentului se deschide direct, cu numele evenimentului, fără
   cerere de autentificare.
2. **Given** pagina de upload, **When** invitatul selectează mai multe fișiere din galerie,
   **Then** fiecare fișier are propriul indicator de progres, iar la final se afișează o
   confirmare cu numărul de fișiere încărcate.
3. **Given** pagina de upload pe telefon, **When** invitatul alege să facă o poză, **Then** se
   deschide camera telefonului, iar poza făcută intră în lista de upload.
4. **Given** invitatul a completat numele, **When** încarcă fișiere, **Then** fișierele sunt
   asociate cu numele respectiv; **Given** câmpul gol, **Then** uploadul funcționează la fel.
5. **Given** un eveniment a cărui perioadă de upload nu a început sau s-a încheiat, **When**
   invitatul deschide linkul, **Then** vede un mesaj clar în română care explică situația și,
   dacă e cazul, când se deschide uploadul.
6. **Given** invitatul a atins numărul maxim de fișiere permis, **When** încearcă să mai
   adauge, **Then** fișierele în plus sunt refuzate, cu mesaj care arată limita.
7. **Given** un fișier care depășește dimensiunea maximă sau are un tip nepermis, **When** este
   selectat, **Then** este respins cu mesaj explicit, iar celelalte fișiere continuă să se
   încarce.
8. **Given** pagina de upload, **When** invitatul o folosește, **Then** nu vede în niciun
   moment fișierele încărcate de alți invitați.

---

### User Story 3 - Organizatorul se autentifică și vede galeria evenimentului (Priority: P1)

Organizatorul primește pe email un link de autentificare fără parolă și vede doar evenimentele
sale. Pentru fiecare eveniment are o galerie cu miniaturi, ordonate cronologic, cu numele
invitatului (dacă a fost completat). Poate deschide orice fișier la dimensiune completă,
inclusiv video și poze făcute cu iPhone în format HEIC.

**Why this priority**: organizatorul este clientul plătitor; accesul la amintiri închide
bucla de valoare.

**Independent Test**: se creează două evenimente pentru organizatori diferiți, se încarcă
fișiere în fiecare; primul organizator se autentifică prin link și vede doar evenimentul său
și fișierele acestuia.

**Acceptance Scenarios**:

1. **Given** o adresă de email asociată unui eveniment, **When** organizatorul cere
   autentificarea, **Then** primește pe email un link de autentificare de unică folosință, cu
   expirare.
2. **Given** organizatorul autentificat, **When** deschide lista de evenimente, **Then** vede
   doar evenimentele asociate adresei sale de email.
3. **Given** un eveniment cu fișiere, **When** organizatorul deschide galeria, **Then** vede
   miniaturile ordonate cronologic după momentul încărcării, fiecare cu numele invitatului
   când acesta există.
4. **Given** o poză HEIC încărcată de pe iPhone, **When** organizatorul o deschide, **Then** o
   vede corect în browser, la dimensiune completă.
5. **Given** un video încărcat, **When** organizatorul îl deschide, **Then** îl poate reda în
   browser.
6. **Given** organizatorul A, **When** încearcă să acceseze prin link direct evenimentul sau
   fișierele organizatorului B, **Then** accesul este refuzat.

---

### User Story 4 - Organizatorul descarcă fișierele (Priority: P2)

Organizatorul descarcă un fișier individual sau toate fișierele evenimentului într-o singură
arhivă, la calitatea originală.

**Why this priority**: păstrarea amintirilor în afara platformei este un motiv principal de
cumpărare, dar poate urma imediat după vizualizare.

**Independent Test**: organizatorul descarcă arhiva unui eveniment cu 50 de fișiere și verifică
faptul că arhiva conține toate cele 50 de fișiere, la calitatea originală.

**Acceptance Scenarios**:

1. **Given** un fișier în galerie, **When** organizatorul îl descarcă, **Then** primește
   fișierul la calitatea originală, fără metadate de localizare.
2. **Given** un eveniment cu fișiere, **When** organizatorul cere descărcarea tuturor, **Then**
   primește o singură arhivă cu toate fișierele existente în acel moment, cu nume de fișiere
   unice și ușor de identificat.
3. **Given** un eveniment fără fișiere, **When** organizatorul deschide galeria, **Then**
   opțiunea de descărcare în masă este indisponibilă, cu un mesaj explicativ.

---

### User Story 5 - Organizatorul șterge fișiere (Priority: P2)

Organizatorul selectează unul sau mai multe fișiere și le șterge; fișierele șterse dispar
definitiv.

**Why this priority**: organizatorul trebuie să poată elimina conținut nedorit, iar ștergerea
definitivă este o cerință de confidențialitate.

**Independent Test**: organizatorul șterge 3 fișiere din 10; acestea nu mai apar în galerie,
nu mai pot fi descărcate și nu apar în arhivă, iar vechile lor linkuri nu mai funcționează.

**Acceptance Scenarios**:

1. **Given** galeria, **When** organizatorul selectează mai multe fișiere și cere ștergerea,
   **Then** i se cere confirmarea, cu numărul de fișiere și avertismentul că ștergerea este
   ireversibilă.
2. **Given** ștergerea confirmată, **When** se finalizează, **Then** fișierele (originalul și
   orice versiune derivată, ca miniaturi) nu mai sunt accesibile pe nicio cale, inclusiv prin
   linkuri obținute anterior.
3. **Given** un fișier șters, **When** organizatorul descarcă arhiva evenimentului, **Then**
   fișierul nu este inclus.

---

### User Story 6 - Uploadul se reia după întreruperi (Priority: P2)

Un invitat cu semnal slab începe un upload; dacă acesta se întrerupe, se reia fără ca
invitatul să aleagă din nou fișierele.

**Why this priority**: la evenimente (săli, restaurante, exterior) semnalul este deseori slab;
fără reluare, multe uploaduri s-ar pierde.

**Independent Test**: se pornește uploadul unui video mare, se taie conexiunea la jumătate și se
restabilește; uploadul continuă de unde a rămas și se finalizează fără intervenția invitatului.

**Acceptance Scenarios**:

1. **Given** un upload în curs, **When** conexiunea cade și revine în timp ce pagina e deschisă,
   **Then** uploadul continuă automat de unde a rămas, fără a retrimite partea deja transferată.
2. **Given** conexiunea este întreruptă, **When** invitatul se uită la ecran, **Then** vede că
   uploadul este în pauză din cauza rețelei și că se va relua automat.
3. **Given** un fișier care nu poate fi finalizat după reîncercări repetate, **When** acestea
   eșuează, **Then** invitatul vede ce fișier a eșuat și are o opțiune de reîncercare manuală
   pentru acel fișier.

---

### User Story 7 - Galeria se actualizează în timpul evenimentului (Priority: P3)

Organizatorul, cu galeria deschisă, vede fișierele noi apărând în timp ce evenimentul are loc,
fără să reîncarce pagina.

**Why this priority**: îmbunătățește experiența organizatorului, dar galeria rămâne utilă și
cu reîncărcare manuală.

**Independent Test**: cu galeria deschisă pe un laptop, un invitat încarcă o poză de pe telefon;
poza apare în galerie fără reîncărcarea paginii.

**Acceptance Scenarios**:

1. **Given** galeria deschisă, **When** un invitat finalizează încărcarea unei poze, **Then**
   poza apare în galerie în cel mult 10 secunde, în poziția cronologică corectă.
2. **Given** un video încă în procesare, **When** apare în galerie, **Then** este marcat vizibil
   ca „în procesare” și devine redabil automat la finalizare.
3. **Given** conexiunea organizatorului s-a întrerupt temporar, **When** revine, **Then** galeria
   afișează și fișierele încărcate în timpul întreruperii, fără duplicate.

---

### Edge Cases

- Invitatul închide pagina sau browserul în timpul uploadului: fișierele deja finalizate rămân
  încărcate; cele neterminate se pierd, iar la redeschiderea paginii invitatul vede câte fișiere
  a încărcat deja.
- Perioada de upload se încheie în timp ce un invitat are un upload în curs: fișierele începute
  înainte de închiderea perioadei se pot finaliza într-o marjă de grație de 15 minute.
- Același invitat trimite de două ori același fișier: ambele copii sunt acceptate și contează la
  limită (deduplicarea nu este în scop).
- Numele invitatului conține caractere speciale, emoji sau este foarte lung: se acceptă diacritice
  și emoji, lungime maximă 50 de caractere, fără interpretarea conținutului ca markup.
- Se accesează un link de upload inexistent sau modificat: se afișează un mesaj generic că
  evenimentul nu a fost găsit, fără a dezvălui dacă alte evenimente există.
- Linkul de autentificare al organizatorului a expirat sau a fost deja folosit: organizatorul
  vede un mesaj clar și poate cere un link nou.
- O adresă de email fără niciun eveniment asociat cere autentificarea: răspunsul afișat este
  identic cu cel pentru o adresă validă, pentru a nu dezvălui ce adrese sunt clienți.
- Un fișier este corupt sau nu poate fi procesat: originalul rămâne descărcabil, iar în galerie
  apare o miniatură generică cu mențiunea că previzualizarea nu este disponibilă.
- Organizatorul șterge un fișier în timp ce generează arhiva: arhiva reflectă starea din momentul
  cererii; fișierul șters nu mai este accesibil ulterior.
- Un număr mare de invitați încarcă simultan la începutul petrecerii: uploadurile continuă fără
  erori pentru volumul definit în criteriile de succes.

## Requirements *(mandatory)*

### Functional Requirements

**Administrare evenimente**

- **FR-001**: Sistemul TREBUIE să permită administratorului să creeze un eveniment cu: nume,
  dată, adresa de email a organizatorului, începutul și sfârșitul perioadei de upload, numărul
  maxim de fișiere per invitat și dimensiunea maximă per fișier.
- **FR-002**: Sistemul TREBUIE să valideze datele evenimentului (email valid, sfârșitul perioadei
  după început, limite pozitive) și să refuze salvarea datelor invalide cu mesaje explicite.
- **FR-003**: Sistemul TREBUIE să permită administratorului să vadă lista evenimentelor și să
  modifice datele unui eveniment existent, inclusiv perioada de upload și limitele.
- **FR-004**: Sistemul TREBUIE să genereze pentru fiecare eveniment un link public de upload
  care conține un identificator aleator, imposibil de ghicit sau de derivat din linkul altui
  eveniment.
- **FR-005**: Sistemul TREBUIE să ofere codul QR al linkului de upload pentru descărcare în
  format PNG (minim 2000×2000 px) și SVG.
- **FR-006**: Doar administratorul TREBUIE să poată crea sau modifica evenimente; nu există
  înregistrare self-service.
- **FR-007**: Accesul la conținutul fișierelor media (vizualizare, descărcare) TREBUIE să fie
  rezervat exclusiv organizatorului evenimentului. Administratorul NU TREBUIE să poată vedea sau
  descărca fișierele; vede doar statistici agregate per eveniment (număr de fișiere, spațiu
  ocupat).

**Autentificarea organizatorului**

- **FR-008**: Sistemul TREBUIE să permită organizatorului să se autentifice fără parolă, prin
  link trimis pe email, de unică folosință și cu expirare după cel mult 1 oră.
- **FR-009**: Sistemul TREBUIE să afișeze organizatorului autentificat doar evenimentele asociate
  adresei sale de email și să refuze orice acces la evenimentele altor organizatori.
- **FR-010**: Fiecare eveniment TREBUIE să aibă exact o adresă de email de organizator; aceeași
  adresă poate fi asociată mai multor evenimente.

**Upload invitați**

- **FR-011**: Invitații TREBUIE să poată accesa pagina de upload direct din codul QR sau din
  link, fără cont, autentificare sau instalarea vreunei aplicații.
- **FR-012**: Pagina de upload TREBUIE să afișeze numele evenimentului, un câmp opțional pentru
  numele invitatului și o notă de informare vizibilă privind prelucrarea datelor personale.
- **FR-013**: Invitații TREBUIE să poată selecta mai multe fișiere simultan din galeria
  telefonului și să poată face o poză direct din pagină.
- **FR-014**: Sistemul TREBUIE să accepte poze (JPEG, PNG, HEIC/HEIF, WebP) și video (MP4, MOV)
  și să respingă orice alt tip de fișier.
- **FR-015**: Sistemul TREBUIE să afișeze progresul individual al fișierelor și o confirmare
  finală cu numărul de fișiere încărcate cu succes și cel al celor eșuate.
- **FR-016**: Uploadurile întrerupte TREBUIE să se reia automat, de unde au rămas, la revenirea
  conexiunii, fără ca invitatul să aleagă din nou fișierele, cât timp pagina rămâne deschisă.
- **FR-017**: Sistemul TREBUIE să verifice pe server, pentru fiecare fișier, tipul, dimensiunea
  maximă și limita de fișiere per invitat, indiferent de verificările făcute pe dispozitivul
  invitatului.
- **FR-018**: Sistemul TREBUIE să identifice invitatul, în scopul limitei de fișiere, la nivel
  de dispozitiv/browser, fără a-i cere date personale.
- **FR-019**: Sistemul TREBUIE să limiteze frecvența uploadurilor pentru a preveni abuzul, fără
  a afecta un invitat care încarcă în mod normal până la limita sa.
- **FR-020**: Sistemul TREBUIE să afișeze mesaje clare, în română, când evenimentul nu a început
  (cu data deschiderii), s-a încheiat, limita de fișiere a fost atinsă, un fișier este prea mare
  sau are tip nepermis, ori linkul nu corespunde unui eveniment.
- **FR-021**: Sistemul TREBUIE să permită finalizarea uploadurilor începute înainte de sfârșitul
  perioadei de upload, într-o marjă de grație de 15 minute.
- **FR-022**: Invitații NU TREBUIE să poată vedea, lista sau descărca fișierele încărcate de alți
  invitați.

**Procesare media**

- **FR-023**: Sistemul TREBUIE să elimine metadatele de localizare (inclusiv GPS) din toate
  fișierele puse la dispoziție organizatorului, atât la vizualizare, cât și la descărcare.
- **FR-024**: Sistemul TREBUIE să facă pozele HEIC vizualizabile în browserele moderne, păstrând
  totodată fișierul original pentru descărcare.
- **FR-025**: Sistemul TREBUIE să genereze miniaturi pentru poze și video.
- **FR-026**: Procesarea video TREBUIE să nu întârzie confirmarea uploadului pentru invitat;
  videourile în curs de procesare apar în galerie cu starea „în procesare”.

**Galerie organizator**

- **FR-027**: Sistemul TREBUIE să afișeze organizatorului toate fișierele unui eveniment ca
  miniaturi, ordonate cronologic după momentul încărcării, cu numele invitatului dacă există.
- **FR-028**: Organizatorul TREBUIE să poată deschide orice fișier la dimensiune completă și să
  redea videourile în browser.
- **FR-029**: Organizatorul TREBUIE să poată descărca un fișier individual la calitatea
  originală.
- **FR-030**: Organizatorul TREBUIE să poată descărca toate fișierele evenimentului într-o
  singură arhivă, la calitatea originală.
- **FR-031**: Organizatorul TREBUIE să poată selecta unul sau mai multe fișiere și să le șteargă,
  după o confirmare explicită.
- **FR-032**: Ștergerea TREBUIE să fie definitivă: originalul și toate versiunile derivate devin
  inaccesibile pe orice cale, inclusiv prin linkuri emise anterior.
- **FR-033**: Galeria TREBUIE să afișeze fișierele noi fără reîncărcarea paginii și să recupereze,
  după o întrerupere de conexiune, fișierele apărute între timp, fără duplicate.
- **FR-034**: Accesul la fișiere (vizualizare și descărcare) TREBUIE să se facă prin linkuri
  temporare, care expiră și nu pot fi folosite de persoane neautorizate după expirare.

**Transversale**

- **FR-035**: Întreaga interfață TREBUIE să fie în limba română, cu texte organizate astfel încât
  adăugarea limbii engleze să nu necesite modificarea ecranelor.
- **FR-036**: Pagina de upload TREBUIE să poată fi folosită cu o singură mână pe telefon:
  acțiunile principale se află în zona inferioară a ecranului, iar țintele tactile au cel puțin
  44×44 px.
- **FR-037**: Toate ecranele TREBUIE să respecte nivelul de accesibilitate WCAG 2.2 AA.

### Key Entities

- **Eveniment**: evenimentul privat al unui client. Atribute: nume, dată, email-ul
  organizatorului (unic per eveniment), început și sfârșit al perioadei de upload, număr maxim de fișiere per invitat,
  dimensiune maximă per fișier, identificator public aleator (pentru link și QR), data creării.
- **Organizator**: clientul care a cumpărat serviciul, identificat prin adresa de email; are
  acces la unul sau mai multe evenimente.
- **Administrator**: proprietarul platformei; creează și gestionează evenimentele.
- **Sesiune invitat**: identitatea anonimă a unui dispozitiv/browser într-un eveniment. Atribute:
  nume opțional, număr de fișiere încărcate; folosită pentru aplicarea limitei.
- **Fișier media**: o poză sau un video încărcat. Atribute: eveniment, sesiune invitat (și numele
  afișat), tip, dimensiune, momentul încărcării, starea procesării (în curs, gata, eșuată),
  referințe către original, versiunea vizualizabilă și miniatură.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administratorul creează un eveniment complet și descarcă codul QR în sub 3 minute.
- **SC-002**: Pe o conexiune mobilă 4G, pagina de upload devine vizibilă și utilizabilă în sub
  2,5 secunde de la scanarea codului QR.
- **SC-003**: Un invitat aflat pentru prima oară pe pagină încarcă primele poze în sub 60 de
  secunde de la scanare, fără ajutor.
- **SC-004**: Cel puțin 95% dintre invitații care încep un upload îl finalizează cu succes.
- **SC-005**: Un upload întrerupt de o cădere de rețea de până la 2 minute se finalizează automat,
  fără retrimiterea părții deja transferate, în 100% din cazurile testate.
- **SC-006**: Sistemul susține cel puțin 200 de invitați care încarcă simultan la același
  eveniment, fără erori și fără degradarea vizibilă a timpilor de încărcare ai paginii.
- **SC-007**: O poză nou încărcată apare în galeria deschisă a organizatorului în cel mult 10
  secunde de la finalizarea uploadului.
- **SC-008**: 100% dintre pozele HEIC încărcate pot fi vizualizate în galeria organizatorului în
  browserele moderne de pe desktop și mobil.
- **SC-009**: 0 fișiere puse la dispoziție organizatorului conțin metadate de localizare.
- **SC-010**: Descărcarea unei arhive pentru un eveniment cu 1.000 de fișiere începe în sub 10
  secunde de la cerere și conține toate fișierele, la calitatea originală.
- **SC-011**: După ștergere, 0% dintre fișierele șterse mai pot fi accesate prin orice link emis
  anterior.
- **SC-012**: În testele de acces, 0 cazuri în care un invitat vede fișierele altor invitați sau
  un organizator vede evenimentele altui organizator sau administratorul accesează conținutul
  fișierelor media.

## Assumptions

- Administratorul este un singur rol intern, cu acces creat manual; interfața de administrare nu
  necesită gestionarea mai multor administratori în MVP.
- Organizatorul nu poate modifica datele evenimentului; modificările se fac de administrator.
- Dacă mai multe persoane (ex. ambii miri) vor acces, folosesc aceeași adresă de email sau
  organizatorul le transmite arhiva descărcată; accesul multi-organizator nu este în scop.
- Suportul pentru probleme legate de fișiere concrete se face cu organizatorul, fără ca
  administratorul să vadă conținutul media.
- Emailul de autentificare se trimite organizatorului când acesta îl cere din pagina de
  autentificare; notificarea automată la crearea evenimentului nu este în scop.
- Limita de fișiere per invitat se aplică per dispozitiv/browser; un invitat care șterge datele
  browserului sau folosește alt dispozitiv poate depăși practic limita — acceptabil pentru MVP.
- Invitatul își vede doar propriile uploaduri din sesiunea curentă și nu își poate șterge
  fișierele după încărcare; ștergerea este rezervată organizatorului.
- Pentru video, limita relevantă este dimensiunea maximă per fișier; nu se impune o durată
  maximă separată.
- Ordinea cronologică din galerie se bazează pe momentul încărcării, nu pe data din metadatele
  fișierului.
- Ștergerea automată la expirare, ecranul live, moderarea, plățile și brandingul personalizat
  sunt în afara acestei funcționalități; până la implementarea ștergerii automate, fișierele se
  păstrează până la ștergerea manuală.
- Datele sunt găzduite în UE, conform constituției proiectului.

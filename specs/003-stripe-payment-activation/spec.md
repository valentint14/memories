# Feature Specification: Activarea evenimentului prin plată online (Stripe)

**Feature Branch**: `003-stripe-payment-activation`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Vreau sa integrez Stripe ca si procesator de plati. Clientul nu mai are nevoie de a cere activarea evenimentului din partea administratorului, ci isi activeaza singur evenimentul facand plata. Pe scurt, activarea evenimentului este inlocuita de plata propriu-zisa."

## Clarifications

### Session 2026-10-01

- Q: Prelungirea perioadei de păstrare (001/FR-041) se plătește tot prin Stripe? → A: Da;
  organizatorul plătește diferența de preț, iar noua opțiune și noua dată de ștergere se aplică
  doar după confirmarea plății.
- Q: Ce document primește organizatorul pentru plată? → A: Doar chitanța trimisă de procesator;
  factura fiscală o emite proprietarul platformei, în afara aplicației.
- Q: Ce date de facturare trebuie să ceară pagina de plată? → A: Nume și adresă de facturare
  obligatorii, plus câmp opțional „Firmă și CUI” pentru persoane juridice.
- Q: La plata activării, organizatorul poate alege direct o perioadă de păstrare mai lungă? →
  A: Da; alege opțiunea de păstrare la plată (implicit cea inclusă) și plătește prețul final
  total o dată.
- Q: Ce se întâmplă cu un eveniment activ dacă plata este contestată la bancă? → A: Evenimentul
  se suspendă automat (fișierele rămân, încărcările se opresc), administratorii primesc un email,
  iar reactivarea este manuală.

## Context

În 002, un eveniment creat self-service rămâne „în așteptarea activării” până când
organizatorul apasă „Solicită activarea”, administratorul încasează în afara aplicației și
activează manual pachetul complet (002/FR-018, FR-018a, FR-025, FR-028). 002 a pregătit deja
activarea automată de către un sistem de plăți: aceeași operație de activare, idempotentă, cu
sursa „sistem de plăți” și referința plății în istoric (002/FR-024–FR-026).

Această funcționalitate înlocuiește cererea de activare cu plata online: organizatorul plătește
pachetul complet cu cardul, iar evenimentul devine activ automat, fără intervenția
administratorului.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizatorul plătește și evenimentul devine activ (Priority: P1)

Organizatorul își deschide evenimentul aflat în așteptarea activării. Vede prețul pachetului
complet și ce include, alege perioada de păstrare (implicit cea inclusă în pachet), apasă
„Plătește și activează”, ajunge pe pagina securizată de plată a
procesatorului, plătește cu cardul și revine în aplicație. Evenimentul este activ: invitații pot
încărca poze, iar data ștergerii fișierelor este calculată după perioada de păstrare aleasă.

**Why this priority**: este fluxul care aduce venit și elimină așteptarea după administrator;
fără el, funcționalitatea nu există.

**Independent Test**: se creează un eveniment self-service, se plătește cu un card de test al
procesatorului, iar evenimentul apare activ, cu prețul plătit, perioada de upload și data
ștergerii după perioada de păstrare aleasă, fără nicio acțiune a administratorului.

**Acceptance Scenarios**:

1. **Given** un eveniment în așteptarea activării, **When** organizatorul deschide pagina
   evenimentului, **Then** vede prețul curent al pachetului complet, ce include (durata de
   păstrare, limita de fișiere per invitat), opțiunile de păstrare active cu prețul final și
   data ștergerii pentru fiecare (implicit cea inclusă) și butonul „Plătește și activează”, în
   locul butonului „Solicită activarea”.
2. **Given** organizatorul alege o opțiune de păstrare mai lungă, **When** apasă „Plătește și
   activează”, **Then** suma de plată este prețul final al opțiunii alese (pachet + supliment),
   iar după confirmarea plății evenimentul are opțiunea aleasă și data ștergerii ei.
3. **Given** organizatorul a apăsat „Plătește și activează”, **When** ajunge pe pagina de plată,
   **Then** vede numele evenimentului, suma în lei și numele platformei, iar datele cardului se
   introduc doar pe pagina procesatorului, nu în aplicație.
4. **Given** plata a reușit, **When** procesatorul confirmă plata, **Then** evenimentul devine
   activ cu prețul plătit, perioada de upload începe, data ștergerii se calculează după
   perioada de păstrare aleasă, iar istoricul arată sursa „sistem de plăți” și referința plății.
5. **Given** plata a reușit, **When** organizatorul revine în aplicație, **Then** vede
   evenimentul activ sau, dacă confirmarea procesatorului nu a sosit încă, mesajul că plata se
   confirmă, înlocuit automat cu starea activă imediat ce sosește confirmarea.
6. **Given** evenimentul a fost activat prin plată, **When** organizatorul își verifică emailul,
   **Then** primește în română confirmarea plății (sumă, dată, eveniment) și anunțul că
   invitații pot încărca.

---

### User Story 2 - Plata eșuată sau abandonată nu blochează evenimentul (Priority: P1)

Organizatorul poate închide pagina de plată, poate avea cardul refuzat sau poate reveni fără să
plătească. Evenimentul rămâne în așteptarea activării, iar organizatorul poate încerca din nou
oricând înainte de ștergerea automată.

**Why this priority**: plățile eșuate sunt frecvente; organizatorul trebuie să poată reîncerca
fără ajutor și fără să piardă evenimentul sau să plătească de două ori.

**Independent Test**: se refuză plata cu un card de test respins, apoi se abandonează o plată;
evenimentul rămâne în așteptarea activării, iar o a treia încercare cu un card valid îl
activează.

**Acceptance Scenarios**:

1. **Given** cardul este refuzat, **When** organizatorul revine în aplicație, **Then**
   evenimentul este tot în așteptarea activării și pagina îi arată că plata nu a reușit și că
   poate încerca din nou.
2. **Given** organizatorul a închis pagina de plată fără să plătească, **When** revine la
   eveniment, **Then** butonul „Plătește și activează” este din nou disponibil și nicio sumă nu
   a fost încasată.
3. **Given** există deja o plată începută și neterminată, **When** organizatorul apasă din nou
   „Plătește și activează”, **Then** nu poate rezulta o dublă încasare pentru același eveniment.

---

### User Story 3 - Administratorul vede plățile și păstrează controlul (Priority: P2)

Administratorul nu mai primește cereri de activare. În registrul evenimentelor vede care
evenimente au fost plătite, suma, data și referința plății, și poate în continuare să activeze
manual un eveniment (de exemplu, pentru o plată făcută prin transfer bancar) sau să îl suspende.

**Why this priority**: platforma rămâne administrabilă și auditabilă, dar fluxul principal nu mai
depinde de administrator.

**Independent Test**: după o plată de test, evenimentul apare în registru ca activ, cu plata
vizibilă în fișa lui; un alt eveniment se activează manual, cu sursa „administrator”.

**Acceptance Scenarios**:

1. **Given** un eveniment activat prin plată, **When** administratorul îi deschide fișa, **Then**
   vede suma plătită, moneda, momentul și referința plății, iar istoricul stărilor arată sursa
   „sistem de plăți”.
2. **Given** un eveniment în așteptarea activării, **When** administratorul îl activează
   manual, **Then** evenimentul devine activ cu sursa „administrator”, fără plată în aplicație.
3. **Given** noua funcționalitate este activă, **When** administratorul deschide registrul,
   **Then** nu mai există grupa „cer activare”, iar evenimentele plătite apar la „active”.

---

### User Story 4 - Prelungirea păstrării se plătește tot online (Priority: P3)

Organizatorul unui eveniment activ alege o opțiune de păstrare mai lungă, vede diferența de
preț și noua dată de ștergere, plătește diferența pe pagina procesatorului, iar noua opțiune se
aplică după confirmarea plății.

**Why this priority**: prelungirea aduce venit suplimentar, dar este mai rară decât activarea și
poate urma după ce plata activării funcționează.

**Independent Test**: pentru un eveniment activ, organizatorul alege o opțiune de păstrare mai
lungă, plătește diferența, iar noua dată de ștergere se aplică doar după confirmarea plății.

**Acceptance Scenarios**:

1. **Given** un eveniment activ, **When** organizatorul alege o opțiune mai lungă și plătește
   diferența de preț, **Then** noua opțiune și noua dată de ștergere se aplică după confirmarea
   plății, iar schimbarea apare în istoricul prețului și al păstrării cu referința plății.
2. **Given** plata prelungirii eșuează, **When** organizatorul revine, **Then** opțiunea și data
   ștergerii rămân cele de dinainte.

---

### Edge Cases

- **Confirmare întârziată**: organizatorul revine din pagina de plată înainte ca procesatorul să
  confirme plata; pagina arată „plata se confirmă” și se actualizează singură, fără dublă
  activare.
- **Confirmare repetată**: procesatorul trimite de mai multe ori aceeași confirmare; evenimentul
  se activează o singură dată, iar repetările se înregistrează ca atare (002/FR-026).
- **Preț schimbat între timp**: administratorul modifică prețul pachetului sau suplimentul unei
  opțiuni de păstrare ori dezactivează opțiunea după ce organizatorul a început plata; se aplică
  opțiunea și prețul afișate și plătite la începerea plății.
- **Plată pentru un eveniment care nu mai e în așteptare**: evenimentul a fost între timp
  activat manual, suspendat sau șters (inclusiv ștergerea automată de la 002/FR-019); plata
  nu schimbă starea, iar administratorul este anunțat să o ramburseze.
- **Două plăți reușite** pentru același eveniment (de ex. din două ferestre): evenimentul se
  activează o singură dată, iar a doua plată este semnalată administratorului pentru rambursare.
- **Ștergere automată iminentă**: o plată începută trebuie să expire înainte de ștergerea
  automată a evenimentului; după ștergere nu se mai poate începe o plată.
- **Rambursare**: o rambursare făcută de administrator din contul procesatorului nu schimbă
  automat starea evenimentului; administratorul decide separat dacă îl suspendă.
- **Plată contestată** (organizatorul cere banii înapoi prin bancă): un eveniment activ se
  suspendă automat, iar administratorii sunt anunțați; un eveniment deja suspendat, expirat sau
  șters rămâne neschimbat, iar administratorii sunt anunțați la fel. Contestarea plății unei
  prelungiri are același efect.
- **Procesatorul indisponibil**: pagina de plată nu se poate deschide; organizatorul vede un
  mesaj clar că poate încerca mai târziu, iar evenimentul rămâne neschimbat.
- **Eveniment creat de administrator**: este activ de la creare (002/FR-023) și nu cere plată.

## Requirements *(mandatory)*

### Functional Requirements

**Plata activării**

- **FR-001**: Pagina unui eveniment în așteptarea activării TREBUIE să afișeze starea, prețul
  curent al pachetului complet, ce include (durata de păstrare, limita de fișiere per invitat),
  alegerea perioadei de păstrare dintre opțiunile active ale catalogului (001/FR-038), cu
  prețul final și data ștergerii pentru fiecare, preselectată fiind opțiunea inclusă în pachet,
  și un buton „Plătește și activează”, care înlocuiește „Solicită activarea” (002/FR-018,
  FR-018a).
- **FR-002**: La apăsarea butonului, sistemul TREBUIE să deschidă o plată la procesatorul de
  plăți pentru prețul final al opțiunii alese (prețul pachetului complet plus suplimentul
  opțiunii, 001/FR-039), în lei, cu numele evenimentului, opțiunea aleasă și numele platformei
  vizibile pe pagina de plată. Opțiunea și prețul afișate la începerea plății sunt cele încasate
  și aplicate la activare.
- **FR-003**: Datele cardului TREBUIE introduse și prelucrate exclusiv pe pagina
  procesatorului; aplicația NU TREBUIE să primească, să afișeze sau să stocheze numere de card
  sau alte date de card.
- **FR-004**: Evenimentul TREBUIE activat doar pe baza confirmării plății primite direct de la
  procesator și verificate ca autentică; revenirea organizatorului în aplicație, singură, NU
  TREBUIE să activeze evenimentul.
- **FR-005**: Activarea prin plată TREBUIE să folosească aceeași operație de activare ca
  administratorul, cu aceleași efecte (002/FR-025): starea devine activ, se aplică limitele și
  prețul plătit, perioada de upload începe, iar data ștergerii se calculează după perioada de
  păstrare aleasă la plată (001/FR-040). Istoricul TREBUIE să înregistreze sursa „sistem de plăți” și referința
  plății (002/FR-024).
- **FR-006**: Activarea prin plată TREBUIE să fie idempotentă: aceeași confirmare primită de mai
  multe ori NU TREBUIE să activeze din nou evenimentul sau să schimbe prețul ori data ștergerii
  (002/FR-026).
- **FR-007**: Sistemul NU TREBUIE să permită două plăți în desfășurare pentru același eveniment;
  o nouă apăsare pe „Plătește și activează” reia plata începută, dacă aceasta mai este valabilă,
  sau o înlocuiește pe cea expirată.
- **FR-008**: O plată începută TREBUIE să expire automat dacă nu este finalizată în cel mult 24
  de ore și, în orice caz, înainte de ștergerea automată a evenimentului (002/FR-019).
- **FR-009**: După revenirea din pagina de plată, organizatorul TREBUIE să vadă una dintre
  stările: „activ”, „plata se confirmă” (actualizată automat, fără reîncărcarea paginii) sau
  „plata nu a reușit, poți încerca din nou”.
- **FR-010**: După activarea prin plată, organizatorul TREBUIE să primească un email în română
  cu suma, data plății, numele evenimentului și anunțul că invitații pot încărca.
- **FR-011**: Dacă o plată reușită sosește pentru un eveniment care nu mai este în așteptarea
  activării (activat, suspendat, șters) sau este a doua plată reușită pentru același eveniment,
  sistemul NU TREBUIE să schimbe starea evenimentului și TREBUIE să anunțe administratorii
  printr-un email în română, pentru rambursare.
- **FR-012a**: Pagina de plată TREBUIE să ceară numele și adresa de facturare (obligatorii) și să
  ofere un câmp opțional pentru firmă și CUI, pentru persoanele juridice. Aceste date TREBUIE
  vizibile administratorului la plata respectivă (FR-013), pentru emiterea facturii.
- **FR-012**: După fiecare plată reușită, organizatorul TREBUIE să primească chitanța trimisă de
  procesator. Aplicația NU emite facturi fiscale; ele sunt emise de proprietarul platformei, în
  afara aplicației, pe baza plăților vizibile administratorului (FR-013).

**Administrare**

- **FR-013**: Administratorul TREBUIE să vadă, pentru fiecare eveniment, plățile asociate:
  suma, moneda, momentul, starea (reușită, eșuată, expirată, de rambursat), referința plății
  la procesator și datele de facturare (nume, adresă, firmă și CUI, dacă au fost date).
- **FR-014**: Administratorul TREBUIE să poată activa în continuare manual un eveniment în
  așteptarea activării (002/FR-028), de exemplu pentru o plată făcută în afara aplicației;
  activarea manuală rămâne înregistrată cu sursa „administrator”.
- **FR-015**: Cererile de activare (002/FR-018a) NU TREBUIE să mai poată fi trimise, iar emailul
  către administratori pentru cereri nu se mai trimite. Cererile deja existente rămân vizibile
  în istoric. Registrul evenimentelor NU TREBUIE să mai aibă grupa „cer activare” și filtrul
  „activare solicitată” (002/FR-027).
- **FR-016**: Suspendarea, reactivarea și ștergerea evenimentelor de către administrator
  (002/FR-028, 001/FR-006b) TREBUIE să rămână neschimbate; o rambursare nu schimbă automat
  starea evenimentului. *Înlocuită pentru rambursările plăților aplicate de 004/FR-004 și FR-007.*
- **FR-016a**: Când procesatorul anunță contestarea unei plăți a evenimentului (activare sau
  prelungire), un eveniment activ TREBUIE suspendat automat, cu efectele din 002/FR-028a și
  FR-031 (fișierele rămân, încărcările se opresc), iar schimbarea TREBUIE înregistrată cu sursa
  „sistem de plăți”, motivul „Plată contestată” și referința plății (002/FR-024).
  Administratorii TREBUIE să primească un email în română cu evenimentul, organizatorul și
  plata contestată. Reactivarea se face doar manual, de administrator; rezultatul disputei nu
  schimbă automat starea. Dacă evenimentul nu este activ, starea rămâne neschimbată, dar emailul
  către administratori se trimite.

**Securitate și date**

- **FR-017**: Cheile secrete ale procesatorului NU TREBUIE să ajungă în codul client, iar
  confirmările de plată care nu pot fi verificate ca provenind de la procesator TREBUIE
  respinse și înregistrate.
- **FR-018**: Pentru fiecare plată, sistemul TREBUIE să păstreze doar: evenimentul, suma,
  moneda, momentul, starea, referința plății la procesator și datele de facturare din FR-012a. Aceste date se păstrează cât timp
  se păstrează datele necesare facturării evenimentului (001/FR-044, FR-047).
- **FR-019**: Mediile de dezvoltare și de testare automată TREBUIE să folosească modul de test al
  procesatorului, fără încasări reale; modul real se folosește doar în producție.

**Prelungirea păstrării**

- **FR-020**: Prelungirea păstrării de către organizator (001/FR-041) TREBUIE plătită online:
  după alegerea unei opțiuni mai lungi, organizatorul plătește diferența dintre noul preț final
  și cel plătit deja. Noua opțiune și noua dată de ștergere TREBUIE aplicate doar după
  confirmarea plății, cu aceleași garanții ca FR-003–FR-008, iar schimbarea TREBUIE înregistrată
  în istoricul prețului și al păstrării (001/FR-043) cu referința plății.
- **FR-021**: Dacă plata prelungirii nu reușește sau expiră, opțiunea și data ștergerii TREBUIE
  să rămână cele de dinainte. O plată reușită pentru o prelungire care nu mai este posibilă
  (evenimentul a expirat, a fost suspendat sau șters, ori are deja o opțiune egală sau mai
  lungă) NU TREBUIE să schimbe evenimentul și TREBUIE semnalată administratorilor pentru
  rambursare, ca în FR-011.
- **FR-022**: Prețul prelungirii afișat la începerea plății TREBUIE să fie cel încasat; dacă
  prețul din catalog se schimbă între timp, se aplică prețul plătit. Schimbările de opțiune
  făcute de administrator (001/FR-042) nu cer plată în aplicație.

### Key Entities

- **Plată**: o încercare de plată pentru un eveniment; are scopul (activare sau prelungirea
  păstrării, cu opțiunea aleasă), suma în lei, starea (începută, reușită, eșuată, expirată, de
  rambursat), momentele relevante, referința la procesator și datele de facturare (nume, adresă, firmă și
  CUI opționale). Un eveniment poate avea mai multe
  plăți încercate, dar cel mult una reușită pentru activare.
- **Eveniment** (din 001/002): starea „în așteptarea activării” se părăsește acum, de regulă,
  prin plată; prețul aplicat la activare este cel plătit.
- **Schimbare de stare** (din 002): pentru activarea prin plată are sursa „sistem de plăți” și
  referința plății.
- **Cerere de activare** (din 002): nu se mai creează; înregistrările existente rămân pentru
  istoric.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un organizator plătește și are evenimentul activ în sub 3 minute de la apăsarea
  butonului „Plătește și activează”, fără nicio acțiune a administratorului.
- **SC-002**: În 95% din plățile reușite, evenimentul este activ în cel mult 1 minut de la
  finalizarea plății.
- **SC-003**: 0 evenimente activate și 0 prelungiri ale păstrării aplicate de organizator fără o
  plată confirmată de procesator (în afara acțiunilor manuale ale administratorului), în testele
  automate și în auditul istoricului.
- **SC-004**: 0 încasări duble neraportate: fiecare a doua plată reușită pentru același
  eveniment ajunge la administrator pentru rambursare.
- **SC-005**: 0 date de card stocate sau afișate de aplicație.
- **SC-005a**: 100% dintre evenimentele active cu o plată contestată sunt suspendate în cel mult
  5 minute de la anunțul procesatorului, cu intrarea corespunzătoare în istoric.
- **SC-006**: Timpul mediu dintre crearea unui eveniment self-service și activarea lui scade de
  la ore sau zile (cerere + activare manuală) la sub 10 minute pentru organizatorii care plătesc
  imediat.
- **SC-007**: Cel puțin 90% dintre organizatorii care încep plata o finalizează la prima
  încercare sau reîncearcă singuri, fără să contacteze administratorul.

## Assumptions

- Procesatorul de plăți este Stripe, folosit prin pagina lui de plată găzduită; aplicația nu
  afișează un formular propriu de card.
- Prețurile afișate și încasate sunt prețuri finale pentru client (inclusiv TVA, dacă
  proprietarul platformei este plătitor); aplicația nu calculează și nu afișează TVA separat.
- Moneda este leul (RON), ca prețurile din 001/FR-046; metodele de plată sunt cele oferite de
  procesator pentru carduri în România (inclusiv portofelele electronice disponibile pe pagina
  lui).
- Contul de procesator aparține proprietarului platformei; crearea și verificarea lui sunt
  făcute de proprietar, în afara aplicației.
- Facturile fiscale (inclusiv cele prin e-Factura, unde e cazul) sunt emise de proprietarul
  platformei în afara aplicației; organizatorul primește din aplicație doar chitanța
  procesatorului.
- Rambursările se fac de administrator din contul procesatorului, în afara aplicației; ele nu
  schimbă automat starea evenimentului (FR-016). Răspunsul la o contestație (dovezi, dispută)
  se gestionează tot din contul procesatorului.
- Evenimentele create de administrator rămân active de la creare și nu trec prin plată
  (002/FR-023, FR-030).
- Pragul de 24 de ore pentru expirarea unei plăți începute este valoarea standard a paginilor de
  plată găzduite.
- Regula de ștergere automată a evenimentelor neactivate după 30 de zile (002/FR-019) rămâne;
  emailul de avertizare trimite acum la plată, nu la cererea de activare.
- Limita de evenimente în așteptarea activării per organizator (002/FR-021) rămâne neschimbată.
- Plata în rate, codurile de reducere, abonamentele și alte pachete decât pachetul complet sunt
  în afara scopului.

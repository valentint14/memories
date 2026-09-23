# Constituția Memories by AVIFY

„Memories by AVIFY” (nume de lucru) este o aplicație web prin care invitații unui eveniment
privat scanează un cod QR și încarcă poze și clipuri video în timp real. Organizatorul
vizualizează, descarcă și șterge media, iar media aprobată rulează live pe un ecran mare.

## Principii fundamentale

### I. Experiență fără fricțiune pentru invitați

- Invitații NU TREBUIE să își creeze cont și NU TREBUIE să instaleze nimic; scanarea codului QR
  duce direct la pagina de upload a evenimentului.
- Pagina de upload TREBUIE proiectată mobile-first și TREBUIE să funcționeze pe conexiuni 4G slabe.
- Uploadul TREBUIE să suporte selecție multiplă de fișiere, să afișeze o bară de progres per
  fișier și să poată fi reluat după întreruperi de rețea, fără a reîncărca de la zero ce s-a
  transferat deja.
- Buget de performanță: LCP < 2,5 s pe profil 4G pentru pagina de upload. Depășirea bugetului
  este un defect blocant.

**Justificare:** fiecare pas în plus (cont, aplicație, reîncercare manuală) reduce numărul de
invitați care contribuie; valoarea produsului stă în volumul de amintiri colectate.

### II. Confidențialitate și GDPR din proiectare

- Toate datele (bază de date, stocare, backup-uri) TREBUIE găzduite într-o regiune UE.
- Bucket-urile de stocare TREBUIE să fie private; accesul la media se face exclusiv prin
  URL-uri semnate, cu expirare.
- Metadatele EXIF, inclusiv coordonatele GPS, TREBUIE eliminate la procesare, înainte ca media
  să fie servită oricui.
- Pagina de upload TREBUIE să afișeze vizibil o notă de informare privind prelucrarea datelor.
- Fiecare eveniment TREBUIE să aibă o politică de retenție configurabilă, cu ștergere automată
  a media și a datelor asociate la expirarea termenului.

**Justificare:** media de la evenimente private conține date personale (chipuri, locații,
minori); conformitatea GDPR trebuie garantată de arhitectură, nu de disciplina operatorului.

### III. Securitate implicită

- Accesul la un eveniment TREBUIE să se facă doar printr-un token aleator, negeghicibil,
  generat cu un generator criptografic sigur; identificatorii secvențiali sau derivabili sunt
  interziși în URL-urile publice.
- Row Level Security TREBUIE să fie activ pe toate tabelele, fără excepție.
- Serverul TREBUIE să valideze tipul, dimensiunea și numărul fișierelor; validarea din client
  este doar ajutor de UX, nu control de securitate.
- Uploadul TREBUIE să aibă rate limiting.
- Niciun secret (chei service-role, chei API private) NU TREBUIE să ajungă în codul client.
- Ștergerile făcute de organizator TREBUIE să fie definitive: fișierul original și toate
  derivatele (thumbnails, conversii) se șterg din stocare, nu doar rândul din baza de date.

**Justificare:** codul QR circulă liber la eveniment; sistemul trebuie să rămână sigur chiar
și atunci când linkul ajunge la persoane neinvitate.

### IV. Pipeline media scalabil

- Fișierele TREBUIE încărcate direct din browser în stocare prin URL-uri presemnate; ele NU
  TREBUIE să treacă niciodată prin serverul aplicației.
- Procesarea TREBUIE să genereze thumbnails și să convertească HEIC într-un format afișabil
  în toate browserele țintă.
- Procesarea video TREBUIE să fie asincronă și să nu blocheze confirmarea uploadului.
- Descărcarea în masă TREBUIE realizată prin arhivă ZIP generată în streaming, fără a
  construi arhiva completă în memorie sau pe disc.

**Justificare:** vârfurile de trafic la un eveniment (sute de invitați simultan) nu trebuie să
satureze serverul aplicației; stocarea și procesarea asincronă scalează independent.

### V. Timp real fiabil

- Media nouă aprobată TREBUIE să apară pe ecranul mare în maximum 5 secunde de la aprobare
  (sau de la finalizarea procesării, dacă moderarea este dezactivată).
- Ecranul mare TREBUIE să se reconecteze automat și, după o întrerupere de rețea, TREBUIE să
  recupereze toate elementele apărute între timp, fără pierderi sau duplicate.
- Moderarea (aprobare înainte de afișare) TREBUIE să fie o opțiune configurabilă per eveniment.

**Justificare:** ecranul live este momentul vizibil al produsului în sală; un element pierdut
sau o conexiune blocată sunt observate imediat de toți invitații.

### VI. Calitate și testare

- TypeScript TREBUIE folosit în mod strict; `any` este interzis, cu excepția cazurilor
  justificate printr-un comentariu explicit în cod.
- Testele pentru fluxurile critice — upload, afișare live, ștergere, descărcare — TREBUIE
  scrise înaintea implementării și TREBUIE să eșueze înainte ca implementarea să le facă să
  treacă.
- Testele unitare se scriu cu Vitest; testele end-to-end cu Playwright, inclusiv pe cel puțin
  un viewport mobil.
- CI TREBUIE să blocheze merge-ul atunci când testele sau type-check-ul eșuează.

**Justificare:** fluxurile critice rulează o singură dată, în timpul evenimentului real; nu
există o a doua șansă de a corecta un bug în producție pentru acel eveniment.

### VII. Simplitate

- MVP-ul are prioritate față de orice extindere.
- Nicio abstracție, strat sau serviciu suplimentar NU TREBUIE introdus până când o cerință
  concretă, documentată în specificație, nu îl justifică (YAGNI).
- Orice complexitate adăugată TREBUIE justificată în secțiunea de urmărire a complexității din
  plan.

**Justificare:** un produs mic, livrat și validat la evenimente reale valorează mai mult decât
o arhitectură generală neverificată.

### VIII. Accesibilitate și localizare

- Interfața TREBUIE să respecte WCAG 2.2 nivel AA.
- Interfața TREBUIE să fie în limba română; textele NU TREBUIE hardcodate în componente, ci
  gestionate printr-o structură de localizare pregătită pentru adăugarea limbii engleze.

**Justificare:** invitații unui eveniment au vârste și abilități diverse; pregătirea pentru
engleză evită o rescriere ulterioară a interfeței.

## Constrângeri tehnologice și politica de dependențe

- Se folosesc exclusiv versiuni stabile sau LTS. Versiunile canary, beta, RC sau preview sunt
  interzise în orice dependență de producție sau de build.
- Baseline tehnologic:
  - Node.js 24 LTS; migrarea la Node.js 26 se face după ce acesta devine Active LTS.
  - Next.js 16.3.x cu App Router.
  - React 19.3.x.
  - Tailwind CSS 4.3.x.
  - TypeScript 7.0 pentru type-check; TypeScript 6.0 se păstrează în paralel pentru uneltele
    care necesită API-ul programatic (ex. typescript-eslint), până la TypeScript 7.1.
- Backend: Supabase (Postgres, Auth, Storage, Realtime), într-o regiune UE, cu ultima versiune
  stabilă a SDK-urilor.
- Versiunile exacte se verifică și se fixează în lockfile în etapa `/speckit-plan`.
- Patch-urile de securitate pentru framework-uri TREBUIE aplicate în maximum 7 zile de la
  publicare.
- Orice dependență nouă TREBUIE justificată în plan prin: mentenanță activă, licență
  compatibilă și impact asupra bundle-ului.

## Flux de dezvoltare și porți de calitate

- Fiecare funcționalitate urmează fluxul Spec Kit: specificație → plan → task-uri →
  implementare.
- Fiecare plan TREBUIE să conțină o verificare explicită a conformității cu principiile I–VIII
  și cu constrângerile tehnologice; orice abatere se documentează și se justifică în plan.
- Porți obligatorii înainte de merge: type-check trecut, teste Vitest trecute, teste Playwright
  trecute (inclusiv viewport mobil), buget LCP respectat pentru pagina de upload.
- Review-ul de cod TREBUIE să verifice în mod explicit: RLS pe tabelele noi, absența
  secretelor în client, ștergerea din stocare și validarea pe server.

## Guvernanță

- Această constituție are prioritate față de orice altă practică, convenție sau document al
  proiectului.
- Amendamentele se fac prin pull request, care TREBUIE să conțină: justificarea modificării,
  actualizarea versiunii conform semver și verificarea impactului asupra șabloanelor Spec Kit
  (plan, spec, tasks).
- Politica de versionare:
  - MAJOR: eliminarea sau redefinirea incompatibilă a unui principiu ori a unei reguli de
    guvernanță.
  - MINOR: adăugarea unui principiu sau a unei secțiuni ori extinderea materială a
    îndrumărilor.
  - PATCH: clarificări, reformulări, corecturi fără efect semantic.
- Conformitatea se verifică la fiecare plan (poarta „Constitution Check”) și la fiecare review
  de cod; neconformitățile nejustificate blochează merge-ul.

**Version**: 1.0.0 | **Ratified**: 2026-09-23 | **Last Amended**: 2026-09-23

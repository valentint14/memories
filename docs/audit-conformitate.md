# Verificări de accesibilitate, conținut legal și încredere: cum stă aplicația

Documentarea celor 18 verificări față de codul din repository. Este o **documentare**: nu s-a modificat nimic în aplicație.

Verificat pe branch-ul `feat/lista-cerinte` (peste `main` la `c820b08`), prin citirea codului din `apps/web`, `apps/worker`, `supabase/` și `deploy/`. Textele legale sunt cele din `apps/web/content/legal/`.

> **Nu este consultanță juridică.** La punctele de drept (3, 6, 9, 12, 15) documentul spune ce există și ce lipsește față de ce cere de obicei legislația aplicabilă în România și în UE. Formularea finală trebuie verificată de un jurist sau de contabilul firmei.

Legendă: ✅ acoperit · ⚠️ parțial sau neconcordanțe · ❌ lipsește.

| # | Verificare | Stare |
|---|---|---|
| 1 | Contrast de culori | ✅ |
| 2 | Text alternativ la imagini | ✅ |
| 3 | Politica de rambursare | ❌ |
| 4 | Pagina politicii de confidențialitate | ⚠️ |
| 5 | Accesibilitate | ✅ |
| 6 | Pagina de termeni și condiții | ⚠️ |
| 7 | Conținut terț încorporat | ✅ |
| 8 | Drepturi de autor la imagini | ✅ |
| 9 | Politica de cookie-uri | ⚠️ |
| 10 | Urmărire (tracking) | ✅ |
| 11 | Consimțământ în formulare | ⚠️ |
| 12 | Legislația locală | ⚠️ |
| 13 | Etichete clare la butoane | ✅ |
| 14 | Consimțământ pentru cookie-uri | ✅ |
| 15 | Datele reale ale firmei | ❌ |
| 16 | Doar datele necesare | ✅ |
| 17 | Formulare folosibile de la tastatură | ✅ |
| 18 | Afirmații nesusținute | ⚠️ |

**Cele mai importante două probleme:** (a) paginile legale sunt încă „schiță”, fără datele firmei și fără o adresă de contact, deși textele trimit la ea; (b) textele despre furnizori se contrazic (politica spune Brevo, nota pentru invitați spune Vercel și Resend, codul folosește Resend și Oracle). Sunt detaliate la punctele 4, 15 și 18.

## Stare după remedieri

Toate finding-urile au fost tratate în cod pe `feat/lista-cerinte`. Ce a rămas, depinde de tine:

| # | Ce s-a făcut |
|---|---|
| 3, 6 | Secțiunea „Retragere și rambursări” în termeni (retragere de 14 zile, începerea imediată a serviciului, rambursări integrale pentru plăți care nu mai pot fi aplicate, cum se cere o rambursare, SAL/SOL, legea aplicabilă, limitarea răspunderii, modificarea termenilor). Bifa „cer ca serviciul să înceapă imediat…” e obligatorie la activare și la prelungire, iar momentul se salvează pe plată (`payments.withdrawal_waived_at`). |
| 4, 9, 12 | Politica de confidențialitate nouă: operatorul, temeiurile, cookie-urile, furnizorii corecți, retenția adresei IP, drepturile complete și plângerea la ANSPDCP. Versiunile `2026-10-11` ale ambelor documente, înregistrate în migrarea `20261011000100_legal_withdrawal.sql`; organizatorii trebuie să le reaccepte. Marcajul „Schiță” a fost scos. |
| 15 | Subsol pe toate paginile (termeni, confidențialitate, retragere și rambursări, contact) și datele firmei în capul paginilor legale, din variabilele `BUSINESS_*` (`lib/business.ts`). **Trebuie setate în `web.env` pe server**; lipsa lor ascunde rândurile respective. |
| 5, 17 | Link „Sari la conținut”, `id="continut"` pe toate paginile; test e2e pentru 404, subsol și linkul de sărit. |
| 18 | Furnizorii aliniați (Resend, Oracle Cloud) în politică și în nota invitaților; `organizer.new.step3` descrie plata online; „fișierele sunt găzduite în UE”; `vercel.json` șters. Promisiunea „copiile de siguranță, cel mult 7 zile” rămâne adevărată ca plafon (Supabase Pro: 7 zile, fără PITR; planul Free nu are copii), dar nu se verifică din repository: dacă se activează PITR sau o retenție mai lungă, textul trebuie schimbat. |

Textele legale sunt scrise pentru a fi complete, dar **nu sunt verificate juridic**: merită citite de un jurist, mai ales formularea renunțării la retragere (la un serviciu continuu, legea poate cere doar plata proporțională).

Textele de mai jos descriu starea la momentul auditului.

---

## 1. Contrast de culori — ✅

- Paleta are 9 culori (`app/globals.css`). Testul `tests/unit/design-language.test.ts` calculează contrastul WCAG pentru perechile folosite și cere cel puțin 4,5:1 pentru text (de exemplu `ink` pe `paper`, `ink-muted` pe `paper-raised`, `accent` pe `paper`, `danger` pe `paper-raised`) și 3:1 pentru bordura câmpurilor (`field` pe `paper-raised`, WCAG 1.4.11). Dacă se schimbă un token și contrastul scade, CI pică.
- Stările hover adăugate pe butoane (`ink-muted` ca fundal cu text `paper-raised`, aproximativ 6,6:1) rămân peste prag; perechea nu e în test, dar calculul manual o confirmă.
- Focusul are contur vizibil de 2 px (`:focus-visible`), iar axe (punctul 5) verifică și contrastul pe ecranele reale.

## 2. Text alternativ la imagini — ✅

În aplicație sunt doar trei elemente `<img>`:
- codul QR de la autentificarea în doi pași: `alt` descriptiv („Cod QR pentru aplicația de autentificare”);
- imaginea din vizualizatorul galeriei: `alt` cu autorul („Poză de la {nume}”);
- miniaturile din grila galeriei: `alt=""` (decorative), pentru că fiecare cadru are alături numărul, autorul și ora ca text, deci informația nu se pierde pentru cititoarele de ecran.

Iconițele sunt SVG-uri decorative (`components/ui/icons.tsx`); butoanele care conțin doar o iconiță au `aria-label` (42 de apariții în `app/` și `components/`). Nu există imagini decorative de conținut.

## 3. Politica de rambursare — ❌

Nu există o pagină sau o secțiune dedicată. Singura mențiune este un paragraf din termeni (`content/legal/terms/2026-10-05.md`, §4): o plată care nu mai poate fi aplicată (dublă sau pentru un eveniment șters între timp) se rambursează, iar la o contestare la bancă evenimentul se suspendă.

**Lipsește:**
- dacă organizatorul poate cere rambursarea voluntar și în ce condiții (de exemplu înainte de data evenimentului sau înainte de primele încărcări);
- termenul și modalitatea rambursării (către același card, în câte zile);
- informarea despre **dreptul de retragere de 14 zile** pentru contractele la distanță, sau, pentru un serviciu digital care începe imediat, cum se renunță la el și cum se cere consimțământul expres la plată (cuvântul „retragere” nu apare nicăieri în aplicație sau în texte);
- cine decide și cum se cere (adresa de contact lipsește, vezi punctul 15).

Aplicația are rambursări tehnice (migrarea `20261006000100_refunds.sql`, stările „De rambursat”, „Rambursată” în panoul de admin), deci funcția există; lipsește explicația pentru client.

## 4. Pagina politicii de confidențialitate — ⚠️

**Ce există:** `/privacy`, versionată (`content/legal/privacy/2026-10-05.md`, versiunea curentă citită din baza de date), cu secțiuni despre datele prelucrate, găzduire și procesatori, durate de păstrare, drepturi și contact. Acceptarea se înregistrează cu versiunea (vezi punctul 11).

**Probleme:**
- **Textul e marcat „Schiță”.** Fiecare versiune începe cu „Schiță — de completat și verificat juridic de proprietarul platformei înainte de lansare.” și acel avertisment se afișează utilizatorilor.
- **Contactul lipsește.** Secțiunea „Contact” spune „adresa de contact a administratorului, afișată în aplicație”; nu am găsit nicio adresă afișată în aplicație.
- **Furnizorii nu concordă între surse** (detaliat la punctul 18): emailurile apar ca „Brevo” în politică, dar codul trimite prin Resend.
- **Lipsesc elemente uzuale:** identitatea operatorului de date, temeiul legal al prelucrărilor, dreptul de a depune plângere la autoritatea de supraveghere (ANSPDCP), mențiunea că adresa IP se păstrează ca valoare ștearsă de identitate (HMAC) pentru limitarea cererilor, informații despre cookie-uri (punctul 9).

## 5. Accesibilitate — ✅

- Suita `tests/e2e/a11y.spec.ts` rulează **axe-core** cu etichetele `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` și `wcag22aa` pe ecranele aplicației (pagina invitatului în toate stările, autentificare, zona organizatorului cu galerie, vizualizator și dialoguri, administrare) și pică la orice încălcare. Rulează în CI pe trei browsere (desktop, Pixel 7, iPhone 15).
- `lang="ro"`, `prefers-reduced-motion` respectat (`globals.css`), țintele de atingere au cel puțin 44 px (`min-h-11`/`min-h-12`), focus vizibil, mesajele de eroare legate prin `aria-describedby`/`role="alert"`, galeria construită cu componente react-aria (navigare de la tastatură).

**Rezerve:**
- paginile noi (404, eroare, schelet de încărcare) nu sunt în `a11y.spec.ts`;
- nu există un link „Sari la conținut”; pagina are totuși regiuni (`header`, `main`), iar axe nu cere link de sărit atunci;
- nu există dovada unui test manual cu cititor de ecran, pe care testele automate nu îl înlocuiesc.

## 6. Pagina de termeni și condiții — ⚠️

Există `/terms` (`content/legal/terms/2026-10-05.md`), cu serviciul, contul, evenimentele și activarea, prețul și plata, conținutul încărcat, păstrarea și contactul. Are însă aceleași probleme ca politica de confidențialitate: marcajul „Schiță”, contactul care trimite la o adresă neafișată și, în plus, **lipsesc**:
- identitatea prestatorului (vezi punctul 15);
- limitarea răspunderii, legea aplicabilă și instanța competentă;
- retragerea și rambursarea (punctul 3);
- informații despre soluționarea alternativă a litigiilor (ANPC / SAL / SOL);
- ce se întâmplă cu serviciul la modificarea termenilor (procesul există în cod: `TERMS_OUTDATED` cere reacceptarea, dar textul nu îl descrie).

## 7. Conținut terț încorporat — ✅

Singurele servicii externe contactate de browser, toate permise explicit în CSP (`lib/security/csp.ts`):
- **Cloudflare Turnstile** (script și iframe), doar pe paginile cu formular (creare eveniment, autentificare);
- **Stripe Checkout**: redirecționare către pagina găzduită de Stripe, nu încorporare;
- **Supabase**: API, Storage și Realtime;
- **Sentry**: raportarea erorilor, doar dacă DSN-ul e setat.

Nu există fonturi de pe CDN (fonturile se descarcă la build și se servesc de pe domeniul propriu, `next/font`), analytics, hărți, videoclipuri sau widget-uri sociale. Politica de confidențialitate numește Turnstile, Stripe, Supabase și Sentry.

## 8. Drepturi de autor la imagini — ✅

- Imaginile din aplicație sunt făcute pentru ea: iconițele și imaginea de partajare (generate din fonturile proiectului), codurile QR (generate) și pozele invitaților (ale lor).
- Fonturile (Newsreader, IBM Plex Sans, IBM Plex Mono) sunt sub licența SIL Open Font License, care permite folosirea și servirea proprie.
- `fixtures/media/*` sunt fișiere de test, nu parte din aplicație.

**Rezervă:** conținutul încărcat de invitați aparține lor, iar termenii (§5) pun răspunderea pe organizator. Nu există o procedură pentru o reclamație de drepturi de autor sau pentru conținut ilegal, în afară de faptul că administratorul poate suspenda sau șterge un eveniment.

## 9. Politica de cookie-uri — ⚠️

Nu există o pagină sau o secțiune dedicată. Politica de confidențialitate spune doar că Turnstile funcționează „fără cookie-uri”.

**Cookie-urile folosite efectiv** (toate strict necesare):
- sesiunea de autentificare Supabase (organizatori și administratori), cu durată de până la 400 de zile;
- `mg_s`, sesiunea anonimă a invitatului (`httpOnly`, limitată la pagina evenimentului, valabilă până la sfârșitul perioadei de încărcare plus o marjă).

Nu se folosește `localStorage`, `sessionStorage` sau `indexedDB` (am căutat în `app/`, `components/`, `lib/`).

Ar fi util o secțiune scurtă „Cookie-uri” în politică, care să le enumere și să precizeze că sunt strict necesare.

## 10. Urmărire (tracking) — ✅

Nu există analytics, pixeli de reclamă, hărți de căldură sau scripturi de marketing (am căutat Google Analytics, Meta Pixel, Hotjar, Plausible, Matomo, Mixpanel, Vercel Analytics și altele în cod și dependențe). Singura telemetrie este Sentry, cu datele personale șterse înainte de trimitere (`lib/observability/scrub.ts`: emailuri, tokenuri din URL, căi de fișiere, nume) și cu colectarea informațiilor de utilizator, a cookie-urilor și a antetelor dezactivată.

Adresa IP se folosește doar pentru limitarea cererilor, ca HMAC cu un secret (`lib/security/ip-hash.ts`), nu în clar.

## 11. Consimțământ în formulare — ⚠️

**Organizatori — ✅:** formularul de creare a evenimentului (`CreateEventForm`, `OrganizerCreateForm`) are o casetă „Accept termenii și politica de confidențialitate”, **nebifată implicit**, obligatorie (`required`, validată și pe server), cu linkuri către `/terms` și `/privacy`. Acceptarea se salvează în `terms_acceptances` (email, versiunea documentului, momentul). La o versiune nouă, organizatorul trebuie să reaccepte (`TERMS_OUTDATED`). Nu există abonare la newsletter sau consimțământ de marketing, deci nu e nimic pre-bifat.

**Invitați — ⚠️:** pagina de încărcare nu cere consimțământ; arată o notă informativă pliată („Cum folosim datele tale”: cine vede fișierele, eliminarea locației, data ștergerii, furnizorii). Termenii pun obligația informării invitaților pe organizator. Nota nu trimite la politica completă.

**Plata — ⚠️:** datele de facturare se introduc pe pagina Stripe; în aplicație nu există o casetă separată pentru renunțarea la dreptul de retragere (punctul 3).

## 12. Legislația locală — ⚠️

Nu pot certifica conformitatea; iată ce acoperă textele și ce lipsește.

**Acoperit (GDPR):** date găzduite în UE (Frankfurt, Irlanda, Franța), durate de păstrare concrete, dreptul de acces, rectificare și ștergere, ștergerea de către organizator, eliminarea metadatelor de locație din fișiere (verificat în cod, punctul 18), minimizarea datelor (punctul 16), mențiunea clauzelor contractuale standard pentru Stripe și Cloudflare.

**De verificat cu un jurist:**
- identitatea operatorului și datele de contact (punctul 15);
- temeiul legal, drepturile suplimentare (restricționare, portabilitate, opoziție) și plângerea la ANSPDCP;
- informațiile precontractuale și retragerea pentru consumatori (punctul 3);
- link către ANPC și platforma SOL;
- informațiile obligatorii pentru un serviciu online în România (comerț electronic), inclusiv datele de înregistrare ale firmei;
- facturarea: textul spune că factura se emite separat; nu e descris cum se trimite.

## 13. Etichete clare la butoane — ✅

Butoanele au etichete de acțiune: „Trimite codul”, „Creează evenimentul”, „Verifică”, „Aplică”, „Încearcă din nou”, „Prima pagină”. În timpul trimiterii eticheta se schimbă („Se trimite…”). Butoanele cu iconițe au `aria-label`. „Salvează” apare în patru formulare de administrare, dar fiecare e în propria foaie cu titlu, deci contextul e clar. Nu am citit fiecare buton din aplicație; am verificat dicționarul de mesaje și componentele principale.

## 14. Consimțământ pentru cookie-uri — ✅ (cu o condiție)

Nu e nevoie de bară de consimțământ în starea actuală: cookie-urile folosite sunt **strict necesare** (autentificare și sesiunea invitatului), iar legislația ePrivacy scutește de consimțământ astfel de cookie-uri. Nu există cookie-uri de analiză sau de marketing.

**Condiția:** dacă se adaugă vreodată analytics, reclame sau un widget terț care setează cookie-uri, apare obligația de consimțământ prealabil și de o bară de acceptare. Informarea despre cookie-uri rămâne recomandată oricum (punctul 9).

## 15. Datele reale ale firmei — ❌

- Singura identificare este „Memories by AVIFY” în `terms/2026-10-05.md` §1.
- **Lipsesc** denumirea firmei, forma juridică, CUI, numărul de înregistrare la Registrul Comerțului, sediul, un email și un telefon de contact.
- Textele trimit la „adresa de contact a administratorului, afișată în aplicație”, dar nu există o astfel de adresă în aplicație (căutat „contact”, „mailto”, „suport” în `app/`, `components/`, `lib/i18n/`). Aplicația nu are nici footer, deci nici un loc natural unde ar sta.
- Datele firmei sunt necesare și pentru facturile fiscale, pentru politica de confidențialitate (operatorul) și pentru termeni (prestatorul).

## 16. Doar datele necesare — ✅

| Cine | Ce se colectează | De ce |
|---|---|---|
| Organizator | email, numele și data evenimentului, versiunea termenilor acceptați, istoricul evenimentului | autentificare fără parolă, funcționarea serviciului, dovada acceptării |
| Organizator (la plată) | nume, adresă, opțional firmă și CUI | factura fiscală; datele cardului rămân la Stripe |
| Invitat | fișierele încărcate, nume **opțional**, identificator anonim al dispozitivului | afișarea autorului în galerie, limita de fișiere per invitat |
| Toți | adresa IP, doar ca HMAC | limitarea cererilor |

Alte măsuri: locația (GPS) din fișiere se elimină, evenimentele neconfirmate se șterg după 24 de ore, cele neactivate după 30 de zile, datele de facturare se anonimizează după 3 ani. Nu se cere parolă, telefon, vârstă sau adresă de la invitați.

## 17. Formulare folosibile de la tastatură — ✅

- Câmpurile sunt `<input>`/`<textarea>` native cu `<label>`, iar selecția de date, lista derulantă și dialogurile vin din react-aria-components, care tratează tastatura și focusul.
- Ordinea de tab urmează ordinea vizuală; capcana anti-boți (`ss-website`) e scoasă din ordinea de tab (`tabIndex={-1}`) și din arborele de accesibilitate (`aria-hidden`).
- Focusul e vizibil (`:focus-visible` și bordura câmpurilor), iar un câmp invalid își păstrează bordura de eroare și când e focusat.
- axe verifică etichetele, ordinea și numele accesibile pe formularele reale (punctul 5).

**Rezerve:** nu există o suită dedicată de teste cu tastatura (în afară de câteva apăsări în `organizer-edit.spec.ts`) și nici link „Sari la conținut”.

## 18. Afirmații nesusținute — ⚠️

**Susținute de cod (în regulă):**
- „Eliminăm automat din fișiere locația (GPS)”: `apps/worker/src/media/sanitize.ts` șterge metadatele și `hasLocationTags` verifică, după curățare, că niciun tag de locație n-a rămas; fișierul nu e servit altfel.
- „Fără cont, fără instalare” pentru invitați: pagina de încărcare funcționează din browser, cu sesiune anonimă.
- „Fișierele se șterg automat la data afișată”: există joburi de ștergere programate.

**Neconcordanțe și afirmații de verificat:**
1. **Furnizorul de email:** politica de confidențialitate din 2026-10-05 spune „Brevo (Franța)”; nota de pe pagina invitatului (`guest.privacyProcessors`) și versiunea veche a politicii spun „Resend”; codul trimite prin SMTP **Resend** (`apps/worker/src/email/transport.ts`, `.env.example`).
2. **Găzduirea:** politica nouă spune Oracle Cloud; nota invitaților (`guest.privacyProcessors`) și versiunea veche spun **Vercel**; documentația de livrare folosește Oracle, iar `apps/web/vercel.json` există încă.
3. **Pasul 3 din „Eveniment nou” (`organizer.new.step3`):** „Trimiți o cerere de activare: administratorul te contactează pentru plată”. Restul aplicației (`activation.how`, termenii) spune că plata se face online, direct, deci textul pare rămas dintr-un flux mai vechi.
4. **Copiile de siguranță:** „dispar în cel mult 7 zile” (politică și nota invitaților). Perioada depinde de planul Supabase și de configurarea de pe server; nu e verificabilă din repository.
5. **„Datele sunt găzduite în Uniunea Europeană”** (`home.footnote`) fără nuanța din politică: Stripe și Cloudflare pot prelucra date și în afara UE.
6. **Avertismentul „Schiță”** pe paginile legale publice (punctul 4) spune utilizatorilor că textul nu e final.

---

## Ce rămâne de făcut

În ordinea importanței:

1. **Completează datele firmei și adresa de contact (15)** în aplicație (de exemplu într-un footer) și în `terms`/`privacy`; fără ele, trimiterile din texte sunt goale.
2. **Finalizează textele legale cu un jurist (4, 6, 12)** și scoate marcajul „Schiță” abia după aceea.
3. **Scrie politica de rambursare și informarea despre retragere (3)**, cu consimțământ expres la plată dacă se renunță la dreptul de retragere.
4. **Aliniază furnizorii (18.1, 18.2):** o singură listă, aceeași în politică, în nota invitaților și în cod.
5. **Corectează `organizer.new.step3` (18.3)** și confirmă promisiunea despre copiile de siguranță (18.4).
6. **Adaugă o secțiune „Cookie-uri” în politică (9)** cu cele două cookie-uri strict necesare.
7. **Adaugă un footer cu linkuri către termeni, politică și contact (4, 6, 15).** Acum aceste linkuri apar doar lângă formularele de creare; un invitat sau un organizator autentificat nu le găsește.
8. **Opțional:** link „Sari la conținut”, pagini noi (404, eroare) în `a11y.spec.ts`, un test manual cu cititor de ecran.

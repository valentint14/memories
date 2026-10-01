# Research: Activarea evenimentului prin plată online (Stripe)

Fiecare decizie răspunde unei necunoscute din [plan.md](./plan.md) › Technical Context.

## R1. Forma plății: Stripe Checkout găzduit

- **Decision**: Stripe Checkout în modul `payment`, pagina găzduită de Stripe (redirect), câte o
  sesiune per plată. Prețul se trimite ca `price_data` (sumă în bani, `currency: "ron"`), nu ca
  produs predefinit în Stripe.
- **Rationale**: FR-003 cere ca datele cardului să nu atingă aplicația; pagina găzduită ține
  aplicația în cel mai mic perimetru PCI (SAQ A), colectează adresa și datele firmei (R4), are
  Apple Pay / Google Pay și traducere în română fără cod în plus. `price_data` evită
  sincronizarea catalogului de retenție cu produse Stripe (constituția VII): suma vine mereu din
  baza de date.
- *Actualizare la implementare*: sesiunea trimite `managed_payments: { enabled: false }`. Pe
  conturile noi, Stripe activează implicit Managed Payments (Stripe ca vânzător, cu TVA și
  documente fiscale proprii, coduri fiscale de produs obligatorii), ceea ce ar contrazice FR-012
  (platforma emite facturile). Decizia proprietarului (2026-10-02): platforma rămâne vânzătorul.
- **Alternatives considered**: Payment Element încorporat (formular în aplicație: mai mult cod,
  CSP pentru `js.stripe.com`, SAQ A-EP); Payment Links (nu pot purta suma calculată per eveniment
  și nici legătura sigură cu evenimentul); produse/prețuri Stripe sincronizate (două surse de
  adevăr pentru prețuri).

## R2. SDK-ul și versiunea API

- **Decision**: pachetul npm oficial `stripe` **22.6.2** (MIT, întreținut de Stripe, fără
  dependențe), doar în `apps/web`, doar pe server (`import "server-only"`). Versiunea API se
  fixează explicit la crearea clientului, la valoarea implicită a SDK-ului instalat.
- **Rationale**: constituția cere versiuni stabile; 23.0.0 a apărut pe 2026-10-01, cu câteva ore
  înaintea acestui plan (versiune majoră nouă, fără patch-uri). 22.6.2 este ultima stabilă din
  linia anterioară, cu trei săptămâni de utilizare. Trecerea la 23.x se evaluează separat, după
  primul patch. Impact pe bundle: zero (cod doar pe server). Alternativa fără SDK (fetch pe REST)
  ar cere reimplementarea verificării semnăturii webhook-urilor, cu risc de securitate.
- **Alternatives considered**: `stripe@23.0.0` (prea nou); apeluri REST directe (vezi mai sus).

## R3. Confirmarea plății: webhook + verificare la întoarcere

- **Decision**: două căi, ambele autentice (FR-004) și idempotente (FR-006):
  1. **Webhook** `POST /api/stripe/webhook`: corpul brut verificat cu `STRIPE_WEBHOOK_SECRET`
     (`constructEvent`); evenimente: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
     `checkout.session.expired`, `charge.dispute.created`.
  2. **La întoarcere** (`/events/{id}?plata={sessionId}`): serverul citește sesiunea direct din
     API-ul Stripe cu cheia secretă și, dacă `payment_status = "paid"`, aplică aceeași
     finalizare. Redirectul în sine nu activează nimic: doar răspunsul API-ului Stripe.
- **Rationale**: webhook-ul garantează activarea și când organizatorul închide fereastra;
  verificarea la întoarcere scurtează timpul până la „activ” (SC-002) și acoperă un webhook
  întârziat. Finalizarea e o singură funcție SQL cu blocare pe rândul plății, deci cele două căi
  nu pot activa de două ori.
- **Alternatives considered**: doar webhook (organizatorul ar vedea mai des „plata se
  confirmă”); doar întoarcerea (plata s-ar pierde dacă fereastra se închide înainte).

## R4. Datele de facturare (FR-012a)

- **Decision**: `billing_address_collection: "required"` (nume + adresă) și
  `tax_id_collection: { enabled: true }` (Checkout oferă căsuța „Cumpăr ca firmă”, cu numele
  firmei și codul fiscal, opțional). La finalizare, datele se copiază din sesiune
  (`customer_details`) în rândul plății.
- **Rationale**: acoperă exact „nume și adresă obligatorii, firmă și CUI opționale”, fără
  formular propriu. Codul fiscal românesc e acceptat de Stripe ca tip de identificator fiscal.
- **Alternatives considered**: `custom_fields` (fără validarea formatului CUI); formular propriu
  înainte de Checkout (un pas în plus pentru organizator, date de validat în aplicație).

## R5. O singură plată deschisă și expirarea (FR-007, FR-008)

- **Decision**: rândul `payments` cu `status = 'open'` e unic per (eveniment, scop) printr-un
  index unic parțial. La o nouă apăsare: dacă plata deschisă are aceeași opțiune și aceeași sumă
  și mai are cel puțin 10 minute, se reia URL-ul ei; altfel se închide la Stripe
  (`checkout.sessions.expire`) și se creează alta. `expires_at` = minimul dintre acum + 24 h și
  ștergerea automată − 1 h; Stripe cere cel puțin 30 de minute, deci sub acest prag plata nu mai
  poate începe (`PAYMENT_WINDOW_CLOSED`).
- **Rationale**: Stripe nu permite două încasări din aceeași sesiune; închiderea explicită a
  sesiunii vechi elimină dubla plată din două ferestre (rămâne doar cazul teoretic în care ambele
  se finalizează în aceeași secundă, tratat de FR-011).
- **Alternatives considered**: o sesiune nouă la fiecare apăsare (risc real de dublă plată);
  blocarea butonului în interfață (nu ajunge: două file).

## R6. Prețul aplicat (FR-002, FR-022)

- **Decision**: suma se calculează în baza de date la pregătirea plății și se îngheață în rândul
  `payments` (`base_price_minor`, `surcharge_minor`, `amount_minor`, `retention_option_id`).
  La activare și la prelungire se aplică valorile înghețate, nu cele curente din catalog.
- **Rationale**: „se aplică prețul afișat și plătit la începerea plății”; o singură sursă de
  adevăr pentru sumă.
- **Alternatives considered**: recalcularea la finalizare (ar contrazice suma încasată).

## R7. Prelungirea plătită (FR-020–FR-022)

- **Decision**: organizatorul alege opțiunea, vede diferența de preț și noua dată, apasă
  „Plătește prelungirea”; aplicarea se face la finalizarea plății, prin aceeași logică de
  validare ca `extend_retention` (stare activă, înainte de ștergere, opțiune mai lungă), cu
  autorul `payment` în istoricul păstrării. `extend_retention` nu mai e apelabilă de organizator;
  administratorul schimbă opțiunea ca până acum (001/FR-042), fără plată.
- **Rationale**: aceeași regulă de business, un singur loc de aplicare.

## R8. Contestațiile (FR-016a)

- **Decision**: `charge.dispute.created` → plata se marchează contestată; dacă evenimentul e
  `active`, `transition_event(… 'suspended', 'payment', null, 'Plată contestată', <ref>)`;
  oricum, email către administratori. Rezultatul disputei (`charge.dispute.closed`) nu se
  procesează: reactivarea e manuală.
- **Rationale**: exact clarificarea; un singur eveniment Stripe de tratat.

## R9. Testarea fără încasări (FR-019)

- **Decision**:
  - **Unit și DB**: funcțiile SQL de plată se testează direct (Vitest `db`); handler-ul de
    webhook se testează cu evenimente semnate cu un secret de test
    (`stripe.webhooks.generateTestHeaderString`) și cu clientul Stripe îndreptat spre un server
    local.
  - **E2E (CI)**: un server Stripe fals, cu stare (`apps/web/tests/e2e/support/stripe-fake.mjs`,
    pornit de Playwright), pe care aplicația îl folosește prin `STRIPE_API_BASE` (gazdă/port
    configurabile în SDK). Testul verifică redirectul spre Checkout, apoi trimite webhook-ul semnat
    `checkout.session.completed` și verifică evenimentul activ. Pagina Checkout găzduită nu se
    automatizează.
  - *Actualizare la implementare*: planul inițial era `stripe/stripe-mock`. Acesta e fără stare și
    întoarce mereu același id de sesiune, care se ciocnește de unicitatea `payments.stripe_session_id`
    și nu poate „plăti” o sesiune pentru verificarea la întoarcere. Serverul fals implementează doar
    cele trei apeluri folosite de aplicație și două rute de control pentru teste.
  - **Manual (local și înainte de producție)**: cont Stripe în modul test, Stripe CLI
    (`stripe listen --forward-to`), carduri de test (succes, refuz, contestație).
- **Rationale**: CI nu poate depinde de rețeaua și conturile Stripe; stripe-mock e întreținut de
  Stripe și nu cere chei reale. Constituția VI: testele pentru fluxul critic se scriu înainte.
- **Alternatives considered**: e2e prin pagina reală Checkout în modul test (dependent de rețea,
  fragil, cere secrete în CI); mock-uri scrise de mână pentru toate apelurile (fără verificarea
  formei reale a cererilor).

## R10. CSP și redirectul

- **Decision**: `form-action 'self' https://checkout.stripe.com` în `buildCsp`. Butonul de plată
  e un formular cu Server Action care întoarce `redirect(session.url)`.
- **Rationale**: browserele aplică `form-action` și redirectului de după trimiterea unui
  formular; fără origine, formularul fără JavaScript ar fi blocat. Nicio altă directivă nu se
  schimbă (Checkout e o navigare, nu un script sau un iframe).

## R11. Emailuri și chitanța (FR-010, FR-012)

- **Decision**: chitanța o trimite Stripe (setarea „Successful payments” din contul Stripe, plus
  `receipt_email` = emailul organizatorului). Aplicația trimite, prin worker, emailul ei de
  confirmare (activare sau prelungire) și emailurile către administratori (de rambursat,
  contestație). În modul test Stripe nu trimite chitanțe: se verifică doar emailurile aplicației.
- **Rationale**: FR-012 (aplicația nu emite facturi); emailurile aplicației folosesc coada și
  șabloanele existente (002/contracts/worker-jobs.md).

## R12. Găzduirea webhook-ului

- **Decision**: endpointul rulează în containerul `web` din spatele Cloudflare Tunnel
  (docs/livrare-server-propriu.md). În Cloudflare, regula WAF/Bot nu trebuie să blocheze
  `POST /api/stripe/webhook` (fără provocare JS). Corpul se citește brut (`request.text()`), cu
  limită de 1 MB, iar răspunsul e 2xx doar după ce rândul a fost scris.
- **Rationale**: nicio infrastructură nouă; Stripe reîncearcă automat până la 3 zile la orice
  răspuns non-2xx.

## R13. GDPR și procesatorul nou

- **Decision**: Stripe Payments Europe (Irlanda) devine procesator: DPA-ul Stripe acceptat la
  crearea contului, mențiune în politica de confidențialitate (versiune nouă a documentului,
  002/FR-041). În baza de date se păstrează doar datele din FR-018; fără date de card.
- **Rationale**: constituția II; datele aplicației rămân în UE (Supabase Frankfurt).

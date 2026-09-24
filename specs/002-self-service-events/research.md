# Research: Creare self-service a evenimentelor

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data**: 2026-09-24

Deciziile din [research 001](../001-event-qr-upload/research.md) rămân valabile (versiuni,
găzduire UE, coadă `pgmq`, worker, Resend în `eu-west-1`, testare). Aici sunt doar deciziile noi
sau modificate. Verificările marcate „probă locală” au fost rulate pe Supabase local (CLI, 2026-09-24).

**Notă despre descrierea planului**: descrierea primită pentru `/speckit-plan` menționa încă
regimul de probă. Specificația clarificată îl elimină (Clarifications, 2026-09-24), deci:
„pachet de probă” → nu există; „probă” → „în așteptarea activării”; „expirarea probei” →
ștergerea evenimentelor neactivate (FR-019); „prelungire probă” → eliminat. Cerința de motiv
obligatoriu la acțiunile administratorului a fost adoptată (spec FR-028 actualizat).

---

## R1. Emiterea codului și a linkului: Supabase Auth `generateLink` + email trimis de worker

**Decizie**: Tokenurile sunt emise și verificate de Supabase Auth, dar emailul nu îl trimite
Supabase Auth. Serverul aplicației doar înregistrează cererea și pune un job `auth_email` în coada
`media_jobs`, apoi răspunde. Worker-ul:

1. pentru crearea unui eveniment: creează utilizatorul Auth dacă nu există
   (`auth.admin.createUser`, `email_confirm: false`);
   pentru autentificare: dacă utilizatorul nu există, jobul se încheie fără email (FR-011);
2. apelează `auth.admin.generateLink({ type: "magiclink", email })`, care întoarce `email_otp`
   (codul de 6 cifre) și `hashed_token`;
3. trimite prin SMTP (Resend UE, ca în 001) emailul în română, cu codul și linkul
   `{APP_URL}/auth/confirm?request={id}&token_hash={hashed_token}`.

Verificarea se face pe server cu `verifyOtp` (`token_hash` + `type: "email"` pentru link;
`email` + `token` + `type: "email"` pentru cod), din `@supabase/ssr`, care scrie cookie-urile
de sesiune.

Comportamente verificate prin probă locală:
- un `generateLink` nou invalidează codul emis anterior (FR-006, „cererea unui email nou le
  invalidează pe cele anterioare”);
- folosirea `hashed_token` invalidează și codul, și invers (FR-006, „folosirea unuia le
  invalidează pe amândouă”);
- `verifyOtp` confirmă adresa (`email_confirmed_at`);
- `generateLink` pentru o adresă fără cont **creează** utilizatorul, chiar cu
  `enable_signup = false`. Din acest motiv, worker-ul verifică existența înainte de
  `generateLink` în fluxul de autentificare.

**Motivație**:
- **Răspuns identic (FR-003, FR-011, SC-004)**: calea sincronă este aceeași pentru adrese noi și
  existente (validare, Turnstile, limite, inserare, punere în coadă). Diferențele (creare de
  utilizator, trimitere sau nu) se întâmplă în worker, după răspuns, deci nu se văd în mesaj, în
  codul de stare sau în timp.
- **Contul se creează doar pentru cererile de creare** (nu la autentificare), iar conturile
  neconfirmate se șterg după 24 de ore (R6).
- **Un singur mecanism** pentru organizatori și administratori (FR-010), cu șabloane în română
  versionate în repository (`apps/worker/src/email/templates/`) și testate.
- **CAPTCHA fără conflict**: tokenul Turnstile este de unică folosință. Dacă serverul l-ar
  verifica și apoi l-ar trimite la `signInWithOtp`, al doilea consum ar eșua. Aici îl
  verifică doar serverul aplicației (R3), iar apelurile către Auth sunt administrative
  (cheia service role), care nu cer CAPTCHA.

**Alternative respinse**:
- *`signInWithOtp` cu șabloanele Supabase (varianta din descrierea planului)*: pentru o adresă
  fără cont (autentificare cu `shouldCreateUser: false`) Auth răspunde imediat cu eroare, fără
  trimitere, deci timpul de răspuns diferă (încalcă SC-004). Mutarea apelului după răspuns
  (`after()`) rezolvă timpul, dar rămâne consumul dublu al tokenului CAPTCHA. Pe lângă asta,
  șabloanele Supabase se aplică prin `config.toml` doar local; în producție trebuie sincronizate
  separat (`supabase config push` sau dashboard).
- *Trimitere din Server Action (Next.js)*: ar adăuga SMTP în aplicația web și ar lega timpul de
  răspuns de furnizorul de email; worker-ul trimite deja emailuri (001, R17).

**Consecințe**: șabloanele Supabase (`supabase/templates/magic_link.html`) rămân doar pentru
apeluri directe la endpointul public (de ex. din dashboard) și primesc același format (link către
pagina cu buton, fără cod consumat automat). Endpointul public `/auth/v1/otp` rămâne protejat
de CAPTCHA-ul Auth (R3).

## R2. Pagina de confirmare cu buton (protecție contra scanerelor de linkuri)

**Decizie**: `/auth/confirm` devine o pagină (nu un route handler care verifică la `GET`).
`GET` afișează numele evenimentului (dacă cererea e de creare) și butonul „Confirmă”. Butonul
trimite un formular (`POST`, Server Action) care apelează `verifyOtp` și apoi finalizează
cererea (R4). Tokenul nu este consumat la `GET`, iar pagina are `Referrer-Policy: no-referrer` și
`Cache-Control: no-store`.

**Motivație**: recomandarea Supabase pentru prefetch-ul scanerelor de email este o pagină
intermediară cu buton sau OTP; aici le avem pe amândouă (FR-007, SC-003). Formularul nativ
funcționează și înainte de hidratare (lecția din 001: formularul de login nativ).

**Alternative respinse**: verificare la `GET` (starea actuală din 001) — consumată de scanere;
redirecționare prin JavaScript după încărcare — scanerele care rulează JavaScript ar consuma
tokenul.

## R3. Verificarea anti-bot: Cloudflare Turnstile

**Decizie**:
- **Formularul de creare și formularul de autentificare**: widget Turnstile în modul „managed”
  (invizibil pentru majoritatea utilizatorilor; provocare accesibilă doar în cazurile suspecte).
  Serverul aplicației verifică tokenul la `siteverify`, înainte de orice altă operație, cu
  `remoteip` = IP-ul clientului.
- **Endpointul public Supabase Auth**: CAPTCHA-ul integrat al Auth, activat cu furnizorul
  `turnstile` (`[auth.captcha]` în `config.toml` local; setarea echivalentă în dashboard pentru
  producție). Fluxurile aplicației folosesc API-ul administrativ pentru emitere (fără CAPTCHA) și
  `verifyOtp` pentru confirmare. **Probă locală (T002, 2026-09-24)**, cu CAPTCHA-ul Auth
  activ: `verifyOtp` reușește fără `captchaToken` (cod și `token_hash`); `signInWithOtp` fără
  token e refuzat („captcha protection: request disallowed”), iar cu tokenul de test e acceptat.
  Secretul de test se încarcă din `supabase/.env` (comis; cheie publică de test Cloudflare).
- **Fără dependență nouă**: scriptul `https://challenges.cloudflare.com/turnstile/v0/api.js` se
  încarcă cu nonce-ul CSP existent printr-o componentă proprie mică (`TurnstileField`). CSP-ul
  adaugă `https://challenges.cloudflare.com` la `script-src` și `frame-src`.
- **Teste**: cheile de test Cloudflare. Local și în CI se folosesc sitekey
  `1x00000000000000000000BB` (invizibil, trece mereu) și secretul
  `1x0000000000000000000000000000000AA`, care acceptă tokenul `XXXX.DUMMY.TOKEN.XXXX`. Pentru
  testul de respingere se folosește secretul `2x0000000000000000000000000000000AA`.
- **Clienții de test cu parolă** (DB tests din 001) trimit `captchaToken` = tokenul de test
  atunci când CAPTCHA-ul Auth e activ local.

**Motivație**: preferința din descriere; suport nativ în Supabase Auth (hCaptcha și Turnstile);
fără cookie-uri, invizibil în majoritatea cazurilor (SC-007).

**GDPR**: Cloudflare devine procesator (IP și semnale ale browserului, fără stocare de date ale
aplicației). Nu este o abatere de la principiul II („datele găzduite în UE” se referă la baza de
date, stocare și backup-uri, care rămân în UE), dar Cloudflare se adaugă pe lista de DPA și în
politica de confidențialitate.

**Alternative respinse**: hCaptcha (provocări vizibile mai des); Friendly Captcha (UE, dar fără
suport în Supabase Auth, deci endpointul public ar rămâne neprotejat); honeypot simplu
(insuficient singur, dar se adaugă gratuit ca prim filtru — câmp ascuns care, completat, duce
la răspunsul neutru fără efect).

## R4. Evenimentul neconfirmat și cererea de confirmare

**Decizie**:
- Evenimentul neconfirmat se inserează în `events` cu `status = 'unconfirmed'`,
  `origin = 'self_service'` și `organizer_email` normalizat, fără legătură cu vreun utilizator
  (în 001 organizatorul este deja identificat prin email, nu prin `user_id`).
- Crearea trece prin funcția SQL `request_self_service_event(...)`, apelată doar de server cu
  cheia service role; `anon` și `authenticated` nu au drept de inserare pentru această stare
  (politica `events_admin_insert` rămâne singura politică de inserare).
- Tabelul `auth_requests` leagă emailul, scopul (`create` / `login`) și, la creare, evenimentul.
  `id` este un UUID aleator, transmis în link (`request=`) și păstrat în pagina de cod. Cererea
  nu conține codul sau tokenul.
- La confirmare, funcția `complete_auth_request(request_id)` (apelată de server după
  `verifyOtp` reușit) verifică: cererea există, e în așteptare, neexpirată și are aceeași
  adresă ca utilizatorul autentificat. Apoi mută evenimentul în `awaiting_activation`, leagă
  acceptarea termenilor de utilizator, scrie istoricul și marchează cererea ca folosită. Dacă
  cererea lipsește (autentificare simplă), utilizatorul ajunge la `/events`.
- Pagina de după trimitere primește mereu un `request` id: real dacă cererea a fost
  înregistrată, sau unul aleator, neînregistrat, dacă a fost limitată sau respinsă de honeypot.
  Forma răspunsului este aceeași.

**Motivație**: FR-004 (neconfirmatul nu e vizibil nimănui: politicile RLS ale organizatorului
exclud starea); FR-006 (o singură cerere activă per adresă, prin tokenul Auth); cazul limită
„confirmarea uneia nu le confirmă pe celelalte” (fiecare cerere are propriul eveniment).

**Încercări greșite (FR-008)**: `auth_requests.failed_attempts` crește la fiecare cod greșit
verificat prin aplicație. La 5, cererea devine `invalidated`, iar worker-ul primește un job
`auth_rotate` care apelează `generateLink` fără să trimită email. Acesta invalidează codul și
la nivelul Auth, deci codul nu mai poate fi încercat nici direct la endpointul public.

## R5. Stările evenimentului: enum extins + funcție de tranziție + istoric

**Decizie**:
- `event_status` primește valorile `unconfirmed`, `awaiting_activation`, `suspended`. Valorile
  din 001 rămân: `active`, `expiring` și `deleting` (etape interne), `expired`.
- Tabelul `event_status_transitions` (`from_status`, `to_status`) listează tranzițiile
  permise (data-model.md).
- Singura cale de schimbare a stării este funcția `transition_event(event_id, to, source,
  actor, reason, external_ref)` (`security definer`), care validează tranziția și scrie în
  `event_status_changes` în aceeași tranzacție. Un trigger `before update of status` respinge
  orice altă modificare a coloanei, cu excepția celor făcute de această funcție (marcaj de
  sesiune `app.status_transition`).
- Funcțiile din 001 care schimbau starea direct (`request_event_deletion`, expirarea,
  anonimizarea) sunt rescrise să folosească `transition_event`, cu sursa `admin`, `organizer`
  sau `system`.
- `activate_event(event_id, source, actor, reason, external_ref)` este operația comună pentru
  administrator și, ulterior, pentru plăți (FR-025). Este idempotentă (FR-026): dacă evenimentul
  e deja activ, scrie un rând de istoric `active → active` cu nota „activare repetată” și nu
  schimbă nimic altceva. Aceeași `external_ref` pentru același eveniment e unică, pentru
  notificările de plată duplicate.
- Istoricul este doar pentru inserare: fără politici de `update` sau `delete` pentru
  `authenticated`; un trigger refuză modificarea rândurilor.

**Motivație**: tranzițiile invalide sunt imposibile indiferent de apelant (principiul III, mai
exact validarea pe server); o singură operație de activare pentru toate sursele.

**Alternative respinse**: coloană separată de „stare comercială” lângă starea de ciclu de viață
din 001 (două mașini de stări care trebuie ținute sincron); validare doar în Server Actions
(ocolibilă prin RPC direct).

## R6. Curățenie automată și avertizare

**Decizie** (`pg_cron`, ca în 001):
- **La 15 minute**: `delete from events where status = 'unconfirmed' and created_at < now() -
  interval '24 hours'` (cascadă: `auth_requests`, `terms_acceptances`). Evenimentele neconfirmate
  nu au fișiere, deci nu e nevoie de worker (SC-005: ≤ 25 h).
- **Orar**: evenimentele `awaiting_activation` cu `pending_purge_at <= now()` se șterg direct
  (nu au fișiere, iar codul QR se generează la cerere), cu un rând în istoric înainte de
  ștergere pentru jurnalul de audit (`app_audit_log`, R9). Dacă adresa nu mai are alte
  evenimente, se pune în coadă `delete_organizer_user` (job existent din 001).
- **Orar**: avertizarea de 7 zile (FR-019) se pune în coadă ca notificare cu pragul nou
  `activation_7d` în tabelul de notificări din 001 (unic per eveniment și dată de ștergere, deci
  exact un email; o dată nouă după schimbarea datei evenimentului produce un email nou).
- **Zilnic**: utilizatorii Auth cu `email_confirmed_at is null`, creați cu peste 24 de ore în
  urmă și fără evenimente, se șterg prin jobul `delete_organizer_user`.

**Motivație**: descrierea planului cerea ștergerea prin worker; aici worker-ul este necesar
doar pentru utilizatorii Auth (API administrativ), pentru că evenimentele neactivate nu au
fișiere în Storage.

## R7. Pachetul complet și setările self-service

**Decizie**:
- **Tabelul `packages`**, cu un singur rând `code = 'complete'` în această funcționalitate:
  preț (bani), fișiere maxime per invitat, dimensiuni maxime (poze, video), opțiunea de retenție
  inclusă (FK spre catalogul din 001).
- **Tabelul `self_service_settings`**, cu un singur rând: numărul maxim de evenimente în
  așteptarea activării per organizator (implicit 2).
- **La activare**, valorile pachetului se copiază în coloanele existente ale evenimentului:
  `base_price_minor`, `max_files_per_guest`, `max_photo_bytes`, `max_video_bytes`,
  `retention_option_id`. Validările de upload din 001 se aplică neschimbat (FR-016).
- **Evenimentele create de administrator** primesc `package_id = complete` și valorile
  introduse de administrator, ca în 001 (FR-023).

**Motivație**: constituția VII (fără abstracții până nu sunt cerute): descrierea planului
cerea și tipuri permise și funcții incluse, dar specificația clarificată are un singur pachet,
iar tipurile permise sunt fixe (001/FR-014). Tabelul permite pachete noi fără a schimba stările
(FR-014).

**Aplicarea limitelor pe server**: pe lângă validările de upload din 001, funcțiile invitatului
(`start_guest_session`, `reserve_upload`, finalizarea uploadului) refuză evenimentele care nu
sunt `active`, cu coduri distincte, `EVENT_NOT_ACTIVATED` și `EVENT_SUSPENDED` (FR-031,
FR-032). Politicile Storage pentru `incoming` depind deja de rezervare (001, R3).

## R8. Limitarea frecvenței

**Decizie**: funcția existentă `check_rate_limit(key, limit, window)` (001, R13), cu chei
hash-uite:
- `authmail:email:{sha256}`: 3 / 15 min și 10 / 24 h (două verificări);
- `authmail:ip:{sha256}`: 20 / oră;
- `activation-request:{event_id}`: 1 / 24 h (FR-018a).

IP-ul clientului vine din `x-forwarded-for` setat de Vercel (prima valoare) sau, local, din
`x-real-ip`. Depășirea duce la același răspuns neutru, fără job (FR-036).

**Limitele Supabase Auth**: limitele per IP ale Auth văd IP-ul serverului sau al worker-ului,
nu pe al clientului. Ele se ridică în producție la un plafon de siguranță (de ex. 1.000 / 5 min)
ca să nu blocheze toți utilizatorii simultan. Protecția reală o dau limitele aplicației de mai
sus. `otp_expiry = 900` (15 minute, FR-006) și `otp_length = 6`.

## R9. Termeni și politica de confidențialitate

**Decizie**:
- **Textele** sunt fișiere Markdown versionate în repository
  (`apps/web/content/legal/{terms,privacy}/{versiune}.md`), afișate la `/terms` și `/privacy`.
- **Tabelul `legal_documents`** conține `kind`, `version`, `effective_at`,
  `content_sha256`. Versiunea curentă este cea mai recentă cu `effective_at <= now()`. O
  migrație nouă adaugă fiecare versiune.
- **`terms_acceptances`**: `email`, `user_id` (setat la confirmare), `event_id`,
  `document_kind`, `version`, `accepted_at`. Înainte de confirmare, rândul este legat de
  evenimentul neconfirmat și se șterge odată cu el (FR-040).
- **Serverul refuză crearea** dacă versiunile trimise de formular nu sunt cele curente
  (formular deschis înainte de o schimbare de versiune).
- **`app_audit_log`** (doar inserare, fără date personale în afara `event_id`) păstrează
  ștergerile automate ale evenimentelor neactivate, pentru că istoricul lor dispare odată cu
  evenimentul.

**Alternative respinse**: editarea textelor din administrare (specificația: se publică printr-o
versiune nouă a aplicației).

## R10. Emailurile: livrabilitate și configurare DNS

**Decizie**:
- **Furnizor**: Resend (regiunea `eu-west-1`), cum s-a decis în 001, cu un subdomeniu dedicat
  de trimitere (de ex. `mail.<domeniu>`).
- **DNS**: SPF (`include` Resend pe subdomeniu), DKIM (cheile CNAME/TXT generate de Resend),
  DMARC (`p=quarantine`, raportare `rua`), MX pentru bounce. Pașii sunt în
  [quickstart.md](./quickstart.md#configurarea-dns-pentru-email).
- **Conținutul emailului**: parte text și parte HTML simplă, fără imagini externe; subiect clar
  („Codul tău Memories: 123456”); `List-Unsubscribe` nu se aplică (email tranzacțional);
  expeditor fix (`Memories <salut@mail.<domeniu>>`).
- **SMTP-ul Supabase Auth** se configurează tot cu Resend, pentru emailurile trimise direct de
  Auth (R1, consecințe).
- **Local**: Mailpit din Supabase CLI (worker-ul trimite deja acolo în 001). SC-008 se verifică
  manual pe preview, cu Gmail, Outlook și Yahoo, o singură dată per funcționalitate
  (costul și cotele de email).

## R11. Organizatorul: modificare, ștergere, suspendare

**Decizie**:
- **`organizer_update_event(event_id, name, event_date)`**: verifică proprietarul
  (`organizer_email = jwt.email`) și starea (nu `expired`, nu `suspended`, FR-028a). Pentru
  `origin = 'self_service'` recalculează perioada de upload (FR-034) și, pentru
  `awaiting_activation`, `pending_purge_at` (FR-019). Pentru evenimentele active după sfârșitul
  uploadului, `purge_at` nu se schimbă.
- **`request_event_deletion`** din 001 acceptă și organizatorul proprietar (FR-035). Dacă
  evenimentul nu a fost activat niciodată, se șterge direct (nu are fișiere); altfel trece prin
  `deleting` și worker, ca în 001, iar rândul de facturare se păstrează.
- **Suspendare** (FR-028a): galeria nu se abonează la Realtime când starea e `suspended`;
  `extend_retention` refuză această stare; vizualizarea, descărcarea și ștergerea fișierelor
  rămân permise prin RLS-ul existent (starea `suspended` se adaugă la stările vizibile
  organizatorului).

## R12. Pagina principală și rutele noi

**Decizie**:
- `/` (nou): prezentare scurtă și formularul de creare (Server Component + formular nativ cu
  `useActionState`). Rezolvă și 404-ul actual de pe `/`.
- `/auth/code`: introducerea codului, pe dispozitivul pe care s-a pornit.
- `/auth/confirm`: pagina cu buton (R2).
- `/events/new`: crearea din cont.
- `/terms`, `/privacy`: documentele legale.
- `/admin/package`: configurarea pachetului și a setărilor.
- Lista `/admin/events` primește filtre după origine, stare și „activare solicitată”; pagina
  unui eveniment primește acțiunile și istoricul.

Rutele păstrează convenția din 001 (căi în engleză, texte în română, prin `t()`).

## R13. Testare

**Decizie** (instrumentele din 001, fără altele noi):
- **DB (Vitest, proiectul `db`)**:
  - RLS: organizatorul nu vede evenimentele altuia; neconfirmatul nu e vizibil nimănui;
    istoricul nu poate fi modificat;
  - tranzițiile: toate cele permise trec, cele nepermise sunt refuzate, activarea e idempotentă;
  - limitele: evenimente în așteptare per organizator, `check_rate_limit` pe chei noi;
  - uploadul refuzat pentru `unconfirmed`, `awaiting_activation` și `suspended`;
  - curățenia: evenimentele neconfirmate după 24 de ore, cele neactivate la termen,
    avertizarea unică.
- **Worker (Vitest în imaginea Docker)**: jobul `auth_email` pentru adresă nouă, existentă și
  inexistentă la autentificare (niciun email, niciun utilizator creat), conținutul emailului în
  Mailpit, `auth_rotate`.
- **Unit (web)**: validarea formularului (zod), verificarea Turnstile (secret de test care trece
  și unul care eșuează), forma identică a răspunsului.
- **Timp de răspuns identic (SC-004)**: test de integrare care trimite câte 20 de cereri pentru
  adrese existente și inexistente și compară media (prag 100 ms) și forma răspunsului.
- **Playwright** (cele trei proiecte):
  - creare de pe `/` și confirmare prin cod;
  - confirmare prin link într-un context de browser separat;
  - linkul deschis fără apăsarea butonului nu confirmă nimic;
  - organizatorul care revine vede evenimentele create de admin și pe cele self-service;
  - cererea de activare, activarea de către admin și uploadul invitatului cu același cod QR;
  - mesajele invitatului pentru eveniment neactivat și pentru eveniment suspendat;
  - modificarea și ștergerea de către organizator;
  - ștergerea evenimentelor neactivate: data mutată în trecut prin clientul service role, apoi
    rularea funcției de curățenie.

  Codurile se citesc din Mailpit (`support/mailpit.ts`, existent). Emailurile reale nu se
  trimit în teste (doar Mailpit), conform regulii de a limita testele cu email real.

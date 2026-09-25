# Raport de implementare — 002 Creare self-service a evenimentelor de către organizatori

**Branch**: `002-self-service-events` | **Data**: 2026-09-25 | **Constituție**: v1.2.0
**Documente**: [spec](./spec.md) · [plan](./plan.md) · [research](./research.md) ·
[data-model](./data-model.md) · [contracte](./contracts/) · [quickstart](./quickstart.md) ·
[tasks](./tasks.md)

## 1. Ce s-a realizat

### Povești de utilizator

| Poveste | Prioritate | Stare | Ce poate face utilizatorul |
| --- | --- | --- | --- |
| US1 — Creare self-service | P1 | ✅ | pe `/`: email, nume, dată, acceptarea termenilor, fără parolă; email cu cod de 6 cifre și link; confirmare prin cod (pe dispozitivul de pornire) sau prin link către o pagină cu buton; ajunge autentificat la eveniment, cu codul QR |
| US2 — Organizatorul revine | P1 | ✅ | autentificare cu cod și link (organizatori și administratori, înlocuiește magic link-ul din 001); lista cu toate evenimentele adresei și starea lor; creare din cont fără email |
| US3 — În așteptarea activării | P1 | ✅ | panoul cu prețul pachetului, ce include și data ștergerii; „Solicită activarea” (email către administratori, o dată la 24 h); ștergere automată la 30 de zile după dată, cu avertizare la 7 zile |
| US4 — Administrare | P2 | ✅ | lista filtrabilă (origine, stare, activare solicitată); activare, suspendare și reactivare cu motiv obligatoriu; istoricul stărilor; editarea numelui și a datei unui eveniment neactivat |
| US5 — Configurarea pachetului | P2 | ✅ | `/admin/package`: preț, limite, păstrare inclusă, limita de evenimente în așteptare; se aplică doar activărilor ulterioare |
| US6 — Mesaje pentru invitați | P2 | ✅ | pagină politicoasă pentru evenimente neactivate sau suspendate; refuz pe server cu coduri distincte |
| US7 — Modificare și ștergere | P2 | ✅ | organizatorul schimbă numele și data (linkul și codul QR rămân) și își șterge definitiv evenimentele |

### Cerințe

- **FR-001–FR-042** (inclusiv FR-018a și FR-028a): toate au implementare și cel puțin un test
  automat (maparea e în `tasks.md`).
- **Criterii de succes verificate automat**: SC-002–SC-007, SC-009–SC-014 (secțiunea 3).
  SC-001 (timp cu utilizatori reali) și SC-008 (livrare în Inbox la furnizori reali) cer testare
  manuală — secțiunea 4.

### Sarcini

**104 din 105** sarcini din `tasks.md` sunt finalizate. Rămâne **T104**: validarea manuală a
celor 17 scenarii din quickstart și SC-008 pe preview, cu adrese Gmail, Outlook și Yahoo reale
(o singură dată, din cauza cotelor de email).

### Ce conține codul

| Zonă | Conținut principal |
| --- | --- |
| `supabase/migrations/20261001*` (20 de migrații) | stări noi și mașina de stări cu istoric imuabil; pachetul și setările; documentele legale și acceptările; cererile de confirmare; crearea din cont; cererile de activare; activarea, suspendarea; pagina invitatului; editarea și ștergerea de către organizator; joburi `pg_cron` de curățenie |
| `apps/web/app` | `/` (creare), `/auth/code`, `/auth/confirm` (pagină cu buton), `/terms`, `/privacy`, `/events/new`, `/admin/package`; lista și pagina evenimentului refăcute pentru stările noi |
| `apps/web/lib` | Turnstile (`security/turnstile.ts`, `TurnstileField`), CSP, acțiunile de creare, confirmare, activare și administrare |
| `apps/worker/src` | joburile `auth_email`, `auth_rotate`, `admin_activation_notice`, ramura `activation_7d`; șabloanele de email cu textele în `email/messages/ro.ts` |
| `apps/web/content/legal` | termenii și politica de confidențialitate, versiunea `2026-10-01` (**schiță**, de completat de proprietar) |

## 2. Cum s-a realizat

### Arhitectura implementată

- **Codul și linkul**: tokenurile sunt emise și verificate de Supabase Auth, dar emailul îl trimite
  worker-ul (`auth.admin.generateLink`). Aplicația înregistrează doar cererea (limite, eveniment,
  acceptări) într-o singură funcție SQL și pune un job în coadă, deci răspunsul e identic, ca text
  și ca timp, pentru orice adresă. Un cod nou îl invalidează pe cel vechi, iar folosirea linkului
  invalidează și codul (verificat prin probă locală, research R1).
- **Pagina cu buton**: `/auth/confirm` nu consumă tokenul la deschidere; `verifyOtp` rulează doar la
  apăsarea butonului (formular nativ, funcționează și înainte de hidratare).
- **Stările**: `event_status` extins cu `unconfirmed`, `awaiting_activation`, `suspended`. Orice
  schimbare trece prin `transition_event`, care validează perechea în `event_status_transitions` și
  scrie `event_status_changes` (imuabil, cu sursa). Un trigger respinge schimbarea directă a stării
  și a câmpurilor de activare prin API, inclusiv cu service role.
- **Activarea**: `activate_event` e aceeași operație pentru administrator și, ulterior, pentru
  plăți: copiază pachetul în eveniment, deschide uploadul și calculează data ștergerii; e
  idempotentă, iar o referință de plată deja înregistrată nu mai scrie nimic.
- **Anti-bot și limite**: Turnstile verificat pe server înainte de orice; limitele (3/15 min și
  10/zi per adresă, 20/oră per IP) sunt în aceeași funcție SQL ca și crearea. CAPTCHA-ul Supabase
  Auth protejează endpointul public `/otp`.

### Abateri și decizii luate la implementare

| Decizie | Motiv | Unde e documentată |
| --- | --- | --- |
| Emailul de autentificare trimis de worker, nu de șabloanele Supabase | răspuns identic ca timp; tokenul Turnstile consumat o singură dată | research R1, plan › Complexity Tracking |
| CAPTCHA-ul Auth activ, verificat prin probă că nu afectează `verifyOtp` | T002 | research R3 |
| Secretul de test Turnstile comis în `supabase/.env` | e o cheie publică de test Cloudflare; CLI-ul Supabase o încarcă automat, local și în CI | research R3, `.gitignore` |
| Modul `TURNSTILE_OFFLINE` (doar cu secretele de test) | sub încărcarea suitei e2e, apelurile reale la Cloudflare eșuau intermitent; widgetul real e verificat separat (`turnstile-widget.spec.ts`) | analiza 2, U1 |
| Organizatorul primește codul QR (`organizer_event_token`) | 001 îl rezerva administratorului; spec 002/FR-009 îl cere | migrația `…001050` |
| Pagina principală și paginile legale randate per cerere (`connection()`) | pre-randate static, pierdeau nonce-ul CSP și nu se hidratau | cod |
| Ștergerea cerută de organizator a unui eveniment activat îl finalizează ca expirat | FR-035: datele de facturare se păstrează până la anonimizare | `request_event_deletion`, `purge_event` |
| `auth_rotate` nu rotește dacă între timp există o cerere mai nouă | altfel invalida codul nou cerut după 5 greșeli | worker, test |
| Plafonul de fișiere per invitat al pachetului: 1.000 (nu 10.000) | aliniat la constrângerea evenimentelor din 001 | data-model |
| Testele care modifică stare globală (retenție, pachet) rulează într-un lanț secvențial | rulau în paralel cu ele însele în cele trei browsere | `playwright.config.ts` |
| Testele admin din 001 folosesc administratori noi | limita per adresă (3 / 15 min) oprea a 4-a autentificare a aceluiași admin | `admin.spec.ts` |

## 3. Verificare

Toate rezultatele sunt din rulări locale (Supabase local în Docker, Windows 11, Node 24.21.0),
cu același set de comenzi ca în CI.

| Suită | Rezultat |
| --- | --- |
| Lint (ESLint strict) și typecheck (TypeScript 7.0) | trec |
| Unitare (shared + web) | 61/61 |
| Bază de date: RLS, stări, funcții, curățenie | 171/171 |
| Worker, în imaginea Docker (inclusiv emailurile de cod, activare, avertizare) | 43/43 |
| e2e Playwright: desktop Chromium, Pixel 7, iPhone 15 (WebKit), plus proiectele `limits`, `captcha-reject`, `turnstile-smoke` și lanțul secvențial | 186 trec, 10 sărite intenționat (teste specifice unui singur browser: LCP și CDP pe mobile Chrome, timpul de răspuns pe desktop Chromium) |
| Accesibilitate axe WCAG 2.2 AA, toate ecranele noi, trei browsere | 0 încălcări |

Măsurători:

| Criteriu | Rezultat local | Prag |
| --- | --- | --- |
| LCP `/` (Slow 4G + CPU 4×) | median 564 ms | < 2,5 s |
| LCP `/e/[token]` (neschimbat) | median 516 ms | < 2,5 s |
| SC-004 — timp de răspuns, adrese existente vs inexistente | diferența mediilor < 100 ms, aceeași pagină (20 de cereri per tip) | < 100 ms |
| SC-014 — emailul cu cod ajunge în Mailpit | < 30 s (de regulă 1–3 s) | ≤ 30 s |
| SC-006 — a 4-a cerere în 15 min / a 21-a pe oră de pe un IP | fără cerere, fără email, răspuns identic | 0 emailuri peste limite |
| SC-007 — formular cu CAPTCHA respins | niciun eveniment, nicio cerere, niciun email | 100% blocate |

## 4. Limitări și pași următori

### Ce nu a putut fi verificat

- **T104 / SC-001 / SC-008**: scenariile manuale, timpul cu utilizatori reali și livrarea în Inbox
  la Gmail, Outlook și Yahoo (necesită domeniul de trimitere configurat, quickstart › DNS).
- **Textele legale** sunt schițe; conținutul final îl stabilește proprietarul (cu verificare
  juridică). Orice modificare cere o versiune nouă (test T017).
- **Un fișier deja în transfer** când evenimentul e suspendat se termină de încărcat în Storage,
  apoi e respins pe server; invitatul îl vede ca „încărcat” (fișierele care nu au început primesc
  mesajul politicos).
- **Un eveniment șters de organizator după activare** rămâne în lista lui ca „Expirat” (rândul de
  facturare), fără fișiere și fără link.

### Înainte de producție

1. Domeniul de trimitere în Resend (SPF, DKIM, DMARC) și SMTP-ul Supabase Auth (quickstart).
2. Cloudflare Turnstile: widget „Managed” pe domeniile de producție și preview; cheile în Vercel
   și în Supabase Auth (CAPTCHA); DPA cu Cloudflare.
3. Supabase Auth în producție: OTP 900 s, lungime 6, înregistrare dezactivată, limitele din
   research R8.
4. Pachetul complet configurat în `/admin/package` (prețul și opțiunea de retenție inclusă nu au
   valori implicite în producție).
5. `ADMIN_NOTIFY_EMAILS` pe worker, dacă cererile de activare nu trebuie să ajungă la toți
   administratorii.
6. Textele finale ale termenilor și ale politicii de confidențialitate, ca versiune nouă.
7. T104, pe preview.

# Implementation Plan: Creare self-service a evenimentelor de către organizatori

**Branch**: `002-self-service-events` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-self-service-events/spec.md`

## Summary

Oricine își poate crea un eveniment de pe pagina principală: email, nume, dată și acceptarea
termenilor, fără parolă. Serverul verifică Turnstile, aplică limitele de frecvență, salvează
evenimentul ca `unconfirmed` (legat de adresă, nu de un utilizator) și pune în coadă un job.
Worker-ul existent emite prin API-ul administrativ Supabase Auth un cod de 6 cifre și un
token hash (valabile 15 minute, de unică folosință) și trimite un email în română, prin SMTP-ul
UE din 001. Confirmarea se face fie cu codul, pe dispozitivul de pornire, fie prin linkul către
o pagină cu buton, care nu consumă tokenul la simpla deschidere. După confirmare,
organizatorul e autentificat și ajunge la eveniment, aflat „în așteptarea activării”: vede
codul QR, îl poate edita și poate solicita activarea, dar invitații nu pot încărca încă.

Administratorul activează pachetul complet printr-o operație SQL idempotentă, aceeași pe care
o va folosi ulterior sistemul de plăți. Poate și suspenda sau reactiva, cu motiv obligatoriu.
Stările evenimentului extind enumerarea din 001 și se schimbă doar printr-o funcție de
tranziție care validează perechea (stare veche, stare nouă) și scrie un istoric imuabil, cu
sursa. `pg_cron` șterge evenimentele neconfirmate după 24 de ore și pe cele neactivate la 30
de zile după data lor, cu un email de avertizare cu 7 zile înainte. Autentificarea
organizatorilor care revin (și a administratorilor) trece pe același mecanism de cod și link.

## Technical Context

**Language/Version**: TypeScript strict pe Node.js 24.21.0 LTS (neschimbat față de 001); SQL
(Postgres 17)

**Primary Dependencies**: cele din 001 (Next.js 16.3.6, React 19.3.0, @supabase/ssr 0.12.7,
@supabase/supabase-js 2.117.1, zod 4.6.5, react-aria-components 1.21.1, nodemailer 10.0.10
în worker). **Nicio dependență npm nouă.** Serviciu extern nou: Cloudflare Turnstile (script
încărcat de la `challenges.cloudflare.com`, verificare prin `siteverify`)
([R3](./research.md#r3-verificarea-anti-bot-cloudflare-turnstile)).

**Storage**: Supabase Postgres (`eu-central-1`): 9 tabele noi (`packages`,
`self_service_settings`, `event_status_transitions`, `event_status_changes`, `auth_requests`,
`legal_documents`, `terms_acceptances`, `activation_requests`, `app_audit_log`), coloane și
stări noi pe `events`, joburi `pg_cron` noi. Storage neschimbat (evenimentele neactivate nu au
fișiere). Documentele legale sunt fișiere Markdown în repository.

**Testing**: Vitest (proiectele `db`, `web`, `worker`) și Playwright (desktop Chromium,
Pixel 7, iPhone 15 WebKit), ca în 001. Codurile se citesc din Mailpit. Turnstile folosește
cheile de test Cloudflare.

**Target Platform**: neschimbat (Vercel `fra1`, Supabase `eu-central-1`, worker Scaleway
`fr-par`, Resend `eu-west-1`)

**Project Type**: aplicație web, monorepo pnpm (`apps/web`, `apps/worker`, `packages/shared`,
`supabase/`)

**Performance Goals**:
- creare + confirmare + descărcarea codului QR în < 3 min pentru un utilizator nou (SC-001);
- emailul ajunge în Mailpit/Inbox în < 30 s de la trimitere (SC-014; coada are latența din 001, < 5 s);
- diferența medie de timp de răspuns între adrese existente și inexistente < 100 ms (SC-004);
- LCP pentru `/` < 2,5 s pe 4G (aceeași țintă ca pagina invitatului).

**Constraints**:
- tokenul nu se consumă la `GET`;
- niciun răspuns observabil diferit pentru adrese existente sau inexistente;
- toate limitele se aplică pe server (FR-038);
- secretul Turnstile și cheia service role doar pe server;
- nicio schimbare de stare în afara `transition_event`.

**Scale/Scope**: zeci de creări self-service pe zi la început; limita de trimitere e dată de
cota SMTP (Resend) și de limitele de frecvență (R8). 9 rute noi sau modificate, ~20 de funcții
SQL noi sau modificate, 4 joburi de worker noi.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principiu | Verificare | Stare |
| --- | --- | --- |
| I. Fără fricțiune pentru invitați | Pagina invitatului rămâne fără cont; doar mesaje noi pentru evenimentele neactivate sau suspendate; bugetul LCP se menține (testul de LCP din 001 rulează neschimbat). | ✅ |
| II. GDPR | Datele rămân în UE (Postgres, Storage). Evenimentele și utilizatorii neconfirmați se șterg în 24 h, cele neactivate la termen. Acceptarea termenilor e înregistrată cu versiunea. Cloudflare Turnstile e procesator nou, fără stocare de date ale aplicației: DPA + mențiune în politica de confidențialitate (R3). Fiecare eveniment are o regulă de ștergere automată în orice stare. Politica de retenție configurabilă (opțiunea din catalog) se aplică de la activare, când evenimentul poate primi fișiere. Înainte de activare, evenimentul nu are media, iar ștergerea automată are termene fixe (24 h neconfirmat, 30 de zile după dată neactivat). Aceasta este o interpretare explicită a principiului, nu o abatere. | ✅ |
| III. Securitate implicită | Tokenul public al evenimentului, aleator (001). RLS pe toate tabelele noi. Crearea și schimbările de stare doar prin funcții `security definer` validate pe server. Rate limiting per adresă și per IP. Turnstile. Tokenul de autentificare nu e consumat de scanere. Secretele doar pe server. Ștergerea de către organizator curăță Storage ca în 001. | ✅ |
| IV. Pipeline media scalabil | Neschimbat; uploadul se deschide doar după activare. | ✅ |
| V. Timp real fiabil | Neschimbat pentru evenimentele active; dezactivat intenționat pentru cele suspendate (FR-028a). | ✅ |
| VI. Calitate și testare | TypeScript strict; teste scrise înainte (RLS, tranziții, idempotență, limite, curățenie, răspuns identic, e2e pe mobil). | ✅ |
| VII. Simplitate | Un singur pachet (fără tipuri de fișiere sau „funcții incluse” configurabile, cerute în descrierea planului, dar nejustificate de specificație). Fără dependențe npm noi. Excepțiile sunt justificate mai jos. | ✅ cu justificare |
| VIII. Accesibilitate și localizare | Texte noi prin `t()`, WCAG 2.2 AA (axe pe ecranele noi), provocarea Turnstile accesibilă. | ✅ |
| Constrângeri tehnologice | Versiunile din 001, fără dependențe noi. | ✅ |
| Flux de dezvoltare | Branch `002-self-service-events` din `main` actualizat. Raportul de implementare obligatoriu la final (v1.2.0). | ✅ |

**Re-evaluare după Phase 1**: designul (data-model, contracte) nu introduce abateri noi; poarta
rămâne trecută.

## Project Structure

### Documentation (this feature)

```text
specs/002-self-service-events/
├── plan.md              # acest fișier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 (scenarii + DNS email + configurarea producției)
├── contracts/
│   ├── web-interface.md
│   ├── database-functions.md
│   └── worker-jobs.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   ├── 2026100100…_event_states.sql          # enum-uri, events: coloane + check-uri, tranziții, istoric, trigger de gardă
│   ├── 2026100100…_packages.sql              # packages, self_service_settings (+ seed)
│   ├── 2026100100…_auth_requests.sql         # auth_requests + funcții de creare / confirmare / cod greșit
│   ├── 2026100100…_legal.sql                 # legal_documents (+ versiunile inițiale), terms_acceptances
│   ├── 2026100100…_state_functions.sql       # transition_event, activate_event, suspend/reactivate, request_activation
│   ├── 2026100100…_organizer_functions.sql   # create_event_as_organizer, organizer_update_event, request_event_deletion extinsă
│   ├── 2026100100…_guest_states.sql          # funcțiile invitatului + RLS media pentru stările noi
│   └── 2026100100…_cleanup_jobs.sql          # purge_*, enqueue_activation_notices, pg_cron
├── templates/magic_link.html                 # aliniat la pagina cu buton (R1, consecințe)
├── config.toml                               # [auth.captcha] turnstile, otp_expiry = 900
└── tests/                                    # rls/, functions/ (noi: states, auth-requests, cleanup, organizer)

apps/web/
├── app/
│   ├── page.tsx                              # pagina principală + formularul (nou)
│   ├── auth/confirm/page.tsx                 # înlocuiește route.ts (R2)
│   ├── auth/code/page.tsx
│   ├── terms/page.tsx, privacy/page.tsx
│   ├── events/new/page.tsx
│   ├── events/[eventId]/page.tsx             # panou de stare, editare, ștergere, cerere de activare
│   ├── e/[token]/page.tsx                    # mesajele pentru stările noi
│   └── admin/{events,package}/…              # filtre, acțiuni, istoric, configurare
├── components/
│   ├── self-service/{CreateEventForm,CodeForm,ConfirmButton,EventStatusPanel,EditEventForm,DeleteEventDialog}.tsx
│   ├── security/TurnstileField.tsx
│   └── admin/{EventStateActions,StatusHistory,PackageForm}.tsx
├── content/legal/{terms,privacy}/2026-10-01.md
├── lib/
│   ├── actions/{self-service,auth,organizer,admin}.ts
│   ├── security/{turnstile,client-ip}.ts
│   └── i18n/messages/ro.ts                   # texte noi
├── proxy.ts                                  # CSP: challenges.cloudflare.com
└── tests/
    ├── unit/                                 # validare, turnstile, formă de răspuns
    └── e2e/{self-service,activation,organizer-edit,guest-states,legal}.spec.ts

apps/worker/src/
├── jobs/{auth-email,auth-rotate,admin-activation-notice}.ts
├── email/templates/{confirmare,autentificare,activare-solicitata,stergere-neactivat}.ts
├── email/messages/ro.ts                     # textele emailurilor (constituția VIII)
└── tests/                                    # joburile noi, pe Mailpit

packages/shared/src/
├── errors.ts                                 # coduri noi (data-model.md)
└── db.types.ts                               # regenerat
```

**Structure Decision**: aceeași structură de monorepo ca în 001, fără pachete noi. Logica de
stare și de limite stă în Postgres (funcții + RLS), aplicația web face validarea, Turnstile și
UI, iar worker-ul trimite toate emailurile, inclusiv pe cele de autentificare.

## Complexity Tracking

| Abatere / complexitate | De ce e necesară | Alternativa mai simplă respinsă pentru că |
| --- | --- | --- |
| Emailurile de autentificare trimise de worker, prin `generateLink`, nu de Supabase Auth cu șabloanele din `config.toml` (cerute în descrierea planului) | Răspuns identic ca timp pentru orice adresă (SC-004); tokenul Turnstile consumat o singură dată; contul Auth se creează doar pentru cererile de creare (R1) | `signInWithOtp` răspunde diferit (ca timp) pentru adresele inexistente; tokenul CAPTCHA ar trebui consumat de două ori; șabloanele din `config.toml` nu se aplică automat în producție |
| Trigger de gardă pe `events.status` + funcție unică de tranziție | Tranzițiile invalide trebuie să fie imposibile pentru orice apelant, inclusiv viitorul sistem de plăți (FR-022, FR-025) | Validarea doar în Server Actions poate fi ocolită prin RPC; o coloană separată de stare comercială ar crea două mașini de stări de sincronizat |
| Tabel `packages` cu un singur rând | FR-014 cere un model care permite pachete noi fără a schimba stările; FR-015 cere configurare fără cod | Coloane în `self_service_settings` ar trebui migrate la primul pachet nou |
| `app_audit_log` | Ștergerea automată a unui eveniment neactivat îi șterge și istoricul, dar ștergerea trebuie să rămână auditabilă | Păstrarea rândului de eveniment ar contrazice ștergerea completă a datelor neconfirmate/neactivate (GDPR) |

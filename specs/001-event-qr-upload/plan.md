# Implementation Plan: Bucla de bază — eveniment, cod QR, upload invitați, galerie organizator

**Branch**: `001-event-qr-upload` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-event-qr-upload/spec.md`

## Summary

Administratorul (autentificat cu magic link + TOTP) creează evenimente și descarcă codul QR.
Invitații deschid linkul public, primesc de la server câte un token de upload semnat pentru
fiecare fișier și încarcă direct în Supabase Storage prin TUS (reluabil), fără cont.
Finalizarea uploadului declanșează un job `pgmq` preluat de un worker Node.js containerizat.
Worker-ul elimină metadatele de locație fără re-encodare, generează variante WebP, convertește
HEIC, produce o versiune H.264 pentru video și construiește arhive ZIP în streaming.
Organizatorul (magic link) vede galeria actualizată în timp real prin Realtime și poate
descărca sau șterge definitiv fișierele. Toate datele sunt găzduite în UE, iar accesul e
controlat prin RLS și URL-uri semnate de 15 minute.

Fiecare eveniment are o politică de retenție: un preț de bază și o opțiune din catalogul
administratorului (durată în luni + supliment). Data ștergerii (`purge_at` = sfârșitul
uploadului + durata) se calculează în Postgres; organizatorul poate doar prelungi, printr-o
funcție SQL care fixează prețul final și scrie istoricul. `pg_cron` pune în coadă avertizările
pe email (30 de zile, 7 zile, 1 zi) și expirarea; worker-ul trimite emailurile prin SMTP UE și golește
Storage-ul evenimentului expirat, păstrând doar rândul de facturare, care se anonimizează
automat la 3 ani după expirare (FR-047).

## Technical Context

**Language/Version**: TypeScript strict (type-check cu 7.0.2, lint type-aware cu 6.0.3) pe
Node.js 24.21.0 LTS; SQL (Postgres 17, Supabase)

**Primary Dependencies**: Next.js 16.3.6 (App Router, Server Components, Server Actions),
React 19.3.0, Tailwind CSS 4.3.3, react-aria-components 1.21.1, @supabase/supabase-js 2.117.1,
@supabase/ssr 0.12.7, tus-js-client 4.3.1, zod 4.6.5, qrcode 1.5.4; worker: sharp 0.35.4
(libvips din sistem + libheif/libde265), ffmpeg (binar de sistem), exiftool-vendored 38.1.2,
file-type 22.1.1, yazl 3.3.1, @aws-sdk/client-s3 + lib-storage 3.1139.0, pino 10.3.1,
nodemailer 10.0.10 (emailuri de avertizare retenție, [R17](./research.md#r17-retenție-configurabilă-și-preț));
observabilitate: @sentry/nextjs și @sentry/node 11.0.0 (versiuni complete în
[research.md R1](./research.md#r1-versiuni-fixate-baseline-constituție))

**Storage**: Supabase Postgres (`eu-central-1`) cu RLS pe toate tabelele; Supabase Storage,
bucket-uri private `incoming`, `media`, `archives`; Supabase Queues (`pgmq`), `pg_cron`

**Testing**: Vitest 5.0.1 (unit + integrare pe Supabase local pentru RLS și funcții SQL),
Playwright 1.63.0 (desktop Chromium, Pixel 7, iPhone 15 WebKit), test de fum HEIC în imaginea
Docker a worker-ului, test Playwright de LCP pe profil mobil throttled (poartă de merge),
k6 2.3.0 pentru testul de încărcare pe preview

**Target Platform**: browsere moderne pe mobil (iOS Safari 17+, Chrome Android) și desktop;
Vercel (`fra1`) pentru aplicația web; container Linux (Scaleway `fr-par`) pentru worker

**Project Type**: aplicație web (monorepo pnpm: `apps/web`, `apps/worker`, `packages/shared`,
`supabase/`)

**Performance Goals**: LCP < 2,5 s pe 4G pentru `/e/[token]` (SC-002); poză nouă în galerie
în ≤ 10 s (SC-007); 200 de invitați simultani de pe același IP fără erori (SC-006); reluare
automată după căderi de rețea de până la 2 min (SC-005); arhivă de 1.000 de fișiere (≈ 10 GB)
gata în ≤ 15 min, descărcare pornită în < 10 s de la link (SC-010, amendat)

**Constraints**: fișierele nu trec prin serverul aplicației; poze ≤ 50 MB, video ≤ 1 GB;
chunk TUS fix de 6 MiB; zero metadate de locație în fișierele servite; invitații nu au
niciun acces de citire; administratorul nu are acces la conținutul media; niciun secret în
bundle-ul client; interfața în română

**Scale/Scope**: MVP; zeci de evenimente/lună, până la ~300 de invitați și ~5.000 de fișiere
(~50 GB) per eveniment; ~12 ecrane

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principiu / regulă | Cum e respectat | Stare |
| --- | --- | --- |
| **I. Fără fricțiune** | fără cont, fără instalare; `/e/[token]` cu JS minim, TUS încărcat dinamic; selecție multiplă + cameră; progres per fișier; reluare automată; LCP < 2,5 s verificat în CI la fiecare PR (test Playwright cu throttling „Slow 4G” + CPU 4×, fără dependență nouă — R16) | ✅ |
| **II. GDPR** | Supabase `eu-central-1`, Vercel `fra1`, worker `fr-par`, Sentry UE, SMTP UE; bucket-uri private + URL-uri semnate de 15 min; locația eliminată din fișiere și verificată după curățare; notă de informare pe pagina de upload | ✅ |
| II. Retenție configurabilă cu ștergere automată | fiecare eveniment are obligatoriu o opțiune de retenție (`NOT NULL`) și un `purge_at` calculat în DB; `pg_cron` orar → `expire_event` → worker golește Storage (media, arhive, incoming) și șterge sesiunile invitaților; avertizări pe email la 30 de zile / 7 zile / 1 zi (FR-038–FR-046); datele de facturare rămase (nume eveniment, email organizator) se anonimizează automat la 3 ani după expirare, iar contul organizatorului fără evenimente se șterge (FR-047, R17); după expirare nu rămâne nicio dată a invitaților | ✅ |
| **III. Securitate** | token de 128 biți; RLS pe toate tabelele și pe `storage.objects` (matrice testată); validare pe server a tipului declarat, a dimensiunii și a numărului de fișiere + tipul real verificat în worker; rate limiting în Postgres; service role doar pe server (`server-only` + regulă de lint); ștergerea din Storage prin API, cu reconciliere | ✅ |
| **IV. Pipeline media** | upload direct TUS în Storage; miniaturi WebP; HEIC prin libheif; video asincron (H.264 + poster); ZIP în streaming (S3 GetObject → yazl → S3 multipart), niciodată în funcțiile Vercel | ✅ |
| **V. Timp real** | ecranul live e în afara scopului; galeria organizatorului folosește Realtime cu resincronizare la reconectare (FR-033); moderarea e în afara scopului | ✅ (n/a parțial) |
| **VI. Calitate** | TS strict, `no-explicit-any` ca eroare; testele pentru upload, galerie live, ștergere și descărcare se scriu înaintea implementării; Vitest + Playwright cu viewport mobil; CI blochează merge-ul | ✅ |
| **VII. Simplitate** | fără coadă externă (pgmq), fără bibliotecă i18n, fără bibliotecă UI grea, fără AVIF; componente suplimentare justificate mai jos | ✅ cu justificări |
| **VIII. A11y + i18n** | react-aria-components pentru zonele interactive complexe; ținte ≥ 44 px; axe-core în Playwright; dicționar `ro` tipat, pregătit pentru `en` | ✅ |
| Doar versiuni stabile/LTS | toate versiunile din R1 sunt `latest` stabile; excluse `@base-ui-components/react` (RC) și `fluent-ffmpeg` (abandonat); Node 26 local → se fixează 24 LTS | ✅ |
| Dependențe noi justificate | fiecare dependență are versiune, licență, mentenanță și decizie + alternative în research.md (R1–R17), inclusiv uneltele doar de test (`pg`, `@axe-core/playwright`, `server-only`, k6) | ✅ |
| Branch per specificație, PR spre `main` | lucrul se face pe `001-event-qr-upload` | ✅ |

**Rezultat înainte de Faza 0**: PASS. Abaterea anterioară (retenția amânată) a fost eliminată
prin completarea din 2026-09-24.

**Re-verificare după Faza 1** (data-model, contracte, quickstart): PASS. Designul nu adaugă
servicii dincolo de cele de mai sus (emailurile de retenție folosesc același SMTP Resend UE ca
Supabase Auth; expirarea refolosește coada `media_jobs` și logica `purge_event`). Contractele
confirmă că niciun Route Handler nu primește conținut media, că invitații nu au citire, că
administratorul are doar agregate și că organizatorul nu poate scădea prețul (prelungirea trece
exclusiv prin `extend_retention`, care refuză opțiunile mai scurte).

**Decizii ale utilizatorului** (toate punctele deschise au fost închise la 2026-09-24; nimic
nu mai blochează `/speckit-tasks`):
1. **SC-010 amendat**: arhiva e gata în ≤ 15 min, organizatorul e anunțat în galerie, iar
   descărcarea începe în < 10 s de la link
   ([research.md R9](./research.md#r9-descărcarea-în-masă-zip)).
2. **Token de upload semnat în loc de sesiune anonimă** — abatere de la input, acceptată
   ([research.md R3](./research.md#r3-uploadul-invitaților-sesiune-anonimă-supabase-vs-token-de-upload-semnat-emis-de-server)):
   limita de 30 de sesiuni anonime/oră per IP ar bloca invitații de pe Wi-Fi-ul sălii.
3. **Versiune de redare H.264 1080p pentru video**, pe lângă cadrul poster — adăugare față de
   input, acceptată (clarificarea Q1 = A; [research.md R8](./research.md#r8-variante-media)).
4. **Catalog de retenție**: 3 luni incluse în prețul de bază (supliment 0), 6 luni +49 lei,
   12 luni +99 lei; fără opțiune de 1 lună. Suplimentele rezultă din analiza pieței românești
   (prelungire de 99 lei/an la concurență) și rămân modificabile din `/admin/retention`
   ([research.md R17](./research.md#r17-retenție-configurabilă-și-preț)).
5. **Avertizare suplimentară cu 30 de zile înainte de ștergere** (FR-045), aliniată cu practica
   pieței.

## Project Structure

### Documentation (this feature)

```text
specs/001-event-qr-upload/
├── plan.md              # acest fișier
├── research.md          # Faza 0
├── data-model.md        # Faza 1
├── quickstart.md        # Faza 1
├── contracts/
│   ├── web-interface.md       # rute, Server Actions, Route Handlers, headere
│   ├── database-functions.md  # funcții SQL, pg_cron, matrice RLS
│   └── worker-jobs.md         # mesaje pgmq și pașii de procesare
├── checklists/requirements.md
└── tasks.md             # Faza 2 (/speckit-tasks — nu e creat aici)
```

### Source Code (repository root)

```text
package.json                 # workspace root: scripturi lint/typecheck/test, packageManager pnpm@12.6.0
pnpm-workspace.yaml
.nvmrc                       # 24
.github/workflows/ci.yml

apps/web/                    # Next.js 16 (Vercel, fra1)
├── app/
│   ├── e/[token]/           # pagina invitatului (Server Component + UploadClient)
│   ├── login/  auth/confirm/  auth/mfa/
│   ├── events/  events/[eventId]/       # organizator: listă, galerie
│   ├── admin/events/ …/[eventId]/qr.{svg,png}/route.ts
│   └── admin/retention/     # catalogul de opțiuni de retenție
├── components/              # UI (react-aria-components) — upload/, gallery/, admin/, retention/
├── lib/
│   ├── supabase/            # client browser, client server (cookies), admin (server-only)
│   ├── actions/             # Server Actions: guest.ts, auth.ts, organizer.ts, admin.ts
│   ├── validation/          # scheme zod ale formularelor (event.ts)
│   ├── upload/              # coadă TUS client, stări, reluare (Client)
│   ├── gallery/  realtime/  # reducer galerie (merge.ts), abonare Realtime (useEventChannel.ts)
│   ├── i18n/                # messages/ro.ts, t(), plural
│   └── security/            # CSP, rate-limit keys, ip hash
├── proxy.ts                 # reîmprospătare sesiune + CSP nonce
└── tests/
    ├── unit/
    └── e2e/                 # Playwright: guest-upload, lcp, resume, gallery, gallery-live, delete, archive, admin, retention, a11y

apps/worker/                 # Node 24, Docker (Debian trixie + libvips/libheif/ffmpeg)
├── src/
│   ├── main.ts              # buclă pgmq, oprire grațioasă
│   ├── jobs/                # process.ts, build-archive.ts, delete-archive.ts, purge-event.ts, purge-media.ts,
│   │                        # expire-event.ts, retention-notice.ts, delete-organizer-user.ts
│   ├── email/               # transport nodemailer (SMTP UE) + șabloane text/HTML în română
│   ├── media/               # sanitize.ts (ExifTool), photo.ts (sharp), video.ts (ffmpeg), detect.ts
│   └── storage/             # client S3 + Storage API (service role)
├── Dockerfile
└── tests/                   # pe fixtures reale

packages/shared/             # tipuri generate din DB, constante (limite, MIME), coduri de eroare, scheme zod
supabase/
├── config.toml              # Auth: OTP 3600 s, MFA TOTP, SMTP; Storage: bucket-uri
├── migrations/
├── seed.sql
└── tests/rls/               # Vitest: matrice RLS + funcții
fixtures/media/              # HEIC, JPEG cu GPS, MOV HEVC etc.
```

**Structure Decision**: monorepo pnpm cu două aplicații care se livrează separat (web pe
Vercel, worker în container), un pachet `shared` pentru tipurile generate și contractele
comune (coduri de eroare, limite), și directorul `supabase/` pentru schemă, politici și
testele lor. Nu există alte straturi (fără repository/service pattern). Server Actions apelează
direct clientul Supabase și funcțiile SQL.

## Complexity Tracking

| Abatere / complexitate | De ce e necesară | Alternativa mai simplă respinsă pentru că |
| --- | --- | --- |
| Worker separat, containerizat (al doilea serviciu livrabil) | ffmpeg, libvips cu HEIC și ExifTool necesită binare native și rulări de minute; cerut explicit în input | funcțiile Vercel sau Edge Functions au limite de durată și memorie și nu au binarele native |
| Pachet `packages/shared` | web și worker folosesc aceleași tipuri generate, limite și coduri de eroare | duplicarea ar desincroniza limitele (50 MB / 1 GB) între validare și procesare |
| Trimitere de emailuri din worker (nodemailer), pe lângă emailurile Supabase Auth | avertizările de retenție (FR-045) nu sunt emailuri de autentificare; Supabase Auth nu trimite emailuri arbitrare | Edge Function + API HTTP Resend ar adăuga un al treilea runtime; trimiterea din Vercel ar cere un cron HTTP public; worker-ul are deja coada și rulează continuu |
| Păstrarea datelor de facturare 3 ani după expirare (principiul II cere ștergerea „datelor asociate”) | prețul, organizatorul și istoricul sunt necesare facturării și disputelor (termen general de prescripție 3 ani); datele invitaților și media se șterg la expirare, fără excepție | ștergerea imediată ar lăsa adminul fără dovada prețului convenit; păstrarea nelimitată ar încălca principiul II — anonimizarea automată la 3 ani (FR-047) închide intervalul |
| Istoric de retenție (`event_retention_changes`) | FR-043: administratorul facturează pe baza prețului final și trebuie să vadă cine l-a schimbat | un singur câmp de preț pe eveniment pierde urma prelungirilor făcute de organizator (dispute de facturare) |
| Service role în aplicația web (doar pe server) | tokenurile de upload semnate și crearea utilizatorilor organizator necesită drepturi de service | sesiunile anonime nu funcționează cu IP-ul partajat de la eveniment (R3); fără service role, crearea utilizatorilor ar cere înregistrare publică |

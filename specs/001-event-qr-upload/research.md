# Research: Bucla de bază — eveniment, cod QR, upload invitați, galerie organizator

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data**: 2026-09-24

Fiecare secțiune: **Decizie** / **Justificare** / **Alternative evaluate**. Versiunile au fost
verificate în registrul npm și pe nodejs.org la 2026-09-24.

---

## R1. Versiuni fixate (baseline constituție)

| Componentă | Versiune fixată | Observații |
| --- | --- | --- |
| Node.js | 24.21.0 (LTS „Krypton”) | Mediul local rulează 26.3.0 (Current, nu LTS) → se fixează 24 prin `.nvmrc` + `engines` + `packageManager`; migrarea la 26 după ce devine Active LTS (octombrie 2026) |
| pnpm | 12.6.0 | fixat în `packageManager` (Corepack) |
| next | 16.3.6 | App Router |
| react / react-dom | 19.3.0 | |
| tailwindcss | 4.3.3 | |
| typescript (type-check) | 7.0.2 | instalat sub alias `typescript-7` (vezi R2) |
| typescript (API programatic) | 6.0.3 | pachetul `typescript` rezolvat de unelte; `typescript-eslint` cere `>=4.8.4 <6.1.0` |
| typescript-eslint / eslint | 8.70.1 / 10.11.0 | |
| @supabase/supabase-js | 2.117.1 | |
| @supabase/ssr | 0.12.7 | integrarea oficială SSR; versiune 0.x dar fără tag de pre-release (stabilă conform politicii npm a proiectului Supabase) |
| supabase (CLI) | 2.117.0 | migrații, tipuri generate, instanță locală |
| tus-js-client | 4.3.1 | upload reluabil |
| sharp | 0.35.4 | construit pe libvips din sistem în worker (vezi R5) |
| exiftool-vendored | 38.1.2 | curățare metadate fără re-encodare (R6) |
| qrcode | 1.5.4 | QR PNG/SVG pe server |
| yazl | 3.3.1 | ZIP în streaming, ZIP64 (R9) |
| @aws-sdk/client-s3 / lib-storage | 3.1139.0 | upload multipart în streaming către Storage (R9) |
| file-type | 22.1.1 | detectarea tipului real din magic bytes |
| zod | 4.6.5 | validarea intrărilor Server Actions |
| react-aria-components | 1.21.1 | primitive headless accesibile (R12) |
| vitest | 5.0.1 | |
| @playwright/test | 1.63.0 | |
| @sentry/nextjs / @sentry/node | 11.0.0 | regiunea de date UE (R14) |
| pino | 10.3.1 | loguri structurate în worker |
| otpauth | 9.5.2 | doar în teste e2e (generare cod TOTP) |
| nodemailer / @types/nodemailer | 10.0.10 / 8.0.2 | doar în worker: emailuri de avertizare retenție prin SMTP Resend UE (R17) |
| pg / @types/pg | 8.23.0 / 8.23.1 | MIT; release 2026-08; doar în worker (fără impact pe bundle): conexiune Postgres directă pentru `pgmq.read`/`set_vt`/`archive` în aceeași sesiune — supabase-js expune pgmq doar prin RPC pe o schemă publică, ceea ce ar lărgi suprafața API; alternativa `postgres` (porsager) e validă, `pg` e mai răspândit |
| server-only | 0.0.1 | MIT; pachet-marker al echipei React, fără cod la runtime; nemodificat din 2022 pentru că nu are ce întreține; face build-ul să eșueze dacă un modul server ajunge în client (principiul III) |
| @axe-core/playwright | 4.13.0 | MPL-2.0 (doar devDependency, nedistribuit); release 2026-09; verificări WCAG 2.2 AA în e2e (principiul VIII) |
| k6 | 2.3.0 (binar, imaginea `grafana/k6:2.3.0`) | AGPL-3.0, rulat doar ca unealtă de test pe preview, nu e dependență a aplicației și nu se distribuie; release 2026-09-21 |
| ~~node-gyp / node-addon-api~~ | — | eliminate la implementare: `sharp` nu se mai compilează (R5 revizuit) |

Excluse explicit: `@lhci/cli` (ultimul release 0.15.1 din 2025-06 — mentenanță insuficientă;
LCP-ul se măsoară cu Playwright, vezi R16); `fluent-ffmpeg` (marcat „no longer supported” pe npm) → worker-ul apelează
binarul `ffmpeg` direct prin `child_process.spawn`; `@base-ui-components/react` (doar `1.0.0-rc.0`).

Politica: versiuni exacte (fără `^`/`~`) în `package.json`, `pnpm-lock.yaml` comis,
Renovate/Dependabot pentru patch-uri de securitate (termen 7 zile, constituție).

---

## R2. TypeScript 7.0 + TypeScript 6.0 în paralel

**Decizie**: `typescript@6.0.3` rămâne pachetul `typescript` (rezolvat de `typescript-eslint`,
Next.js și alte unelte); `typescript-7` = `npm:typescript@7.0.2` rulează type-check-ul
(`pnpm typecheck` apelează explicit binarul din `node_modules/typescript-7`). CI rulează
ambele: type-check cu 7.0, lint type-aware cu 6.0. La TypeScript 7.1 se elimină 6.0 (constituție).

**Justificare**: `typescript-eslint@8.70.1` declară peer `typescript >=4.8.4 <6.1.0`; API-ul
programatic nu e disponibil pentru 7.0. Aliasul evită conflictul de nume de pachet.

**Alternative**: doar 7.0 (rupe lint-ul type-aware); doar 6.0 (încalcă baseline-ul).

**De verificat la implementare**: calea exactă a binarului `tsc` în pachetul 7.0.2 (distribuție
nativă cu dependențe opționale per platformă) și că ambele binare `tsc` nu intră în conflict
în `node_modules/.bin` (scriptul folosește calea completă).

---

## R3. Uploadul invitaților: sesiune anonimă Supabase vs. token de upload semnat emis de server

Cerința utilizatorului: evaluarea explicită a celor două abordări, cu upload reluabil (TUS).

Fapte verificate în documentația Supabase:
- TUS funcționează cu JWT de utilizator (`Authorization: Bearer`) **și** cu token de upload
  semnat (`x-signature`); chunk fix de 6 MB; URL-ul de upload TUS e valabil până la 24 h.
- Sesiunile anonime au rate limit implicit **30/oră per IP** (configurabil); Supabase
  „recomandă insistent” CAPTCHA invizibil / Turnstile pentru sesiunile anonime; utilizatorii
  anonimi folosesc rolul `authenticated`, deci toate politicile RLS existente trebuie verificate
  cu claim-ul `is_anonymous`.

| Criteriu | Sesiune anonimă + RLS | Token semnat emis de server |
| --- | --- | --- |
| Upload reluabil TUS | Da, dar JWT-ul expiră (implicit 1 h) → reîmprospătare în `onBeforeRequest` în timpul uploadurilor lungi | Da; tokenul semnat e valabil 2 h per fișier, suficient pentru 1 GB pe 4G lent (~30 min la 5 Mbps) |
| Invitați în spatele aceluiași IP (Wi-Fi-ul sălii, NAT operator) | Limita per IP (30/h) blochează nunți cu 200 de invitați; trebuie ridicată global | Nu depinde de IP; rate limit per invitat și per eveniment în Postgres |
| CAPTCHA | Recomandat (fricțiune + terț non-UE: Cloudflare) | Nu e necesar; tokenul evenimentului + limitele per sesiune sunt controlul |
| Unde trăiesc regulile (fereastră, limite, tip, dimensiune declarată) | În politici RLS pe `storage.objects` + funcții SQL; greu de testat și de dat mesaje clare (FR-020) | O singură funcție SQL tranzacțională `reserve_upload` apelată de server + mesaje clare în Server Action |
| Suprafața de atac | Orice invitat are JWT `authenticated` → orice politică scrisă greșit expune date | Invitatul nu are niciun JWT; nu poate citi nimic din baza de date sau Storage |
| Secrete | Niciunul pe server pentru upload | Cheia service role doar pe server (Vercel env, `server-only`) |

**Decizie**: **token de upload semnat emis de server** (abatere de la varianta propusă în
input, justificată mai jos; **acceptată de utilizator la 2026-09-24**). Fluxul:

1. Invitatul deschide `/e/{token}`; Server Component validează tokenul și fereastra de upload.
2. La primul upload, Server Action `startGuestSession` creează `guest_sessions` (id aleator
   128 biți) și setează cookie `httpOnly`, `Secure`, `SameSite=Lax`, cu path `/e/{token}`,
   durata = sfârșitul ferestrei + 15 min → identitate per dispozitiv/browser (FR-018).
3. Pentru fiecare fișier, Server Action `reserveUpload` apelează funcția SQL `reserve_upload`
   (tranzacție + `SELECT … FOR UPDATE` pe sesiune): verifică fereastra, tipul declarat,
   dimensiunea declarată față de limita per tip, limita de fișiere, rate limit; inserează
   `media_items` cu `status = 'reserved'` și cale unică; apoi `createSignedUploadUrl` pentru
   bucket-ul `incoming`.
4. Browserul încarcă prin TUS (`tus-js-client`, `x-signature`) direct în Storage — fișierul nu
   trece prin Vercel (principiul IV).
5. Finalizarea uploadului inserează rândul în `storage.objects` → trigger → `status =
   'uploaded'` + mesaj în coadă (R7).

**Justificare**: rezolvă problema IP-ului partajat de la eveniment (cel mai probabil scenariu de
eșec pentru SC-006), elimină CAPTCHA-ul (principiul I), păstrează toată logica de admitere
într-un singur loc testabil (principiul VI) și nu dă invitaților niciun acces de citire
(FR-022, principiul III). Costul: un apel Server Action mic (JSON) per fișier — nu transportă
fișierul, deci principiul IV e respectat.

**Alternative evaluate**: sesiune anonimă + RLS (vezi tabel); upload prin Route Handler
(încalcă principiul IV); URL-uri S3 presemnate (nu sunt reluabile fără multipart manual).

---

## R4. Autentificare organizator și administrator

**Decizie**:
- Magic link Supabase Auth (`signInWithOtp` cu `shouldCreateUser: false`) prin `@supabase/ssr`,
  cookies HTTP-only, `proxy.ts` (fostul middleware) care reîmprospătează sesiunea.
- Utilizatorul Auth al organizatorului se creează de server (service role,
  `auth.admin.createUser`, email confirmat, fără email trimis) la crearea/modificarea
  evenimentului, dacă nu există.
- Server Action de login întoarce **întotdeauna** același mesaj („Dacă adresa are acces, vei
  primi un email”), indiferent dacă adresa există (spec, cazuri limită).
- Link valabil 1 oră, de unică folosință (setare `mailer_otp_exp = 3600`).
- Administrator: tabel `platform_admins(user_id)` populat manual (seed/SQL); MFA TOTP Supabase
  obligatoriu; toate politicile și funcțiile de administrare cer `auth.jwt()->>'aal' = 'aal2'`
  și apartenența la `platform_admins` (FR-006a). UI-ul de administrare redirecționează la
  înrolare/verificare TOTP dacă sesiunea e `aal1`.
- Rolul organizator: acces la evenimentele unde `lower(events.organizer_email) =
  lower(auth.jwt()->>'email')` — derivat din baza de date, nu din client; schimbarea emailului
  de către administrator revocă imediat accesul vechiului organizator.
- SMTP: Resend cu regiunea de trimitere `eu-west-1` (Irlanda), configurat ca SMTP personalizat
  în Supabase Auth. Alternativă UE nativă: Brevo (FR).

**Alternative**: parole (contrar cerinței „fără parolă”); roluri în `app_metadata` setate de
client (interzis); legare prin `user_id` în `events` (complică schimbarea emailului).

---

## R5. Decodare HEIC în worker

**Fapt**: binarele precompilate `sharp` includ libheif doar pentru AVIF; decodarea HEIC (HEVC)
lipsește din motive de licențiere a brevetelor HEVC.

**Decizie (revizuită la implementare, 2026-09-24)**: imaginea Docker a worker-ului (Debian 13
„trixie”) instalează `libheif-examples` + `libheif-plugin-libde265` (libheif 1.19) și `ffmpeg`.
Pozele HEIC/HEIF se decodează cu `heif-dec` într-un PNG temporar fără pierderi, iar `sharp`
(binarul precompilat) produce din el variantele WebP, ca pentru orice altă poză. Originalul HEIC
curățat de metadate rămâne pentru descărcare. Testul de fum din CI decodează
`fixtures/media/iphone.heic` în imaginea construită și eșuează dacă `heif-dec` lipsește sau
decodarea nu produce o imagine validă.

**De ce s-a schimbat**: decizia inițială (compilarea `sharp` pe libvips-ul sistemului) nu e
realizabilă: `sharp` 0.35.4 cere libvips ≥ 8.18.6, iar Debian 13 livrează libvips 8.16.1.
Compilarea libvips 8.18 din surse în imagine ar adăuga un lanț de build fragil (meson, zeci de
biblioteci) doar pentru HEIC.

**Justificare**: `heif-dec` e decodorul de referință al libheif (suportă grilele de tile-uri ale
iPhone-ului); libde265 e LGPL, legat dinamic; imaginea nu mai are nevoie de unelte de
compilare. Cost: un proces și un fișier temporar în plus per poză HEIC (~1 s pentru 12 MP).

**Alternative**: compilarea libvips 8.18 din surse (build lung și fragil); `sharp` mai vechi
compatibil cu libvips 8.16 (versiuni depășite); `heic-convert` / libheif WASM (5–10× mai lent,
memorie mare pentru poze de 50 MB); `ffmpeg` pentru HEIC (suport inconsistent pentru grile de
tile-uri); conversie în browser (costă baterie și încalcă „fără fricțiune”).

---

## R6. Eliminarea metadatelor fără re-encodare

**Decizie**: `exiftool-vendored` (ExifTool în proces persistent) pe fișierul original,
scriind o **copie curățată** în bucket-ul `media`:
- Poze (JPEG/PNG/WebP/HEIC): se șterg toate metadatele, apoi se re-copiază doar
  `Orientation` și profilul ICC (`-all= -tagsFromFile @ -Orientation -ICC_Profile`) → fără
  GPS, fără serial de dispozitiv, fără re-encodare a pixelilor.
- Video (MP4/MOV): se elimină grupurile de locație QuickTime/XMP
  (`-GPS*=`, `-Keys:GPSCoordinates=`, `-UserData:GPSCoordinates=`,
  `-XMP:all=`, `-ItemList:all=` etc.) fără remuxare.
- Verificare automată după scriere: re-citirea cu ExifTool nu trebuie să conțină niciun tag
  din grupurile GPS/locație; altfel fișierul trece în `failed` (SC-009 = 0 fișiere cu locație).
- Originalul brut (cu GPS) rămâne doar în bucket-ul `incoming`, fără nicio politică de citire,
  și e șters imediat după procesare reușită.

**Alternative**: sharp re-encodare (pierde calitate — interzis de input); ffmpeg `-map_metadata
-1` pentru video (remuxare, risc de pierdere a rotației).

---

## R7. Coada de procesare

**Decizie**: Supabase Queues (`pgmq`), coada `media_jobs`. Trigger `AFTER INSERT` pe
`storage.objects` (doar `bucket_id = 'incoming'`) → funcție `SECURITY DEFINER` care marchează
`media_items.status = 'uploaded'`, salvează dimensiunea reală și trimite `{media_id}` în coadă.
Worker-ul citește cu `pgmq.read(visibility_timeout)`, iar la succes face `pgmq.archive`.
Reîncercări: la eșec mesajul redevine vizibil; după `read_ct > 5` → `status = 'failed'` +
`processing_error`. Aceeași coadă transportă joburile `build_archive` și `purge_event`.

**Justificare**: fără serviciu de coadă suplimentar (principiul VII); tranzacțional cu datele.

**Alternative**: Storage webhooks → HTTP (necesită endpoint public pe worker); Redis/BullMQ
(serviciu în plus); Edge Functions (limite de timp/memorie incompatibile cu ffmpeg).

---

## R8. Variante media

**Decizie**:
- Poze: miniatură 400 px (latura lungă) și variantă de afișare 2048 px, ambele **WebP**
  (calitate 80), cu rotația aplicată. AVIF amânat: codare de 5–10× mai lentă, câștig
  nesemnificativ la miniaturi (YAGNI; se reevaluează după măsurători).
- HEIC: variantele WebP de mai sus sunt versiunea vizualizabilă (FR-024); originalul HEIC
  curățat rămâne pentru descărcare.
- Video (clarificarea Q1 = A, **mai mult decât** „cadru poster” din input): `ffmpeg` produce
  (a) poster WebP din cadrul de la 1 s, (b) versiune de redare H.264 High / AAC, MP4 cu
  `+faststart`, max 1080p, CRF 23, rotația aplicată — compatibilă cu toate browserele moderne
  (FR-026a, SC-008a). Originalul curățat rămâne pentru descărcare.
- Detectarea tipului real: `file-type` pe primii 4 KB; nepotrivire cu lista permisă sau cu tipul
  declarat → `status = 'rejected'`, obiect șters, motiv salvat.

---

## R9. Descărcarea în masă (ZIP)

**Decizie**: job `build_archive` în worker: `yazl` (ZIP64, metoda STORE — media e deja
comprimată) citește în streaming fiecare fișier curățat prin S3 `GetObject` și scrie arhiva în
streaming prin S3 multipart upload (`@aws-sdk/lib-storage`) în bucket-ul `archives`. Nicio
arhivă completă în memorie sau pe disc (constituția, principiul IV). Stare în `archive_jobs`;
galeria primește actualizarea prin Realtime și afișează linkul semnat (15 min, cu nume de
fișier `download`). Arhivele expiră după 24 h (pg_cron → job de ștergere). Orice ștergere de
fișier din eveniment invalidează și șterge arhivele existente ale evenimentului (FR-032).
Nume în arhivă: `AAAA-LL-ZZ_HH-MM-SS_{nume-invitat|anonim}_{id-scurt}.{ext}` (unice).
Arhiva include doar fișierele `ready` (inclusiv cele fără previzualizare); cele `uploaded`,
`processing` sau `failed` (curățarea metadatelor a eșuat — nu pot fi servite, principiul II) se
numără în `archive_jobs.skipped_count` și se afișează lângă link (FR-030). Anularea arhivei la
ștergerea unui fișier e comportamentul specificat (spec, cazuri limită).

**Conflict cu specificația — rezolvat (2026-09-24)**: SC-010 cerea ca descărcarea pentru
1.000 de fișiere să înceapă în sub 10 secunde de la cerere, imposibil de garantat cu arhiva
pregătită asincron. SC-010 a fost amendat conform propunerii: arhiva pentru 1.000 de fișiere
(≈ 10 GB) e gata în ≤ 15 minute, organizatorul e anunțat în galerie prin Realtime, iar
descărcarea începe în < 10 s de la apăsarea linkului (URL semnat servit direct din Storage/CDN).
Buget: STORE fără recomprimare, transfer intern S3 → worker → S3 la ≥ 25 MB/s ≈ 7 minute
pentru 10 GB, deci marjă de ~2× față de 15 minute. Verificare: test de performanță pe preview
cu 1.000 de fișiere sintetice (vezi quickstart).

**Alternative**: ZIP în streaming direct din Route Handler Vercel (limite de durată/lățime de
bandă, interzis în input); endpoint de streaming expus public pe worker (respectă SC-010 dar
adaugă suprafață publică și autentificare pe worker); `archiver@8` (API mai greu, dependențe
multe; `yazl` e mic și are ZIP64 nativ).

---

## R10. Timp real în galeria organizatorului

**Decizie**: Supabase Realtime `postgres_changes` pe `media_items` (INSERT/UPDATE/DELETE),
filtrat `event_id=eq.{id}`; RLS se aplică per abonat. La `SUBSCRIBED` după o reconectare,
galeria cere diferența de la ultimul `updated_at` văzut și face merge după `id` (fără
duplicate, FR-033). Elementele apar la `uploaded` cu placeholder „în procesare” și se
actualizează la `ready`.

**Justificare**: puțini abonați (un organizator); Broadcast from Database ar fi preferat doar
pentru ecranul live (în afara scopului).

**Constatare la implementare (2026-09-24)**: clientul din browser (`@supabase/ssr`) își încarcă
sesiunea din cookies asincron. Un canal abonat înainte de încărcare rulează ca `anon`, iar
Realtime respinge filtrul pe `event_id` (rolul `anon` nu are drept de citire pe coloană) cu
„Unable to subscribe to changes”. Soluție: `supabase.realtime.setAuth(access_token)` înainte de
`subscribe()` (`apps/web/lib/realtime/auth.ts`). Resincronizarea se face și la evenimentul
`online` al browserului, nu doar la re-abonare.

---

## R11. Ștergere definitivă

**Decizie**:
- Ștergere de fișiere (organizator): Server Action → funcție SQL care marchează rândurile
  `deleting` (dispar imediat din galerie și din arhive noi), apoi Storage API `remove()` pe
  toate căile (original, afișare, miniatură, poster, redare) cu clientul organizatorului
  (politică RLS `DELETE` pe `storage.objects` pentru bucket-ul `media` limitată la evenimentele
  lui), apoi ștergerea rândurilor. Arhivele evenimentului se șterg. Eșecul parțial → rândul
  rămâne `deleting` și un job de reconciliere în worker reîncearcă.
- Nu se șterge niciodată prin SQL direct din `storage.objects` (Supabase blochează această cale;
  fișierul fizic ar rămâne).
- Ștergere eveniment (administrator, FR-006b): Server Action marchează evenimentul
  `deleting` (linkul devine invalid imediat) și trimite `purge_event`; worker-ul (service role)
  golește toate prefixele evenimentului din `incoming`, `media`, `archives`, apoi șterge
  rândurile în cascadă. Administratorul nu obține niciodată acces de citire la media (FR-007).
- CDN: ștergerea invalidează cache-ul pentru toate tokenurile, cu propagare de până la 60 s
  (documentat). URL-urile semnate au expirare de 15 min. **SC-011 se verifică după 60 s de la
  ștergere**; se consemnează în quickstart.
- **Backup-uri**: ștergerea din aplicație e imediată, dar backup-urile zilnice ale bazei de date
  (Supabase Pro, păstrate 7 zile, regiunea `eu-central-1`) conțin rândurile șterse — inclusiv
  `guest_sessions.display_name` și `media_items.guest_name` — până la rotirea lor. Fișierele din
  Storage nu fac parte din backup-urile bazei de date, deci o ștergere de fișier e definitivă
  imediat. PITR rămâne **dezactivat** (ar extinde fereastra de restaurare). Ștergerea completă a
  datelor unei persoane are loc deci în cel mult 7 zile de la ștergerea din aplicație; termenul
  se menționează în nota de informare (FR-012). **De verificat la implementare**: durata curentă
  de păstrare a backup-urilor și faptul că Storage nu e inclus, în documentația Supabase.

---

## R12. UI, accesibilitate și localizare

**Decizie**:
- Pagina invitatului: Server Component + un singur Client Component mic; `tus-js-client` se
  încarcă dinamic doar după selectarea fișierelor → JS inițial minim, LCP < 2,5 s pe 4G.
  Butoanele principale în treimea de jos a ecranului, ținte ≥ 44×44 px (FR-036).
  `<input type="file" multiple accept="image/*,video/*">` + buton separat cu `capture` pentru
  cameră.
- Zonele organizator și administrator: `react-aria-components` (Adobe, Apache-2.0, stabil,
  WCAG testat) pentru dialog de confirmare, grilă selectabilă, toasts — importuri granulare.
- Localizare fără dependență: dicționar tipat `messages/ro.ts` + funcție `t()` cu
  `Intl.PluralRules('ro')` (formele românești „1 fișier / 2 fișiere / 20 de fișiere”);
  structura cheilor permite `en.ts` ulterior (principiul VIII, VII).

**Alternative**: Radix Primitives (mentenanță mai lentă); Base UI (`@base-ui/react@1.8.0`
stabil, alternativă validă, dar mai puțin matur pe grile selectabile); `next-intl` (dependență
nejustificată pentru o singură limbă).

---

## R13. Rate limiting

**Decizie** (în Postgres, tabel `rate_limit_counters` cu fereastră fixă, verificat în funcții
SQL `SECURITY DEFINER`):
- `startGuestSession`: max 300 sesiuni noi/min per eveniment + max 300/min per hash(IP, sare
  zilnică) — IP-ul nu se stochează în clar.
- `reserveUpload`: max 30 rezervări/min per sesiune, max 2000/min per eveniment.
- **Revizuit la implementare (2026-09-24)**: valorile inițiale (20 sesiuni/min per eveniment,
  5/min per IP, 600 rezervări/min per eveniment) ar fi blocat chiar scenariul din SC-006 —
  200 de invitați pe Wi-Fi-ul sălii (același IP) care scanează codul în același minut, cu câte
  5 fișiere. Limitele per IP și per eveniment opresc acum doar abuzul evident; limita per
  sesiune (30/min) rămâne protecția principală.
- Reselectarea după reîncărcarea paginii (FR-016a) reia rezervarea nefinalizată
  (`p_replace_media_id`), fără să consume din nou limita de fișiere.
- Login magic link: limitele native Supabase Auth + max 5/oră per adresă în Server Action.
- Depășire → mesaj clar în română („Prea multe încercări, reîncearcă în X secunde”).

---

## R14. Observabilitate

**Decizie**: Sentry (organizație în regiunea de date UE, Frankfurt) pentru aplicație și
worker, `sendDefaultPii: false`, `beforeSend` care elimină emailuri, nume de invitați, tokenuri
de eveniment și căi de fișiere. Worker: `pino` JSON cu `media_id`, `event_id`, `job`,
`duration_ms`, `status` — fără conținut personal.

---

## R15. Găzduire

**Decizie**:
- Supabase: regiunea `eu-central-1` (Frankfurt), plan Pro (Smart CDN, backup-uri zilnice
  păstrate 7 zile; PITR dezactivat — vezi R11).
- Vercel: regiunea funcțiilor `fra1`; variabilele secrete doar în mediul server.
- Worker: Scaleway Serverless Containers, regiunea `fr-par`, `min-scale = 1` (proces
  persistent de polling), 2 vCPU / 4 GB (ffmpeg); furnizor UE nativ. Alternativă: Hetzner Cloud
  (DE) cu Docker pe VM.
- Medii: local (Supabase CLI + `pnpm dev` + worker local), preview (proiect Supabase separat
  sau Supabase Branching + Vercel Preview), producție.

**Notă GDPR**: Vercel, Supabase, Resend și Sentry sunt procesatori cu sediul în SUA, cu date în
UE; necesită DPA și listarea în nota de informare (FR-012).

---

## R16. Testare

**Decizie**:
- Vitest (unit): validări, calculul limitelor, denumirea în arhivă, pluralizare, mapări de erori.
- Vitest (integrare, Supabase local): politici RLS pentru fiecare rol (anon, organizator A/B,
  administrator aal1/aal2), funcțiile `reserve_upload`, `delete_media`, rate limits.
- Worker: teste pe fișiere reale din `fixtures/` (HEIC iPhone, JPEG cu GPS, MOV HEVC cu
  locație) care verifică absența locației și redarea H.264.
- Playwright: proiecte `desktop-chromium`, `mobile-chrome` (Pixel 7), `mobile-safari`
  (iPhone 15, WebKit). Emailurile de login se citesc din Mailpit-ul Supabase local — **fără
  emailuri reale în teste**. Reluarea după întrerupere: `context.setOffline(true/false)` în
  timpul uploadului unui fișier de 50 MB. TOTP generat cu `otpauth` din secretul seed-uit.
- LCP (principiul I, SC-002): test Playwright `lcp.spec.ts` pe proiectul `mobile-chrome`, cu
  CDP `Network.emulateNetworkConditions` (profilul „Slow 4G” al Lighthouse: RTT 150 ms, 1,6 Mbps
  down, 750 kbps up) și `Emulation.setCPUThrottlingRate(4)`, pe build-ul de producție
  (`next start`); LCP citit cu `PerformanceObserver('largest-contentful-paint')`, prag 2 500 ms,
  median din 3 rulări. Face parte din `test:e2e`, deci blochează merge-ul de la primul PR, fără
  dependență nouă (Lighthouse CI a fost exclus, R1).
- GitHub Actions: `lint` → `typecheck` → `test:unit` → `test:db` (Supabase local) →
  `test:e2e` → build imagine worker + test de fum HEIC; branch protection cere toate verificările.
- **Limitări constatate la implementare**:
  - Chromium din Playwright nu include codecul H.264: e2e verifică sursa `playback.mp4` și
    posterul, iar codecul e verificat în testul worker-ului (ffprobe). Redarea efectivă se
    confirmă manual pe browsere reale (quickstart 10).
  - Testele media ale worker-ului rulează în imaginea Docker (au nevoie de `heif-dec`, ffmpeg,
    ExifTool pe Linux); pe Windows rulează doar testele fără decodare HEIC.
  - Reluarea după o cădere de rețea în mijlocul uploadului se testează doar pe Chromium (rețeaua
    se încetinește prin CDP; local, uploadul e prea rapid pentru a fi întrerupt).
  - Fixture-urile media sunt sintetice (ffmpeg/libheif); fișierele de pe telefoane reale se
    verifică manual înainte de producție (fixtures/media/README.md).

---

## R17. Retenție configurabilă și preț

Context: completarea din 2026-09-24 (spec, Clarifications; FR-038–FR-047, US8).

**Decizie**:
- **Catalog**: tabel `retention_options(months, surcharge_minor, active)`, gestionat de
  administrator. Sumele se stochează ca **întregi în bani** (`bigint`, 1 leu = 100 bani), niciodată
  `numeric`/`float` în TypeScript; formatarea cu `Intl.NumberFormat('ro-RO', { style: 'currency',
  currency: 'RON' })` în dicționarul i18n (FR-046). Seed (decizia utilizatorului, 2026-09-24):
  3 luni cu supliment 0 (opțiunea implicită la crearea evenimentului), **6 luni +49 lei
  (4 900 bani)**, **12 luni +99 lei (9 900 bani)**; fără opțiune de 1 lună. Reperul de piață:
  Keepitcloud 239 lei cu 12 luni incluse și prelungire 99 lei/an; SnapQR 299 lei (6 luni) /
  549 lei (12 luni); QR Stories 50 € (30 de zile) / 80 € (90 de zile) — prețuri publice
  verificate la 2026-09-24. Preț de bază orientativ: 249–299 lei.
- **Snapshot pe eveniment**: `events` păstrează `retention_option_id`, `retention_months`,
  `retention_surcharge_minor` și `base_price_minor`; prețul final este coloană generată
  `final_price_minor = base_price_minor + retention_surcharge_minor`. Schimbarea prețului în
  catalog nu afectează evenimentele existente (US8, scenariul 6).
- **Data ștergerii**: `purge_at = upload_ends_at + make_interval(months => retention_months)`,
  setată de un trigger `BEFORE INSERT OR UPDATE` (nu coloană generată: adunarea de luni la
  `timestamptz` depinde de fusul orar, deci nu e `IMMUTABLE`). Trigger-ul rulează cu
  `SET timezone = 'Europe/Bucharest'`, ca „+1 lună” să cadă în aceeași zi calendaristică
  locală. La UPDATE refuză rezultatul `purge_at <= now()` (spec, cazuri limită).
- **Prelungire de către organizator**: doar prin funcția `extend_retention(event_id, option_id)`
  (`SECURITY DEFINER`, verifică proprietatea prin email-ul din JWT), care blochează rândul
  (`FOR UPDATE`), cere `status = 'active'`, `now() < purge_at`, opțiune activă și
  `months > retention_months`; scrie snapshot-ul nou și un rând în
  `event_retention_changes`. Organizatorul nu are UPDATE direct pe `events` (RLS). Serverul
  trimite și `expected_final_price_minor` afișat în confirmare; dacă diferă (catalog modificat
  între timp) funcția refuză cu `PRICE_CHANGED`, ca organizatorul să nu confirme alt preț decât
  cel văzut.
- **Concurență cu expirarea**: `expire_due_events` (pg_cron) și `extend_retention` iau același
  lock pe rând; expirarea trece evenimentul în `expiring` în aceeași tranzacție în care
  verifică `purge_at <= now()`, iar `extend_retention` refuză orice stare ≠ `active` cu
  `RETENTION_EXPIRED` (spec, cazuri limită).
- **Expirare**: `pg_cron` orar → `expire_due_events()` → `status = 'expiring'`, arhivele
  `pending/building/ready` → `expired`, `pgmq.send({type:'expire_event'})`. Worker-ul refolosește
  golirea prefixelor din `purge_event` (incoming, media, archives), apoi șterge `media_items`,
  `archive_jobs`, `guest_sessions` și setează `status = 'expired'`, `expired_at`; **rândul
  evenimentului rămâne** (nume, dată, email, preț, istoric) pentru facturare (FR-044).
  `public_token` se înlocuiește cu o valoare aleatoare nouă, deci linkul și codul QR vechi dau
  `not_found`. Cron orar + reîncercări pgmq → ștergere completă cu mult sub pragul de 24 h
  (SC-014).
- **Avertizări**: tabelul `retention_notices` cu cheie unică `(event_id, threshold, purge_at)`.
  `pg_cron` orar → `enqueue_retention_notices()` alege, pentru evenimentele `active` cu
  `now() >= purge_at - 30 days`, pragul aplicabil = cel mai apropiat de `purge_at` dintre cele
  depășite (`1d` dacă `now() >= purge_at - 1 day`, altfel `7d` dacă `now() >= purge_at - 7 days`,
  altfel `30d`; ex. un eveniment prelungit când mai are 5 zile primește doar `7d`), face
  `INSERT … ON CONFLICT DO NOTHING` și pune un job `retention_notice` în coadă **doar** pentru
  rândurile nou inserate. Cheia conține valoarea `purge_at`, deci o prelungire reînarmează
  automat avertizările pentru noua dată, iar cele pentru data veche nu se mai trimit (worker-ul
  sare peste un job al cărui `purge_at` diferă de cel curent al evenimentului) (FR-045, SC-015).
  Worker-ul trimite prin `nodemailer` pe SMTP-ul Resend (`eu-west-1`, același cont ca Auth —
  R4), sare peste rândurile cu `sent_at` deja setat și setează `sent_at` imediat după accept-ul
  SMTP, înainte de `pgmq.archive`. Un email dublu e posibil doar la un crash exact între
  accept și update (acceptat). La eșec SMTP mesajul rămâne în coadă; după 5 eșecuri rândul
  primește `failed_at` și se loghează fără adresa destinatarului (R14).
- **Anonimizare după 3 ani (FR-047)**: `pg_cron` zilnic → `anonymize_expired_events(p_now)`:
  pentru `expired` cu `expired_at < p_now - interval '3 years'` setează `name = NULL`,
  `organizer_email = NULL`, `anonymized_at = p_now`, iar în `event_retention_changes`
  `actor_user_id = NULL`. Coloanele `name`/`organizer_email` devin nullable cu
  `CHECK (anonymized_at IS NOT NULL OR (name IS NOT NULL AND organizer_email IS NOT NULL))`.
  Funcția `orphan_organizer_user_id(email)` întoarce utilizatorul Auth cu acel email dacă nu mai
  e referit de niciun eveniment și nu e în `platform_admins`; pentru el se trimite jobul
  `delete_organizer_user {user_id}` (fără email în coadă), iar worker-ul apelează
  `auth.admin.deleteUser` după o re-verificare. Același job se trimite după `purge_event`.
  Termenul de 3 ani = termenul general de prescripție (Codul civil, art. 2517), ales de
  utilizator la 2026-09-24; factura oficială se păstrează în contabilitate, în afara aplicației.
- **Istoric**: `event_retention_changes` (append-only; nici organizatorul, nici adminul nu au
  UPDATE/DELETE) cu `actor_kind` (`admin`/`organizer`/`system`), `actor_user_id`, opțiunea și
  prețul final înainte/după. Adminul îl vede; organizatorul nu (nu e necesar).

**Justificare**: toate regulile de preț și de dată stau în Postgres, lângă RLS, deci UI-ul
nu poate ocoli „doar prelungire”; fără serviciu nou (pg_cron + pgmq + worker existente);
păstrarea rândului de facturare separă ștergerea datelor personale ale invitaților (obligatorie)
de evidența comercială a clientului (bază legală: executarea contractului).

**Alternative evaluate**:
- Preț calculat din catalogul curent la afișare → se schimbă retroactiv; respins.
- Ștergerea completă a evenimentului la expirare (refolosire `purge_event` integral) → pierde
  datele de facturare; respins.
- Durată liberă în zile în loc de catalog → spec cere opțiuni predefinite cu supliment fix.
- Trimiterea emailurilor dintr-un Route Handler Vercel apelat de cron → endpoint public
  suplimentar și dependență de Vercel Cron; respins.
- Plăți online (Stripe) → în afara scopului (clarificare).
- `numeric` pentru bani → corect în SQL, dar ajunge ca `string`/`number` în supabase-js;
  întregii în bani sunt simpli și exacți până la ~90 de trilioane de lei.

**Testare**: `test:db` — `extend_retention` (mai scurt/egal refuzat, alt organizator refuzat,
`PRICE_CHANGED`, după expirare refuzat), recalcularea `purge_at` la schimbarea `upload_ends_at`,
`enqueue_retention_notices` (o singură dată per prag, reînarmare după prelungire), `expire_due_events`
cu `now()` controlat (funcțiile primesc `p_now timestamptz default now()` pentru teste).
Worker: `expire_event` pe prefixe populate → prefixe goale, rând `expired`. E2E: emailul de
avertizare citit din Mailpit (SMTP-ul local al worker-ului în dezvoltare/CI) — fără emailuri
reale.

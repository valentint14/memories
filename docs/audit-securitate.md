# Verificări esențiale de securitate: cum stă aplicația

Documentarea celor 20 de verificări de securitate față de codul din repository. Este o **documentare**: nu s-a modificat nimic în aplicație. Pentru fiecare punct: starea, unde se vede în cod și ce rămâne de verificat sau de îmbunătățit.

Verificat pe `main` la `c820b08` (plus branch-ul `feat/lista-cerinte`), prin citirea codului din `apps/web`, `apps/worker`, `supabase/` și `deploy/`. **Nu s-a verificat nimic pe producție**: setările din dashboard-ul Supabase, Cloudflare, Stripe, Sentry și Oracle nu sunt în repository și sunt marcate separat ca „de verificat manual”.

Legendă: ✅ acoperit în cod · ⚠️ parțial sau depinde de o setare din afara codului · ❌ lipsește.

| # | Verificare | Stare |
|---|---|---|
| 1 | Chei API ascunse | ✅ |
| 2 | Variabile de mediu | ✅ |
| 3 | Chei în git | ⚠️ |
| 4 | Rute de admin protejate | ✅ |
| 5 | Autentificare | ✅ |
| 6 | Permisiunile utilizatorilor | ✅ |
| 7 | Validarea intrărilor | ✅ |
| 8 | Protecție XSS | ✅ |
| 9 | Protecție SQL injection | ✅ |
| 10 | Regulile bazei de date | ✅ |
| 11 | Limitare de frecvență | ✅ |
| 12 | Plafon de cheltuieli | ⚠️ |
| 13 | Încărcări de fișiere securizate | ✅ |
| 14 | Protecție CSRF | ✅ |
| 15 | Setări CORS | ✅ |
| 16 | HTTPS | ✅ |
| 17 | Headere de securitate | ✅ |
| 18 | Cookie-uri securizate | ⚠️ |
| 19 | Mod debug oprit | ✅ |
| 20 | Setări de producție | ⚠️ |

Cele 4 puncte ⚠️ (3, 12, 18, 20), plus rezervele de la punctele 11 și 13, sunt strânse în secțiunea „Ce rămâne de făcut” de la final.

## Stare după remedieri

Patru dintre lucrurile găsite au fost rezolvate în cod pe `feat/lista-cerinte`:

- **18 (cookie-uri):** cookie-urile de sesiune Supabase primesc `Secure` când `APP_URL` e HTTPS (`lib/supabase/cookie-options.ts`, folosit în `proxy.ts` și `lib/supabase/server.ts`). `httpOnly` rămâne `false`, cerut de galeria în timp real. Local și în CI (HTTP) opțiunile nu se schimbă.
- **20 (producție):** `cloudflare/cloudflared` e fixat la `2026.10.0` în `deploy/docker-compose.yml`.
- **3 și 20 (dependențe):** `.github/dependabot.yml` propune săptămânal actualizări pentru npm (pnpm), GitHub Actions, Dockerfile-uri și `docker-compose`. Scanarea automată de secrete (gitleaks) și `pnpm audit` în CI nu sunt făcute încă.
- **Imaginile generate (`/icon.png`, `/apple-icon.png`, `/opengraph-image.png`)** nu mai trec prin `proxy.ts`, deci nu mai apelează Supabase Auth la fiecare cerere.

Textele de mai jos descriu starea la momentul auditului.

---

## 1. Chei API ascunse — ✅

- Secretele (`SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SECRET`, `TURNSTILE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) sunt citite doar în `apps/web/lib/server-env.ts`, care importă `server-only`: importul din cod de browser oprește build-ul.
- Singurele variabile `NEXT_PUBLIC_*` sunt `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TURNSTILE_SITE_KEY` și `SENTRY_DSN`. Toate sunt publice prin natura lor (cheia `anon` e limitată de RLS, cheia de site Turnstile și DSN-ul Sentry sunt făcute pentru browser).
- Testul `apps/web/tests/unit/no-secrets-in-client.test.ts` face `next build` și caută în tot `.next/static` numele și valorile secretelor. Dacă apare unul, CI pică.
- Cheia `service role` e folosită doar server-side (`lib/supabase/admin.ts`).

## 2. Variabile de mediu — ✅

- `lib/env.ts` și `lib/server-env.ts` aruncă eroare la pornire dacă lipsește o variabilă obligatorie (`required()`), deci aplicația nu pornește pe jumătate configurată.
- Exemplele sunt în `apps/web/.env.example`, `apps/worker/.env.example`, `deploy/web.env.example`, `deploy/worker.env.example`, cu comentarii despre fiecare.
- Gardă pentru Stripe: o cheie `sk_live_` e refuzată în afara `NODE_ENV=production` (`server-env.ts`), ca un test local sau din CI să nu încaseze bani reali.
- Gardă pentru Turnstile: `TURNSTILE_OFFLINE=1` e acceptat doar cu secretul de test.
- Limitele de frecvență (`RATE_LIMIT_*`) sunt validate ca întregi pozitivi.
- În imaginea Docker, doar `NEXT_PUBLIC_*` sunt incluse la build; secretele se dau doar la rulare, din `deploy/web.env` (care nu se comite).

## 3. Chei în git — ⚠️

**Ce e în regulă:**
- `.gitignore` exclude `.env` și `.env.*`, cu excepția `.env.example` și a `supabase/.env`.
- `supabase/.env` e singurul fișier `.env` urmărit și conține doar cheia publică de test Turnstile (`1x00…AA`, publicată de Cloudflare pentru teste, nu un secret).
- Am căutat în fișierele urmărite și în istoricul complet (nume de fișiere și șabloane `sk_live_`, `whsec_`, JWT, chei AWS, chei private, `*_KEY=`/`*_SECRET=` cu valoare): nu apare niciun secret real.

**Ce lipsește:** nicio verificare automată. CI-ul (`.github/workflows/ci.yml`) nu rulează un scanner de secrete (gitleaks, trufflehog) și nu există `dependabot.yml`. Cele de mai sus sunt o verificare făcută o singură dată.

**De verificat manual:** dacă „Secret scanning” și „Push protection” sunt active în setările repository-ului pe GitHub.

## 4. Rute de admin protejate — ✅

Protecția are patru straturi, în ordine:
1. **Layout:** `app/admin/layout.tsx` redirecționează anonimii la `/login`, cei fără al doilea factor la `/auth/mfa` și întoarce `notFound()` pentru cei care nu sunt administratori (404, nu 403: ruta nu își dezvăluie existența).
2. **Pagini și date:** `lib/admin/guard.ts` (`requireAdminPage`) e apelat în `lib/admin/queries.ts`, `discounts.ts` și `package.ts`; paginile se randează în paralel cu layout-ul, deci fiecare își face singură verificarea.
3. **Acțiuni și rute:** `requireAdmin()` e apelat în toate cele 14 Server Actions din `lib/actions/admin.ts` și în rutele QR din `lib/admin/qr.ts`. Verifică `is_admin()` în baza de date.
4. **Baza de date:** `is_admin()` cere `aal2` (TOTP validat) și prezența în `platform_admins`; RLS aplică același lucru (vezi punctul 10).

Chiar dacă un strat ar fi ocolit, următorul oprește cererea.

## 5. Autentificare — ✅

- Fără parole: cod de 6 cifre sau link trimis pe email, valabil 15 minute, cu Cloudflare Turnstile pe formularul public.
- În `supabase/config.toml`: `enable_signup = false` (global), `enable_anonymous_sign_ins = false`, `enable_refresh_token_rotation = true`, `jwt_expiry = 3600`, captcha Turnstile activ. Aplicația apelează `signInWithOtp` cu `shouldCreateUser: false`, deci nu se pot crea conturi din exterior.
- Administratorii au obligatoriu al doilea factor (TOTP), verificat prin `aal2` în JWT.

**De verificat manual:** `config.toml` descrie doar Supabase-ul local (`site_url = http://localhost:3000`). Aceleași setări (înregistrare oprită, captcha, URL-uri de redirect, MFA) trebuie confirmate în proiectul Supabase de producție.

## 6. Permisiunile utilizatorilor — ✅

- Trei roluri, cu mecanisme diferite: **administrator** (`platform_admins` + aal2), **organizator** (legat de eveniment prin emailul din JWT: `events_organizer_select`, `media_items_organizer_select`), **invitat** (fără cont: token de eveniment în URL și cookie de sesiune).
- Organizatorul vede doar evenimentele proprii: la acces la un eveniment străin răspunsul e 404, verificat de testul e2e din `gallery.spec.ts` (SC-012).
- Storage: organizatorul poate citi/șterge doar în prefixul unui eveniment propriu și activ (`organizer_owns_active_event`).
- Testele `supabase/tests/rls/*.test.ts` verifică accesul pe tabele și storage.

**De urmărit:** cheia `service role` (care ocolește RLS) e folosită în 10 fișiere (`lib/actions/guest.ts`, `auth.ts`, `self-service.ts`, `payments.ts`, `admin.ts`, `lib/guest/event.ts`, `lib/legal.ts`, `lib/stripe/return.ts`, webhook, `app/auth/confirm`). Acolo permisiunile nu sunt aplicate de RLS, ci de codul și de funcțiile SQL apelate; orice cod nou care o folosește trebuie revizuit separat.

## 7. Validarea intrărilor — ✅

- Toate Server Actions trec intrarea printr-o schemă `zod` (`runAction` din `lib/actions/result.ts`): `admin.ts`, `auth.ts`, `guest.ts`, `organizer.ts`, `payments.ts`, `self-service.ts`. Tokenul de eveniment, UUID-urile, lungimea numelui (`DISPLAY_NAME_MAX`) și tipurile MIME permise sunt validate.
- Erorile ajung la utilizator ca **coduri stabile** (`ErrorCode`), nu ca excepții brute; mesajele de câmp sunt chei `validation.*`.
- Corpul Server Actions e limitat la 256 kb (`next.config.ts`).
- Validarea se repetă în baza de date (funcții SQL cu verificări și constrângeri), deci nu depinde doar de aplicație.

## 8. Protecție XSS — ✅

- Nu există `dangerouslySetInnerHTML`, `innerHTML`, `eval` sau `new Function` în `app/`, `components/`, `lib/`.
- Documentele legale se randează cu `lib/markdown.tsx`, care produce noduri React din text, nu HTML, deci conținutul nu se poate injecta.
- CSP cu nonce per cerere și `strict-dynamic` (`lib/security/csp.ts`, `proxy.ts`): scripturile fără nonce nu rulează. `unsafe-eval` e permis doar în `NODE_ENV=development`.
- Numele invitaților și ale evenimentelor sunt afișate prin React, care le scapă automat.

**Slăbiciune minoră:** `style-src` conține `'unsafe-inline'` (necesar pentru stilurile generate de Next.js/react-aria). Riscul e mult mai mic decât la scripturi.

## 9. Protecție SQL injection — ✅

- Aplicația web nu scrie SQL: accesul la date merge prin `supabase-js` (PostgREST) și apeluri RPC cu parametri tipați.
- Worker-ul (`apps/worker/src`) folosește `pg` cu interogări parametrizate (`$1`, `$2`, de exemplu `auth-email.ts`, `admin-activation-notice.ts`); nu am găsit concatenare de valori în SQL.
- Funcțiile SQL din migrări folosesc `set search_path = ''` (117 apariții), ceea ce previne deturnarea prin scheme false.

## 10. Regulile bazei de date (RLS) — ✅

- Toate cele 22 de tabele din schema `public` au `enable row level security`.
- Testul `supabase/tests/rls/rls-enabled.test.ts` verifică în baza de date reală că **fiecare** tabel din `public` are RLS activ; un tabel nou fără RLS face testul să pice.
- Politicile sunt în principal de citire (`*_admin_select`, `*_organizer_select`, `*_read`). Scrierile se fac prin funcții `SECURITY DEFINER` apelabile doar de rolurile potrivite (`revoke execute … from public`, apoi `grant` țintit).
- Tabelele sensibile au `revoke all … from anon, authenticated` (de exemplu `payments`, `stripe_webhook_events`, `terms_acceptances`, `self_service_settings`).
- Bucket-urile Storage (`incoming`, `media`, `archives`) sunt private.

## 11. Limitare de frecvență — ✅ (cu rezerve)

- Mecanism în baza de date: `check_rate_limit(cheie, limită, interval)` (`20260925000700_archives_notices_ratelimit.sql`), apelabil doar de `service_role`. Folosit la:
  - **cereri de cod de login:** 3 per 15 minute și 10 per 24 de ore pe email, plus o limită pe oră pe adresa IP;
  - **coduri de reducere:** 10 pe oră pe email și o limită pe oră pe IP;
  - **invitați:** limită pe minut pe cheie (`guest_rate_limit`), dimensionată pentru ~200 de invitați pe același Wi-Fi.
- Adresa IP e păstrată doar ca HMAC cu `IP_HASH_SECRET` (`lib/security/ip-hash.ts`). În spatele Cloudflare, `TRUSTED_IP_HEADER=cf-connecting-ip` face ca IP-ul să nu poată fi falsificat prin `x-forwarded-for`.
- Cloudflare Turnstile pe crearea de evenimente și pe cererea de cod.

**Rezerve (de verificat):** nu am găsit o limită explicită pe încercările de **verificare a codului** (după ce a fost emis); protecția vine din expirarea codului și din setările `[auth.rate_limit]` ale Supabase, care trebuie confirmate pe producție. Nu există nicio limitare la nivel de rețea în repository (WAF/reguli Cloudflare): de verificat în dashboard.

## 12. Plafon de cheltuieli — ⚠️

Nu există nimic în cod care să plafoneze costurile; e o setare de infrastructură.

**Ce limitează deja costul prin design:**
- Găzduirea e pe Oracle Cloud Always Free (gratuit în limite); `docs/livrare-server-propriu.md` recomandă o alertă de buget (_Billing › Budgets_, de exemplu 1 €).
- Limite per eveniment și per invitat: 50 de fișiere per invitat, 50 MB per poză, 1 GB per video (`packages/shared/src/limits.ts`), verificate la rezervarea încărcării și la bucket.
- Încărcările se opresc în afara perioadei evenimentului; evenimentele neactivate sunt șterse (`cleanup_unactivated`).

**De verificat manual (nu sunt în repository):**
- Supabase: planul și „Spend cap” activ, plus limitele de stocare și de bandă.
- Stripe: nu implică costuri fixe, dar verifică alertele pentru dispute și rambursări.
- Sentry: cota lunară de evenimente, ca o buclă de erori să nu o consume.
- Oracle: alerta de buget (dacă a fost creată).

## 13. Încărcări de fișiere securizate — ✅

- **Bucket-uri private** cu listă de tipuri permise (JPEG, PNG, WebP, HEIC/HEIF, MP4, MOV) și limită de dimensiune.
- **Încărcare cu token:** clientul trimite fișierul prin tus cu un antet `x-signature` emis la rezervare (`lib/upload/tus-transfer.ts`); fără rezervare nu se poate scrie în `incoming`. Utilizatorii obișnuiți nu au INSERT/UPDATE pe Storage.
- **Verificarea tipului real:** worker-ul citește „magic bytes” cu `file-type` (`apps/worker/src/media/detect.ts`) și respinge fișierele cu tip nepermis sau cu tip diferit de cel declarat (`TYPE_MISMATCH`).
- **Reîncodare:** pozele sunt convertite în WebP cu `sharp` (afișare 2048 px, miniatură 400 px, calitate 80), ceea ce elimină conținutul original (inclusiv metadatele EXIF); limită `limitInputPixels` contra bombelor de decompresie.
- **Nume de fișier:** calea în Storage și extensia vin din tipul detectat, nu din numele dat de utilizator.
- **Descărcare:** URL-uri semnate cu durată limitată (`SIGNED_URL_TTL_SECONDS`), descărcare ca `attachment`.

**Rezerve:** limita bucket-ului `media` e 1 GiB și pentru poze, deci limita de 50 MB pe poză e aplicată de aplicație la rezervare, nu de Storage. Nu există scanare antivirus. Procesarea video (ffmpeg) rulează pe conținut necunoscut: merită rulată izolat (containerul worker-ului o izolează parțial).

## 14. Protecție CSRF — ✅

- Mutațiile merg prin **Server Actions** (POST). Next.js compară antetul `Origin` cu `Host` și respinge cererile din alte origini; `next.config.ts` nu setează `serverActions.allowedOrigins`, deci rămâne regula strictă implicită.
- Cookie-urile sunt `SameSite=Lax`, deci nu sunt trimise la POST-uri între site-uri.
- Rutele GET (`qr.png`, `qr.svg`) doar citesc și cer sesiune validă; răspunsurile au `Cache-Control: private, no-store`.
- Webhook-ul Stripe nu folosește cookie-uri: verifică semnătura (`stripe.webhooks.constructEvent` cu `STRIPE_WEBHOOK_SECRET`, `lib/stripe/webhook.ts`) și respinge cererile fără ea.
- `form-action 'self' https://checkout.stripe.com` din CSP limitează unde pot trimite formularele.

## 15. Setări CORS — ✅

- Aplicația **nu setează antete CORS**, deci răspunsurile sunt accesibile doar din aceeași origine. Singura rută API este webhook-ul Stripe (server la server).
- Browserul comunică direct cu Supabase (Realtime, încărcări tus); acea origine e permisă explicit în `connect-src` din CSP, iar CORS-ul ei îl gestionează Supabase.

**De verificat manual:** în proiectul Supabase de producție, că domeniile permise (Auth › URL Configuration, redirect URLs) sunt doar cele reale, fără `localhost`.

## 16. HTTPS — ✅

- Traficul intră prin **Cloudflare Tunnel**: nimic nu ascultă pe porturi publice (`deploy/docker-compose.yml`); Cloudflare termină TLS.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (`proxy.ts`).
- `upgrade-insecure-requests` e adăugat în CSP când Supabase e pe HTTPS.
- Cookie-ul invitatului primește `Secure` când `APP_URL` e HTTPS (vezi punctul 18).

**De verificat:** directiva `preload` nu are efect până când domeniul nu e înregistrat pe hstspreload.org; fără înregistrare, rămâne doar HSTS obișnuit (care funcționează).

## 17. Headere de securitate — ✅

Setate în `proxy.ts`, pe toate răspunsurile în afară de resursele statice și webhook:

| Header | Valoare |
|---|---|
| `Content-Security-Policy` | cu nonce per cerere, `strict-dynamic`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` |
| `Strict-Transport-Security` | 2 ani, `includeSubDomains`, `preload` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` pe `/e/…` și pe paginile cu token în URL, altfel `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=()` |
| `Cache-Control` | `no-store` pe paginile de confirmare cu token |

În plus, `poweredByHeader: false` ascunde `X-Powered-By`. Protecția anti-iframe vine din `frame-ancestors 'none'` (înlocuiește `X-Frame-Options` în browserele moderne).

**Lipsesc (opțional):** `Cross-Origin-Opener-Policy` și `Cross-Origin-Resource-Policy`; nu sunt critice aici.

## 18. Cookie-uri securizate — ⚠️

**Cookie-ul invitatului (`mg_s`)** — ✅: `httpOnly`, `secure` (când `APP_URL` e HTTPS), `sameSite: lax`, calea limitată la `/e/{token}`, durată până la sfârșitul perioadei evenimentului (`lib/actions/guest.ts`).

**Cookie-urile de sesiune Supabase (organizator și administrator)** — ⚠️: sunt scrise de `@supabase/ssr` cu opțiunile implicite (`httpOnly: false`, fără `Secure`, `SameSite=Lax`, 400 de zile), iar `proxy.ts` și `lib/supabase/server.ts` le trec mai departe nemodificate.
- `httpOnly: false` este **necesar** acum: clientul din browser (`lib/supabase/browser.ts`) citește sesiunea din cookie pentru galeria în timp real (`lib/realtime/auth.ts`). Riscul (un XSS ar putea citi sesiunea) e atenuat de CSP-ul cu nonce.
- Lipsa `Secure` nu e o problemă în practică (tot traficul e HTTPS prin Cloudflare), dar e ușor de adăugat explicit în `setAll`, în producție.

## 19. Mod debug oprit — ✅

- Nu există steaguri de debug în cod. `unsafe-eval` din CSP e activ doar când `NODE_ENV === "development"` (`proxy.ts`).
- Imaginea Docker rulează cu `NODE_ENV=production` și `NEXT_TELEMETRY_DISABLED=1`.
- Utilizatorul nu primește excepții brute: erorile devin coduri stabile cu mesaje în română (`lib/actions/result.ts`), iar paginile de eroare noi (`error.tsx`, `global-error.tsx`) nu afișează detalii tehnice.
- Sentry: `scrub` elimină emailuri, tokenuri de eveniment din URL, căi de fișiere și nume de invitați; `dataCollection` dezactivează informațiile de utilizator, cookie-urile, antetele și corpurile cererilor.

## 20. Setări de producție — ⚠️

**În regulă:**
- Docker: build în doi pași, imagine finală cu `output: standalone`, rulează ca utilizator `node` (fără root), versiune de Node fixată, `HEALTHCHECK` în compose, `restart: unless-stopped`.
- Nimic nu e expus public (Cloudflare Tunnel); `stop_grace_period: 10m` pe worker.
- CI-ul (`ci.yml`) rulează verificările, testele unitare, e2e pe trei browsere, build-ul și testul „fără secrete în client” înainte de publicarea imaginilor.
- Gărzile din punctul 2 (`sk_live_`, `TURNSTILE_OFFLINE`).

**De îmbunătățit / verificat:**
- `cloudflare/cloudflared:latest` din `docker-compose.yml` nu e fixat la o versiune: o actualizare neanunțată poate schimba comportamentul.
- Nu există audit de dependențe (`pnpm audit`) și nici `dependabot.yml` în repository.
- Setările proiectului Supabase de producție nu sunt versionate (vezi punctele 5 și 15).

---

## Ce rămâne de făcut

În ordinea importanței:

1. **Plafon de cheltuieli (12):** confirmă în dashboard-uri Spend cap-ul Supabase, cota Sentry și alerta de buget Oracle. E singura verificare fără nicio acoperire în cod.
2. **Setările de producție ale Supabase (5, 15, 11):** înregistrare oprită, Turnstile, URL-uri de redirect fără `localhost`, limitele `auth.rate_limit`.
3. **Scanare automată de secrete și de dependențe (3, 20):** gitleaks în CI, `dependabot.yml` sau `pnpm audit`, „Secret scanning” pe GitHub.
4. **`Secure` pe cookie-urile Supabase (18):** adăugat în `setAll` în producție.
5. **Fixează `cloudflared` la o versiune (20).**
6. **Limita de 50 MB pe poză la nivel de bucket (13):** o politică separată sau bucket separat pentru poze, ca Storage să aplice limita și el.

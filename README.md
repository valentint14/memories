# Memories

Pozele și filmările invitaților de la un eveniment privat, într-un singur loc: organizatorul își
creează singur evenimentul (sau îl creează administratorul) și descarcă codul QR, administratorul
activează pachetul complet, invitații încarcă din browser (fără cont), iar organizatorul vede,
descarcă și șterge fișierele. Fișierele se șterg automat la sfârșitul perioadei de
păstrare alese, care influențează prețul final.

Specificațiile, planurile și deciziile tehnice: [`specs/001-event-qr-upload/`](specs/001-event-qr-upload/)
(bucla de bază) și [`specs/002-self-service-events/`](specs/002-self-service-events/) (crearea
self-service, activarea, autentificarea cu cod) — spec, plan, research, data-model, contracte,
quickstart, tasks.

## Structură

| Director | Conținut |
| --- | --- |
| `apps/web` | Next.js 16 (Vercel, `fra1`): pagina invitatului, galeria organizatorului, administrare |
| `apps/worker` | worker Node 24 în Docker: curățarea metadatelor, variante media, arhive ZIP, expirare, emailuri |
| `packages/shared` | tipuri generate din baza de date, limite, coduri de eroare, reguli comune |
| `supabase` | migrații, politici RLS, seed, configurație locală |
| `fixtures/media` | fișiere media sintetice pentru teste |
| `tests/load`, `tests/perf` | testul de încărcare k6 și testul de performanță al arhivei (preview) |

## Pornire locală

Cerințe: Node.js 24 LTS (`.nvmrc`), pnpm 12.6.0 prin Corepack, Docker.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:start                                   # Supabase local: Postgres, Auth, Storage, Realtime, Mailpit
node scripts/ci-env.mjs --write                 # apps/web/.env.local și apps/worker/.env
pnpm --filter worker docker:build               # imaginea worker-ului (ffmpeg, ExifTool, heif-dec)
pnpm --filter web dev                           # http://localhost:3000
```

Worker-ul rulează în Docker: `pnpm --filter worker docker:run` folosește `apps/worker/.env.docker`
(generat de `ci-env`, cu Supabase local accesat prin `host.docker.internal`). Worker-ul trimite și
emailurile de confirmare și de autentificare (cod de 6 cifre + link), deci trebuie să ruleze pentru
orice autentificare. Emailurile locale apar în Mailpit: <http://localhost:54324>. Utilizatorii din
seed: `admin@example.test` (înrolează TOTP la prima autentificare), `org-a@example.test`,
`org-b@example.test`.

Autentificarea (organizatori și administratori) se face cu codul sau linkul din email, fără parolă;
linkul deschide o pagină cu buton „Confirmă”. Oricine își poate crea un eveniment de pe pagina
principală (`/`); evenimentul așteaptă activarea pachetului complet de către administrator
([specificația 002](specs/002-self-service-events/spec.md)).

Verificarea anti-bot folosește Cloudflare Turnstile. `ci-env` scrie cheile de test Cloudflare și
`TURNSTILE_OFFLINE=1` (fără scriptul extern, verificare emulată local, permisă doar cu cheile de
test); `supabase/.env` conține secretul de test pentru CAPTCHA-ul Supabase Auth.

## Verificări (identice cu CI)

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:db                                    # Supabase local: RLS și funcții SQL
pnpm test:e2e                                   # Playwright: desktop, Android, iPhone (cu worker-ul pornit)
```

Testele media ale worker-ului rulează în imaginea Docker (au nevoie de `heif-dec` și ffmpeg).
Scenariile manuale și cele de performanță sunt descrise în
[`quickstart 001`](specs/001-event-qr-upload/quickstart.md) și
[`quickstart 002`](specs/002-self-service-events/quickstart.md) (inclusiv configurarea DNS pentru
email și a Turnstile în producție). Testul widgetului Turnstile real rulează în CI sau cu
`E2E_TURNSTILE_SMOKE=1` (are nevoie de internet).

## Medii

| Mediu | Aplicație | Date | Worker |
| --- | --- | --- | --- |
| Local | `next dev` / `next start` | Supabase CLI (Docker) | container local |
| Preview | Vercel Preview | proiect Supabase separat (UE) | container de preview |
| Producție | Vercel, regiunea `fra1` | Supabase `eu-central-1`, plan Pro, PITR dezactivat | Scaleway Serverless Containers `fr-par` ([livrare](apps/worker/deploy/scaleway-container.md)) |

## Date personale (GDPR)

Toate datele sunt găzduite în UE. Procesatori cu sediul în afara UE, cu date în UE, pentru care
este necesar un acord de prelucrare a datelor (DPA) înainte de producție (research.md R15):

- **Vercel** — găzduirea aplicației web (`fra1`)
- **Supabase** — baza de date, autentificarea și stocarea fișierelor (`eu-central-1`)
- **Resend** — trimiterea emailurilor (`eu-west-1`)
- **Sentry** — raportarea erorilor, fără date personale (regiunea de date UE)
- **Cloudflare** — verificarea anti-bot Turnstile pe formularele de creare și de autentificare
  (adresa IP și semnale ale browserului, fără cookie-uri și fără stocarea datelor aplicației)

Backup-urile bazei de date se păstrează 7 zile; ștergerea completă a datelor unei persoane are
loc în cel mult 7 zile de la ștergerea din aplicație ([`supabase/README.md`](supabase/README.md)).

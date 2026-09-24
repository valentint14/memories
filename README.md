# Memories

Pozele și filmările invitaților de la un eveniment privat, într-un singur loc: administratorul
creează evenimentul și codul QR, invitații încarcă din browser (fără cont), iar organizatorul
vede, descarcă și șterge fișierele. Fișierele se șterg automat la sfârșitul perioadei de
păstrare alese, care influențează prețul final.

Specificația, planul și deciziile tehnice: [`specs/001-event-qr-upload/`](specs/001-event-qr-upload/)
(spec, plan, research, data-model, contracte, quickstart, tasks).

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
(generat de `ci-env`, cu Supabase local accesat prin `host.docker.internal`). Emailurile locale (autentificare, avertizări) apar în Mailpit:
<http://localhost:54324>. Utilizatorii din seed: `admin@example.test` (înrolează TOTP la prima
autentificare), `org-a@example.test`, `org-b@example.test`.

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
[`quickstart.md`](specs/001-event-qr-upload/quickstart.md).

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

Backup-urile bazei de date se păstrează 7 zile; ștergerea completă a datelor unei persoane are
loc în cel mult 7 zile de la ștergerea din aplicație ([`supabase/README.md`](supabase/README.md)).

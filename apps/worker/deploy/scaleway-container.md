# Livrarea worker-ului — Scaleway Serverless Containers (`fr-par`)

Worker-ul e un proces persistent (buclă de polling pe `pgmq`), deci rulează cu **cel puțin o
instanță mereu pornită**. Regiune UE (constituția, principiul II; research.md R15).

## Container

| Setare | Valoare |
| --- | --- |
| Regiune | `fr-par` |
| Imagine | `rg.fr-par.scw.cloud/<namespace>/memories-worker:<sha>` (publicată de CI pe `main`) |
| `min-scale` / `max-scale` | `1` / `2` |
| Resurse | 2 vCPU, 4 GB RAM (ffmpeg pentru video de până la 1 GB) |
| Port | niciunul (worker-ul nu expune HTTP) — se setează un port de sănătate doar dacă platforma îl cere |
| Privacy | privat (fără endpoint public) |
| Oprire | `SIGTERM` → worker-ul termină joburile în curs (oprire grațioasă) |

## Variabile de mediu (secrete în Scaleway Secret Manager)

Aceleași chei ca în [`apps/worker/.env.example`](../.env.example):

| Variabilă | Producție |
| --- | --- |
| `DATABASE_URL` | conexiunea directă Postgres a proiectului Supabase (`eu-central-1`), rol dedicat cu drepturi pe `pgmq` și `public` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | proiectul Supabase de producție |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | chei S3 ale Supabase Storage (Settings › Storage › S3) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Resend, regiunea `eu-west-1` (`smtp.resend.com:465`) |
| `APP_URL` | URL-ul public al aplicației (linkurile din emailurile de avertizare și de autentificare) |
| `ADMIN_NOTIFY_EMAILS` | destinatarii cererilor de activare (002), separați prin virgulă; gol = adresele din `platform_admins` |
| `SENTRY_DSN` | proiect Sentry în regiunea de date UE |
| `WORKER_CONCURRENCY` | `3` (implicit) |

## Publicare

1. CI construiește imaginea din `apps/worker/Dockerfile` la fiecare PR și rulează testul de fum
   HEIC și testele media în imagine.
2. Pe `main`, jobul `publish-worker` din `.github/workflows/ci.yml` publică imaginea în Scaleway
   Container Registry cu tag-ul commit-ului (secretele `SCW_SECRET_KEY` și `SCW_REGISTRY_NAMESPACE`
   în GitHub).
3. Actualizarea containerului pe noul tag se face din consola Scaleway sau cu
   `scw container container update <id> registry-image=<imagine>:<sha> redeploy=true`.

## Verificare după livrare

- Logurile containerului arată `worker pornit`, apoi joburi `job terminat`.
- Un upload de test pe preview ajunge `ready` în galerie (quickstart 9).
- Nu apar în loguri emailuri, nume de invitați sau tokenuri (loguri redactate — research.md R14).

# Supabase

- Local: `pnpm db:start` pornește Postgres, Auth, Storage, Realtime și Mailpit
  (`http://localhost:54324`, SMTP pe portul 54325 pentru worker).
- `pnpm db:reset` aplică `migrations/` și `seed.sql`; `pnpm db:types` regenerează tipurile.
- Producție: proiect în regiunea `eu-central-1`, plan Pro.

## Backup-uri și ștergere (research.md R11, R15)

- Backup-urile zilnice ale bazei de date se păstrează **7 zile**; rândurile șterse din aplicație
  (inclusiv numele invitaților) dispar complet la rotirea lor. Termenul apare în nota de
  informare de pe pagina de upload.
- **PITR rămâne dezactivat** în proiectul de producție: ar extinde fereastra în care datele
  șterse pot fi restaurate.
- Fișierele din Storage nu fac parte din backup-urile bazei de date; ștergerea lor e definitivă
  imediat. De reverificat în documentația Supabase la fiecare schimbare de plan.

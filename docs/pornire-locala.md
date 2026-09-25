# Pornirea aplicației Memories pe calculatorul local (Windows)

Ghid pas cu pas pentru rularea aplicației local, cu toate funcțiile din 001 și 002: evenimente,
cod QR, upload invitați, galerie, creare self-service, activare, autentificare cu cod.

Toate comenzile se rulează în **PowerShell**, din folderul proiectului: `E:\memories`.

---

## 1. Ce trebuie să ai instalat (o singură dată)

| Program | De ce | Verificare |
| --- | --- | --- |
| **Docker Desktop** (pornit) | Supabase local (bază de date, autentificare, stocare, emailuri de test) și worker-ul media | iconița Docker din bara de sistem e verde |
| **fnm** cu **Node.js 24.21.0** | proiectul cere Node 24; pe calculator mai există Node 26, care nu merge | `fnm list` arată `v24.21.0` |
| **Git** | deja instalat | `git --version` |

> Dacă Node 24 lipsește: `fnm install 24.21.0`.

---

## 2. Pregătește terminalul (în fiecare fereastră nouă de PowerShell)

Calculatorul pornește implicit cu Node 26 și cu un `pnpm` global care nu funcționează cu acest
proiect. Pune Node 24 primul în PATH, doar pentru fereastra curentă:

```powershell
cd E:\memories
$env:Path = "$env:APPDATA\fnm\node-versions\v24.21.0\installation;" + $env:Path
node --version
```

Trebuie să vezi `v24.21.0`.

> **Important:** scrie comanda de mână sau copiaz-o fără caractere în plus la început (de
> exemplu `$>` sau `>`). Dacă `node --version` arată tot `v26.3.0`, comanda nu s-a aplicat.

Mai departe folosește **`corepack pnpm`** în loc de `pnpm`: așa rulează exact versiunea cerută de
proiect (12.6.0), nu cea globală, care dă eroarea „…pnpm is not recognized…”.

---

## 3. Instalează dependențele (prima dată și după fiecare `git pull`)

```powershell
corepack pnpm install --frozen-lockfile
```

Dacă Corepack întreabă dacă descarcă pnpm, răspunde cu `Y`.

---

## 4. Pornește Supabase local

```powershell
corepack pnpm db:start
```

- Prima pornire durează câteva minute (se descarcă imaginile Docker).
- Pornește baza de date, autentificarea, stocarea, Realtime și **Mailpit** (serverul de email de
  test).
- Secretul de test pentru verificarea anti-bot e citit automat din `supabase/.env`.

Dacă vrei să ștergi toate datele locale și să pornești de la zero (doar utilizatorii din seed
rămân):

```powershell
corepack pnpm db:reset
```

---

## 5. Generează fișierele de configurare locale

```powershell
node scripts/ci-env.mjs --write
```

Scrie `apps/web/.env.local`, `apps/worker/.env` și `apps/worker/.env.docker` cu cheile Supabase
locale și cu **cheile de test Cloudflare Turnstile**. Local, verificarea anti-bot rulează în mod
de test, fără internet.

> Rulează din nou acest pas după `db:reset` sau după o reinstalare a Supabase.

---

## 6. Pornește worker-ul (procesare media și toate emailurile)

Worker-ul trimite **și emailurile cu codul de autentificare**. Fără el nu primești niciun cod,
deci nu te poți autentifica.

Construiește imaginea (prima dată și după orice modificare a codului worker-ului):

```powershell
corepack pnpm --filter worker docker:build
```

Pornește containerul în fundal:

```powershell
docker rm -f memories-worker-dev
docker run -d --name memories-worker-dev --env-file apps/worker/.env.docker --add-host=host.docker.internal:host-gateway memories-worker
```

> Prima comandă șterge containerul vechi, dacă există; mesajul „No such container” e normal.

Verifică dacă a pornit:

```powershell
docker logs memories-worker-dev
```

Trebuie să apară `"msg":"worker pornit"`.

---

## 7. Pornește aplicația web

```powershell
corepack pnpm --filter web dev
```

Aplicația e la **<http://localhost:3000>**. Lasă fereastra deschisă cât lucrezi (se oprește cu
`Ctrl+C`).

> La prima pornire în modul dev, Next.js poate crea `apps/web/AGENTS.md`, `apps/web/CLAUDE.md` și
> poate modifica `apps/web/next-env.d.ts`. Nu le comite.

---

## 8. Emailurile locale: Mailpit

Local, **niciun email nu pleacă spre o adresă reală**. Toate apar în Mailpit:
**<http://localhost:54324>**.

Acolo găsești:
- codul de 6 cifre și linkul de confirmare sau de autentificare (valabile **15 minute**, o singură
  folosire);
- emailurile trimise administratorilor la „Solicită activarea”;
- avertizările de ștergere.

---

## 9. Utilizatorii de test

| Adresă | Rol | Observații |
| --- | --- | --- |
| `admin@example.test` | administrator | la prima autentificare configurezi un cod TOTP (aplicație de autentificare) |
| `org-a@example.test` | organizator | are acces la evenimentele create pentru această adresă |
| `org-b@example.test` | organizator | la fel |
| orice altă adresă | vizitator | poate crea un eveniment nou de pe pagina principală |

---

## 10. Ce poți încerca

### A. Creezi singur un eveniment (vizitator → organizator)

1. Deschide <http://localhost:3000>.
2. Completează emailul (orice adresă, de ex. `ana@exemplu.ro`), numele și data evenimentului,
   bifează acceptarea termenilor și apasă **Creează evenimentul**.
3. Deschide Mailpit și copiază codul de 6 cifre în pagina deschisă. Poți apăsa și pe linkul din
   email, apoi pe **Confirmă**.
4. Ajungi la eveniment, **în așteptarea activării**: descarci codul QR, vezi prețul și poți apăsa
   **Solicită activarea**.

### B. Activezi evenimentul (administrator)

1. Într-o fereastră privată (sau alt browser), mergi la <http://localhost:3000/login>, introdu
   `admin@example.test`, ia codul din Mailpit și confirmă.
2. La prima autentificare scanezi codul QR TOTP cu aplicația de autentificare (Google
   Authenticator, Microsoft Authenticator, 1Password) și introduci codul de 6 cifre.
3. În **Evenimente**, filtrează după **Doar cu activare solicitată**, deschide evenimentul și apasă
   **Activează pachetul complet** (cu un motiv).
4. Din aceeași pagină poți **Suspenda** și **Reactiva**; istoricul stărilor apare mai jos.
5. În **Pachet** (`/admin/package`) modifici prețul și limitele pachetului complet.

### C. Încarci poze ca invitat

1. Deschide linkul din codul QR (`http://localhost:3000/e/...`). Îl găsești în pagina
   evenimentului din administrare sau scanând codul QR descărcat.
2. Alege poze sau video. Worker-ul le procesează în câteva secunde.
3. Organizatorul le vede în galerie, în timp real.

> Pentru un eveniment neactivat sau suspendat, invitatul vede un mesaj și nu poate încărca.

### D. Organizatorul revine

1. Autentifică-te pe `/login` cu aceeași adresă (codul vine în Mailpit).
2. În **Evenimentele mele** vezi toate evenimentele adresei, create de tine sau de administrator.
3. Pe pagina unui eveniment poți schimba numele și data sau îl poți **șterge definitiv**.

---

## 11. Oprirea

```powershell
# în fereastra cu aplicația web: Ctrl+C
docker stop memories-worker-dev
corepack pnpm exec supabase stop
```

Data viitoare reiei de la pasul 2, apoi 4, 6 (doar `docker start memories-worker-dev`, dacă nu ai
modificat worker-ul) și 7.

---

## 12. Probleme frecvente

| Problemă | Cauză | Soluție |
| --- | --- | --- |
| `…\.pnpm-store\…\pnpm" is not recognized…` | rulează pnpm-ul global | folosește `corepack pnpm …` și Node 24 (pasul 2) |
| `corepack : The term 'corepack' is not recognized` | terminalul folosește Node 26 | repetă pasul 2 și verifică `node --version` |
| `corepack enable` → `EPERM … C:\Program Files\nodejs` | nu are drept de scriere acolo | nu e nevoie de `corepack enable`; folosește `corepack pnpm …` |
| Nu vine niciun email în Mailpit | worker-ul nu rulează | `docker ps` → trebuie să apară `memories-worker-dev`; altfel pasul 6 |
| „Codul nu este corect sau a expirat” | codul are 15 minute și o singură folosire; o cerere nouă îl invalidează pe cel vechi | cere un cod nou și folosește doar ultimul email |
| Al 4-lea email pentru aceeași adresă nu mai vine | limita anti-abuz: 3 emailuri la 15 minute per adresă | așteaptă 15 minute sau golește contoarele (mai jos) |
| Nu mai vine niciun email, pentru nicio adresă | limita per IP (local 1000 pe oră, din `RATE_LIMIT_IP_PER_HOUR` în `apps/web/.env.local`; în producție 20) | golește contoarele (mai jos) |
| Pagina se încarcă, dar formularele nu reacționează | aplicația a fost pornită înainte de pasul 5 | oprește cu `Ctrl+C` și repornește pasul 7 |
| `/` sau `/login` dau eroare 500 după o actualizare | lipsesc variabile noi în `.env.local` | rulează din nou pasul 5 și repornește aplicația |
| Evenimentele create de mână au dispărut | s-a rulat `db:reset` | normal: resetul șterge datele locale, rămân doar utilizatorii din seed |
| Portul 3000 e ocupat | rulează deja o instanță a aplicației | închide-o sau folosește `corepack pnpm --filter web dev -- --port 3001` |

Golirea contoarelor de limitare a emailurilor (doar local):

```powershell
docker exec supabase_db_memories psql -U postgres -c "delete from public.rate_limit_counters where bucket_key like 'authmail:%';"
```

---

## 13. Verificările automate (opțional)

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm test:db
corepack pnpm test:e2e
```

- Pentru `test:db` și pentru testele worker-ului, oprește întâi containerul worker-ului
  (`docker stop memories-worker-dev`), altfel consumă aceleași joburi din coadă.
- Pentru `test:e2e`, worker-ul trebuie să ruleze, iar aplicația de pe portul 3000 trebuie oprită
  (testele pornesc singure un build de producție).

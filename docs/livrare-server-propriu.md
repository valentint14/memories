# Livrarea pe Oracle Cloud Always Free

Aplicația web și worker-ul rulează ca containere Docker pe o instanță Oracle Cloud Always Free,
fără porturi publice: Cloudflare Tunnel aduce traficul HTTPS.

```
Browser ──HTTPS──▶ Cloudflare ──tunel──▶ cloudflared ──▶ web (Next.js)
                                        (pe instanță)    worker ──▶ Supabase (Frankfurt), Brevo
```

Imaginile (`memories-web`, `memories-worker`) le publică CI în GitHub Container Registry la fiecare
merge pe `main`, inclusiv pentru `arm64` (procesorul Ampere al instanței). Pe server nu se
compilează nimic.

Ordinea recomandată: instanța (1), Supabase (2), domeniul și Cloudflare (3), Brevo (4), GitHub (5),
pornirea (6). Worker-ul poate porni înaintea aplicației web (6, „Doar worker-ul”).

---

## 1. Instanța Oracle

### Contul

1. **Regiunea home: Germany Central (Frankfurt)**, aleasă la înregistrare; nu se mai poate schimba.
   E aceeași regiune cu Supabase, deci latența dintre worker și bază e mică.
2. **Recomandat: trecerea contului pe Pay As You Go** (_Billing › Upgrade and Manage Payment_).
   Oracle recuperează instanțele Always Free nefolosite (procesor, rețea și memorie sub 20% timp de
   7 zile), iar aplicația fără trafic arată exact așa. Conturile Pay As You Go nu sunt supuse
   acestei reguli, iar resursele din limitele Always Free rămân gratuite. Setează și o alertă de
   buget (_Billing › Budgets_, ex. 1 €), ca să afli imediat dacă ceva iese din gratuit.

### Rețeaua

Creează rețeaua înaintea instanței: formularul instanței nu permite mereu alegerea subnetului când
creează el rețeaua.

1. _Networking › Virtual cloud networks › Start VCN Wizard_ › **Create VCN with Internet
   Connectivity**, nume `memories-vcn`, restul implicit.
2. Asistentul creează un subnet public, unul privat, gateway-ul spre internet și regula pentru
   portul 22. În _Security Lists_ nu deschide nimic altceva: tunelul Cloudflare și worker-ul fac
   doar conexiuni spre exterior.

### Crearea instanței

_Compute › Instances › Create instance_:

| Câmp | Valoare |
| --- | --- |
| _Image_ | **Canonical Ubuntu 24.04** (varianta aarch64, aleasă automat după shape) |
| _Shape_ | _Ampere_ › **`VM.Standard.A1.Flex`**, **2 OCPU, 12 GB RAM** (limita gratuită din iunie 2026); trebuie să apară eticheta _Always Free-eligible_ |
| _Primary VNIC_ | **Select existing virtual cloud network** › `memories-vcn`; subnetul **`public subnet-memories-vcn`** (nu cel privat); _Private IPv4_: automat; **Automatically assign public IPv4 address** bifat |
| _Add SSH keys_ | **Generate a key pair for me** › descarcă **cheia privată** înainte de _Create_; fără ea nu mai intri pe server |
| _Boot volume_ | 100 GB (Always Free include 200 GB în total) |

Dacă apare **„Out of host capacity”**, încearcă alt _Availability Domain_ (Frankfurt are trei) sau
revino peste câteva ore; pe conturile Pay As You Go capacitatea se găsește de obicei mai ușor.

**Adresa IP rezervată.** Adresa publică primită la creare e temporară: se pierde dacă instanța e
recreată, iar Brevo (pasul 4) acceptă emailuri doar de la IP-uri autorizate. Imediat după creare:
_instanța › Attached VNICs › (VNIC) › IP Administration › (IPv4) › Edit_ › **No public IP**, apoi
**Reserved public IP › Create new reserved IP**. Adresa nouă e cea folosită pentru SSH și în Brevo.

### Configurarea serverului

Mută cheia privată în `C:\Users\<tu>\.ssh\`, apoi conectează-te. În PowerShell:

```powershell
ssh -i $HOME\.ssh\ssh-key-memories.key ubuntu@<ip-public>
```

În Command Prompt (`cmd`), `$HOME` nu funcționează; folosește `%USERPROFILE%\.ssh\ssh-key-memories.key`.
Dacă `ssh` refuză cheia cu `UNPROTECTED PRIVATE KEY FILE`, restrânge accesul la ea:

```bat
icacls %USERPROFILE%\.ssh\ssh-key-memories.key /inheritance:r /grant:r "%USERNAME%:R"
```

Pe server:

```sh
curl -fsSL https://get.docker.com | sudo sh   # Docker Engine + Compose, scriptul oficial Docker
sudo usermod -aG docker ubuntu
sudo apt install -y unattended-upgrades       # actualizări de securitate automate
exit                                          # reconectează-te, ca grupul docker să se aplice
```

Imaginea Ubuntu de la Oracle permite deja SSH doar cu cheie; nu activa autentificarea cu parolă.

---

## 2. Proiectul Supabase de producție (planul Free)

1. Pe <https://supabase.com/dashboard>: proiect nou în regiunea **Central EU (Frankfurt)**. Parola
   bazei de date: **doar litere și cifre** (minim 20 de caractere). Caracterele speciale strică
   `DATABASE_URL` din `worker.env`; se poate schimba oricând din _Project Settings › Database ›
   Reset database password_.
2. Din calculatorul tău, în `E:\memories`, **de pe `main`** (migrațiile trebuie să corespundă
   imaginilor publicate de pe `main`), aplică migrațiile. `link` cere parola bazei; `db push`
   afișează lista și cere confirmare:
   ```powershell
   corepack pnpm exec supabase login
   corepack pnpm exec supabase link --project-ref <ref-proiect>
   corepack pnpm exec supabase db push
   ```
   Ref-ul proiectului e în adresa din browser (`/dashboard/project/<ref>`) sau în _Project Settings ›
   General › Project ID_.
3. Datele inițiale (catalogul de retenție și prețul pachetului), în _SQL Editor_:
   ```sql
   insert into public.retention_options (months, surcharge_minor) values (3, 0), (6, 4900), (12, 9900);
   update public.packages
      set price_minor = 29900,
          retention_option_id = (select id from public.retention_options where months = 3)
    where code = 'complete';
   ```
4. Primul administrator: _Authentication › Users › Add user_ (doar emailul, fără parolă), apoi:
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'adresa-ta@exemplu.ro';
   ```
5. Setările Auth:

   | Unde | Ce setezi |
   | --- | --- |
   | _Sign In / Providers_ | **Allow new users to sign up**: dezactivat (conturile le creează aplicația prin API-ul administrativ); _Email_ activat; **Confirm email**: dezactivat; **Email OTP Expiration** `900`; **Email OTP Length** `6` |
   | _Attack Protection_ | **Enable CAPTCHA protection**, provider **Turnstile**, cu _Secret Key_-ul widget-ului (pasul 3); protejează endpointurile publice Auth, iar confirmarea codului nu îl cere |
   | _Rate Limits_ | _sign-ups and sign-ins_ și _token verifications_: **1000** la 5 minute; toate cererile vin de pe IP-ul instanței, iar limitele reale per email și per client le aplică aplicația |
   | _URL Configuration_ | **Site URL** = adresa publică (`https://memories.avify.ro`); **Redirect URLs** = `https://memories.avify.ro/**` |

   **Nu sunt necesare** SMTP-ul personalizat și șabloanele de email din Supabase: codurile de
   autentificare le cere worker-ul prin API-ul administrativ și le trimite el, prin Brevo, cu
   șabloanele aplicației.
6. Notează:
   - URL-ul proiectului: `https://<ref-proiect>.supabase.co`;
   - din _Project Settings › API Keys › **Legacy API keys**_: cheia `anon` (publică) și cheia
     `service_role` (secretă; ocolește toate regulile de acces);
   - din _Connect › **Session pooler**_: `DATABASE_URL`, de forma
     `postgresql://postgres.<ref-proiect>:<parola>@aws-…-eu-central-1.pooler.supabase.com:5432/postgres`.
     Nu _Transaction pooler_ (portul 6543) și nu _Direct connection_ (doar IPv6 pe planul Free);
   - din _Storage › S3 Connection_: endpointul și o cheie de acces nouă.

> Planul Free pune proiectul pe pauză după 7 zile fără activitate și nu are backup-uri. Worker-ul
> interoghează baza continuu, deci proiectul rămâne activ cât timp instanța merge. Backup-urile
> zilnice trebuie configurate separat.

---

## 3. Domeniul și Cloudflare

### Domeniul

1. Cloudflare › **Add a domain** (planul Free). Ecranul cu înregistrările DNS găsite: șterge
   înregistrările de „parcare” ale registrarului; mesajul „Without DNS records…” se poate ignora
   (_Continue to activation_).
2. La registrar, înlocuiește serverele DNS cu cele două nameservere afișate de Cloudflare
   (`….ns.cloudflare.com`). Pentru `.ro`: pe rotld.ro, în administrarea domeniului, cu parola
   domeniului primită pe email la înregistrare.
3. Așteaptă starea **Active** în Cloudflare (minute până la ore; vine și un email).

Aplicația poate sta pe un subdomeniu (ex. `memories.avify.ro`); subdomeniile nu costă nimic în plus.

### Tunelul

1. _Zero Trust › Networks › Tunnels › Create a tunnel_ › **Cloudflared**, nume `memories`.
2. La sistemul de operare alege **Docker**; din comanda afișată copiază doar **tokenul** (șirul
   după `--token `, de obicei începe cu `eyJ`). **Nu rula comanda**: conectorul pornește prin
   Docker Compose. Tokenul se poate afișa oricând din nou (_tunelul › Add a replica_, tot cu Docker).
3. Asistentul rămâne la „Waiting for your Tunnel to connect…” până pornește conectorul: ieși din el,
   tunelul e deja creat.
4. _Tunnels › `memories` › **Routes › Add route › Published application**_: _Subdomain_
   `memories`, _Domain_ `avify.ro`, _Path_ gol, _Service URL_ **`http://web:3000`**.
5. Verifică în _DNS › Records_ că există `CNAME memories` → `<ID-tunel>.cfargotunnel.com`, cu proxy
   activ (norul portocaliu). **Dacă lipsește**, adaugă-l manual (ID-ul e în lista _Tunnels_).

Tunelul apare _Inactive_ până pornește aplicația (pasul 6), apoi **Healthy**.

### Turnstile

_Turnstile › Add widget_: nume `memories`, hostname `memories.avify.ro` (apare ca _Custom
hostname_, e în regulă), mod **Managed**, _pre-clearance_ **No**.

| Cheie | Unde merge |
| --- | --- |
| **Site Key** (publică) | GitHub Variables, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pasul 5) |
| **Secret Key** | `web.env`, `TURNSTILE_SECRET_KEY` (pasul 6), și Supabase › _Attack Protection_ (pasul 2) |

---

## 4. Emailurile: Brevo (planul gratuit)

Toate emailurile aplicației (codurile de autentificare, notificările) le trimite worker-ul prin
Brevo.

1. Cont pe <https://www.brevo.com>. _Senders, Domains & Dedicated IPs › Domains › Add a domain_:
   domeniul (`avify.ro`), cu autentificare manuală. Înregistrările afișate (cod Brevo, DKIM,
   DMARC) se adaugă în Cloudflare › _DNS › Records_; un `CNAME` pentru DKIM rămâne **DNS only**
   (norul gri). Apoi _Authenticate this email domain_.
2. _SMTP & API › SMTP_: **Login**-ul (de forma `…@smtp-brevo.com`, nu emailul contului) și o cheie
   SMTP nouă (`xsmtpsib-…`, afișată o singură dată) pentru `worker.env`.
3. _Security › Authorized IPs_: adaugă **IP-ul rezervat al instanței** (pasul 1). Doar worker-ul
   trimite prin Brevo, deci restricția poate rămâne activă.
4. Limita planului gratuit: 300 de emailuri pe zi.

---

## 5. GitHub: variabilele imaginii web

Valorile `NEXT_PUBLIC_*` intră în codul trimis browserului, deci se stabilesc la build. În
_Settings › Secrets and variables › Actions › tab-ul **Variables**_ (nu _Secrets_: sunt publice, iar
CI le citește doar din _Variables_):

| Variabilă | Valoare |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref-proiect>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cheia `anon` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | _Site Key_-ul Turnstile |
| `NEXT_PUBLIC_SENTRY_DSN` | opțional |

Fără ele, CI publică doar worker-ul și afișează un avertisment. După setare, rulează din nou ultimul
workflow de pe `main` (_Actions › CI › Re-run all jobs_) sau fă un merge.

**Vizibilitatea imaginilor:** la prima publicare, pachetele `memories-web` și `memories-worker`
apar în _Packages_ ca private. Imaginile nu conțin secrete, așa că le poți face publice
(_Package settings › Change visibility_). Altfel, pe server:
`docker login ghcr.io -u <utilizator>` cu un token GitHub cu dreptul `read:packages`.

---

## 6. Pornirea

Pe instanță (conectat prin SSH ca `ubuntu`), o singură clonă, în `~/memories`:

```sh
cd ~ && git clone https://github.com/valentint14/memories.git
cd ~/memories/deploy
cp .env.example .env               # CLOUDFLARE_TUNNEL_TOKEN
cp web.env.example web.env         # secretele aplicației web
cp worker.env.example worker.env   # secretele worker-ului
chmod 600 .env web.env worker.env
openssl rand -hex 32               # valoarea pentru IP_HASH_SECRET din web.env
```

Completează fișierele cu `nano` (valorile direct după `=`, fără ghilimele, cu excepția lui
`SMTP_FROM`): `worker.env` cu datele din pașii 2 și 4, `web.env` cu cheia `service_role`,
`APP_URL` (fără `/` la final), `IP_HASH_SECRET` și `TURNSTILE_SECRET_KEY`, `.env` cu tokenul
tunelului. Apoi:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

Verificare:

- `docker compose ps` arată `web` (`healthy` după un minut), `worker` și `cloudflared`;
- `docker compose logs worker` arată `worker pornit`, fără `citirea cozii a eșuat`;
- tunelul e **Healthy** în Cloudflare, iar adresa publică deschide pagina principală;
- un cod de autentificare cerut din `/login` ajunge pe email (în log: `email trimis`);
- un upload de test pe un eveniment activ apare în galerie (worker-ul procesează).

### Doar worker-ul

Până există imaginea web (pasul 5), worker-ul poate porni singur. Compose cere totuși tokenul și
`web.env`, așa că se pun valori provizorii:

```sh
echo "CLOUDFLARE_TUNNEL_TOKEN=neutilizat" > .env && touch web.env && chmod 600 .env web.env
docker compose pull worker && docker compose up -d worker && docker compose logs -f worker
```

### Probleme frecvente

| Simptom | Cauza |
| --- | --- |
| `denied` la `docker compose pull` | imaginea e privată (pasul 5, _Vizibilitatea imaginilor_) |
| worker: `citirea cozii a eșuat`, repetat | conexiunea la bază; cauza exactă, cu comanda de mai jos |
| `28P01 password authentication failed` | parola din `DATABASE_URL` greșită, rămasă `[YOUR-PASSWORD]` sau cu caractere speciale |
| `Tenant or user not found` | utilizatorul nu e `postgres.<ref-proiect>`; recopiază _Session pooler_ |
| `ENOTFOUND` / `ENETUNREACH` | ai pus _Direct connection_ (IPv6) în loc de _Session pooler_ |
| adresa publică nu se rezolvă | lipsește `CNAME`-ul tunelului (pasul 3, _Tunelul_, punctul 5) |
| Cloudflare răspunde cu eroarea 530 | `cloudflared` nu rulează sau tokenul din `.env` e greșit: `docker compose logs cloudflared` |
| emailurile nu pleacă (`525`, `unauthorized IP`) | IP-ul instanței lipsește din Brevo › _Authorized IPs_ |

Mesajul de eroare al bazei, cu interogarea pe care o face worker-ul:

```sh
docker compose exec worker node -e 'const pg=require("pg");const p=new pg.Pool({connectionString:process.env.DATABASE_URL});p.query("select msg_id from pgmq.read($1,1,1)",["media_jobs"]).then(r=>{console.log("OK",r.rowCount);return p.end()},e=>{console.log("EROARE",e.code,e.message);return p.end()})'
```

După o modificare în `worker.env` sau `web.env`: `docker compose up -d --force-recreate <serviciu>`.

---

## 7. Actualizări

După fiecare merge pe `main`, CI publică imaginile noi în câteva minute. Pe instanță:

```sh
~/memories/deploy/update.sh
```

**Automat**, la fiecare 15 minute (`crontab -e`; la prima rulare alege editorul `nano`):

```cron
*/15 * * * * /home/ubuntu/memories/deploy/update.sh >> /home/ubuntu/memories-update.log 2>&1
```

`update.sh` aduce toate imaginile, deci cere imaginea web publicată. Cât rulează doar worker-ul:

```cron
*/15 * * * * cd /home/ubuntu/memories/deploy && docker compose pull -q worker && docker compose up -d worker && docker image prune -f >/dev/null 2>&1
```

La actualizare, worker-ul primește `SIGTERM`, termină joburile în curs (până la 10 minute) și
repornește; joburile noi așteaptă în coadă, nimic nu se pierde.

**Revenire la o versiune anterioară:** în `deploy/.env`, `TAG=<sha-commit>` (tag-urile sunt în
_Packages_), apoi `docker compose up -d`.

---

## 8. Plățile: Stripe (003)

1. Cont Stripe activat pentru plăți reale (datele firmei, IBAN-ul). În _Settings › Public details_,
   numele platformei, afișat pe pagina de plată.
2. _Settings › Customer emails_: activează **Successful payments** (chitanțele trimise
   organizatorilor). Factura fiscală o emiți tu, în afara aplicației, pe baza foii **Plăți** din
   administrare.
3. _Developers › Webhooks › Add endpoint_: `https://<domeniu>/api/stripe/webhook`, doar
   evenimentele `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.dispute.created`.
   Secretul de semnare (`whsec_…`) intră în `web.env` ca `STRIPE_WEBHOOK_SECRET`.
4. _Developers › API keys_: cheia secretă **live** (`sk_live_…`) în `web.env` ca `STRIPE_SECRET_KEY`.
5. Cloudflare (_Security_): nicio provocare (Bot Fight Mode, regulă WAF) pe `POST /api/stripe/webhook`;
   Stripe nu poate rezolva o provocare JavaScript.
6. Politica de confidențialitate trebuie să menționeze Stripe ca procesator de plăți (versiune
   nouă a documentului, vezi specificația 002, FR-041).
7. Migrațiile 003 se aplică (`supabase db push`) odată cu imaginile care le conțin, după merge.
8. Probă: o plată reală mică pe un eveniment de test, apoi rambursată din Stripe.

---

## 9. Mutarea pe altă instanță

Tot ce ține de server e în `deploy/` și în cele trei fișiere `.env`. Pe instanța nouă: pașii 1 și 6,
cu aceleași fișiere `.env`; tunelul se mută singur (același token). Adaugă IP-ul noii instanțe în
Brevo › _Authorized IPs_. Oprește instanța veche după ce noua arată `healthy`; dacă n-o mai
folosești, șterge-o (_Terminate_), ca să nu ocupe din limitele Always Free.

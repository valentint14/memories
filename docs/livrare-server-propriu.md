# Livrarea pe un server propriu (Oracle Always Free sau Raspberry Pi)

Aplicația web și worker-ul rulează ca containere Docker pe un singur server, fără porturi publice:
Cloudflare Tunnel aduce traficul HTTPS. Varianta de cost redus din
[arhitectura-cost-redus.md](arhitectura-cost-redus.md), pasul 1.

```
Browser ──HTTPS──▶ Cloudflare ──tunel──▶ cloudflared ──▶ web (Next.js)
                                          (pe server)     worker ──▶ Supabase (Frankfurt), SMTP
```

Imaginile (`memories-web`, `memories-worker`) le publică CI în GitHub Container Registry la fiecare
merge pe `main`, pentru `arm64` și `amd64`. Pe server nu se compilează nimic.

---

## 1. Serverul

Oricare dintre variante; configurarea de mai jos e aceeași.

| Variantă | Ce alegi |
| --- | --- |
| **Oracle Cloud Always Free** | regiunea home **Germany Central (Frankfurt)** (nu se mai poate schimba după creare); instanță `VM.Standard.A1.Flex`, **2 OCPU, 12 GB RAM** (limita gratuită din iunie 2026), imagine **Ubuntu 24.04 aarch64**, disc de boot 100 GB |
| **Raspberry Pi 5** | 8 GB RAM, **SSD** (NVMe prin HAT sau USB), nu card SD; Raspberry Pi OS Lite **64-bit** |
| Orice VM Linux | minim 2 vCPU și 4 GB RAM, `arm64` sau `amd64` |

Pe server:

1. Instalează Docker Engine și pluginul Compose după ghidul oficial pentru distribuția ta
   (<https://docs.docker.com/engine/install/>), apoi adaugă utilizatorul în grupul `docker`.
2. Actualizări de securitate automate: `sudo apt install unattended-upgrades`.
3. SSH doar cu cheie (`PasswordAuthentication no`). Pe Oracle, lasă deschis în Security List doar
   portul 22; aplicația nu are nevoie de niciun port deschis.

---

## 2. Proiectul Supabase de producție (planul Free)

1. Pe <https://supabase.com/dashboard>: proiect nou în regiunea **Central EU (Frankfurt)**.
2. Din calculatorul tău, în `E:\memories`, aplică migrațiile:
   ```powershell
   corepack pnpm exec supabase link --project-ref <ref-proiect>
   corepack pnpm exec supabase db push
   ```
3. Datele inițiale (catalogul de retenție și prețul pachetului), în *SQL Editor*:
   ```sql
   insert into public.retention_options (months, surcharge_minor) values (3, 0), (6, 4900), (12, 9900);
   update public.packages
      set price_minor = 29900,
          retention_option_id = (select id from public.retention_options where months = 3)
    where code = 'complete';
   ```
4. Primul administrator: *Authentication › Users › Add user* (doar emailul, fără parolă), apoi:
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'adresa-ta@exemplu.ro';
   ```
5. Setările Auth (*Email*, *Bot and Abuse Protection*, *Rate limits*) și Turnstile: ca în
   [quickstart 002 › Configurarea producției](../specs/002-self-service-events/quickstart.md#configurarea-producției-supabase-și-cloudflare).
   La *URL Configuration*, `Site URL` = adresa publică a aplicației.
6. Notează din *Connect* și *Settings*: URL-ul proiectului, cheia `anon`, cheia `service_role`,
   conexiunea **Session pooler** (IPv4) și cheile S3 din *Storage › S3 Connection*.

> Planul Free pune proiectul pe pauză după 7 zile fără activitate și nu are backup-uri. Worker-ul
> interoghează baza continuu, deci proiectul rămâne activ cât timp serverul merge; backup-urile
> zilnice sunt pasul 2 din propunere.

---

## 3. GitHub: variabilele imaginii web

Valorile `NEXT_PUBLIC_*` intră în codul trimis browserului, deci se stabilesc la build. În
*Settings › Secrets and variables › Actions › **Variables*** (nu *Secrets*: sunt publice):

| Variabilă | Valoare |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref-proiect>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cheia `anon` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | sitekey-ul Turnstile de producție |
| `NEXT_PUBLIC_SENTRY_DSN` | opțional |

Fără ele, CI publică doar worker-ul și afișează un avertisment. După setare, rulează din nou ultimul
workflow de pe `main` (*Actions › CI › Re-run all jobs*) sau fă un merge.

**Vizibilitatea imaginilor:** la prima publicare, pachetele `memories-web` și `memories-worker`
apar în *Packages* ca private. Imaginile nu conțin secrete, așa că le poți face publice
(*Package settings › Change visibility*). Altfel, pe server:
`docker login ghcr.io -u <utilizator>` cu un token GitHub cu dreptul `read:packages`.

---

## 4. Cloudflare Tunnel și domeniul

1. Domeniul (ex. `memories.ro`) trebuie să folosească serverele DNS Cloudflare (planul Free).
2. *Zero Trust › Networks › Tunnels › Create a tunnel* › **Cloudflared**, nume `memories`.
   Copiază tokenul din comanda de instalare (valoarea după `--token`).
3. *Public Hostname*: `memories.ro` (sau un subdomeniu) › Service **HTTP**, URL **`web:3000`**.

---

## 5. Emailurile: Brevo (planul gratuit)

1. Cont pe <https://www.brevo.com>, *Senders, Domains & Dedicated IPs › Domains*: adaugă
   domeniul de trimitere și înregistrările DNS afișate (DKIM, cod Brevo, DMARC), apoi validează
   expeditorul (ex. `no-reply@memories.ro`).
2. *SMTP & API › SMTP*: utilizatorul și o cheie SMTP pentru `worker.env`.
3. Limita planului gratuit: 300 de emailuri pe zi.

---

## 6. Pornirea

Pe server:

```sh
git clone https://github.com/valentint14/memories.git
cd memories/deploy
cp .env.example .env               # CLOUDFLARE_TUNNEL_TOKEN
cp web.env.example web.env         # secretele aplicației web
cp worker.env.example worker.env   # secretele worker-ului
chmod 600 .env web.env worker.env
docker compose pull
docker compose up -d
docker compose ps
```

Verificare:

- `docker compose logs worker` arată `worker pornit`;
- `docker compose ps` arată `web` ca `healthy`;
- adresa publică deschide pagina principală, iar un cod de autentificare ajunge pe email;
- un upload de test pe un eveniment activ apare în galerie (worker-ul procesează).

---

## 7. Actualizări

După fiecare merge pe `main`, CI publică imaginile noi în câteva minute. Pe server:

```sh
~/memories/deploy/update.sh
```

**Automat**, la fiecare 15 minute (`crontab -e`):

```cron
*/15 * * * * /home/<utilizator>/memories/deploy/update.sh >> /home/<utilizator>/memories-update.log 2>&1
```

La actualizare, worker-ul primește `SIGTERM`, termină joburile în curs (până la 10 minute) și
repornește; joburile noi așteaptă în coadă, nimic nu se pierde.

**Revenire la o versiune anterioară:** în `deploy/.env`, `TAG=<sha-commit>` (tag-urile sunt în
*Packages*), apoi `docker compose up -d`.

---

## 8. Mutarea pe alt server

Tot ce ține de server e în `deploy/` și în cele trei fișiere `.env`. Pe serverul nou: pașii 1 și 6,
cu aceleași fișiere `.env`; tunelul se mută singur (același token). Oprește serverul vechi după ce
noul arată `healthy`.

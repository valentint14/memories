# Arhitectura de cost redus pentru lansare

**Data:** 2026-09-25 · **Stare:** propunere; pasul 1 implementat
([livrare-server-propriu.md](livrare-server-propriu.md))

La început nu vor exista clienți și nici buget de întreținere. Propunerea: **costuri fixe aproape
zero** cât timp nu există evenimente și **costuri variabile** (în principal stocarea fișierelor)
care cresc doar odată cu evenimentele plătite.

---

## 1. De ce planul inițial costă de la prima zi

Planul din 001 (research.md R15) și 002:

| Componentă | Plan | Cost minim real |
| --- | --- | --- |
| Supabase | plan Pro, Frankfurt | $25/lună |
| Aplicația web | Vercel | planul Hobby **interzice uzul comercial** (orice proiect din care cineva câștigă bani); Pro = $20/lună |
| Worker | Scaleway Serverless Containers, 2 vCPU / 4 GB, mereu pornit | ~€70,78/lună fără TVA (vezi mai jos) |
| Emailuri | Resend | gratuit până la 100/zi |
| **Total** | | **~$60–115/lună fără niciun client** |

Simularea Scaleway (prețuri oficiale, septembrie 2026, regiunea Paris): vCPU €0,00001/s după
200.000 vCPU-s gratuite, RAM €0,000002/GB-s după 400.000 GB-s gratuite. Worker-ul rulează
2.628.000 s/lună, deci 2 vCPU/4 GB ≈ €50,56 + €20,22 = **€70,78**; 1 vCPU/2 GB ≈ €33,99. O
instanță clasică Scaleway cu aceleași resurse (`BASIC2-A2C-4G`) costă ~€16,79: facturarea pe
secundă nu se potrivește unui proces mereu pornit.

---

## 2. Arhitectura propusă

```
                 Invitați / organizatori
                          │  HTTPS
                          ▼
             Cloudflare Tunnel (gratuit, fără porturi deschise)
                          │
   ┌────────── Server: Oracle Always Free (Frankfurt) sau Raspberry Pi ──────────┐
   │   Docker Compose:   web (Next.js)   +   worker (neschimbat)                  │
   └───────────────┬──────────────────────────────────┬─────────────────────────────┘
                   │                                   │
      Supabase Free (Frankfurt)              Cloudflare R2, jurisdicție UE   ← pasul 2
      Postgres, Auth, Realtime,              poze și video: 10 GB gratuit,
      pgmq, pg_cron                          fără costuri de descărcare
                   │
          Brevo Free (UE): 300 emailuri/zi, prin SMTP
```

| Componentă | Alegere | De ce |
| --- | --- | --- |
| Web + worker | un server gratuit: **Oracle Always Free** (2 nuclee ARM, 12 GB RAM, Frankfurt) sau **Raspberry Pi 5** | ocolește interdicția comercială Vercel; worker-ul nu mai costă separat; aceeași configurare pe oricare server |
| Acces public | **Cloudflare Tunnel** (complet gratuit) | HTTPS fără IP public și fără porturi deschise; merge și de acasă |
| Bază de date, Auth, Realtime | **Supabase Free**, Frankfurt | 500 MB de bază ajung pentru mii de evenimente (fișierele nu stau în bază) |
| Fișiere | **Cloudflare R2**, bucket cu **jurisdicție UE** | 10 GB gratuit, apoi $0,015/GB/lună, **fără taxe de descărcare**; Supabase Free are doar 1 GB (nici un eveniment) |
| Emailuri | **Brevo Free** (companie franceză) | 300/zi; worker-ul trimite deja prin SMTP, deci doar configurare |
| Domeniu | la registrar (ex. Cloudflare Registrar, la cost) | singurul cost inevitabil, ~€10/an |

Toate datele rămân în UE (principiul II): Supabase Frankfurt, R2 cu jurisdicție UE, serverul în
Frankfurt sau în România.

---

## 3. Costuri

| Situație | Cost/lună |
| --- | --- |
| Fără clienți | **~€1** (domeniul) |
| 1 eveniment/lună (~5–10 GB media, păstrate 3 luni) | ~€1 + ~$0,30–0,45 stocare R2 |
| 10 evenimente/lună | ~€1 + ~$3–4,5 stocare R2 |
| La primii clienți constanți: Supabase Pro | +$25 (backup-uri, fără pauză automată) |

La prețul pachetului (299 lei), stocarea unui eveniment costă câteva zeci de bani: costurile
variabile rămân sub 1% din încasări.

---

## 4. Riscuri și acoperire

| Risc | Acoperire |
| --- | --- |
| Supabase Free pune proiectul pe pauză după 7 zile fără activitate | worker-ul interoghează baza continuu, deci contează ca activitate; nu e garantat de termeni, așa că o verificare de sănătate care anunță pauza e recomandată |
| Supabase Free nu are backup-uri | `pg_dump` zilnic de pe server în R2 (pasul 2) |
| Oracle își schimbă termenii sau recuperează instanța (a înjumătățit limitele în iunie 2026) | totul e Docker Compose + backup-uri: mutarea pe Raspberry Pi sau Hetzner (~€4–5/lună) durează o seară ([ghid › Mutarea](livrare-server-propriu.md#8-mutarea-pe-alt-server)) |
| Un singur server = un singur punct de cădere | uploadurile merg direct în stocare, joburile așteaptă în coadă: la o cădere site-ul e indisponibil, dar nu se pierde nimic |
| Brevo: 300 emailuri/zi | ajung pentru codurile de autentificare din primele luni; planurile plătite sunt ieftine |
| Pe Raspberry Pi 5 nu există codare video hardware | conversia video durează câteva minute per clip; pozele rămân rapide |

---

## 5. Alternative analizate

| Variantă | Concluzie |
| --- | --- |
| Vercel Hobby | interzis pentru uz comercial |
| Cloudflare Workers pentru web (OpenNext) | planul gratuit: 10 ms CPU per cerere și 3 MiB per Worker, prea puțin pentru această aplicație; plătit $5/lună și tot rămâne nevoie de un server pentru worker |
| Koyeb Free | instanța gratuită nu poate fi worker, 512 MB RAM, adoarme după o oră fără trafic |
| Render, Railway, Fly.io | worker-ele sunt doar plătite sau cu credit unic de probă |
| Google Cloud Run | gratuit per cerere; o instanță mereu pornită se plătește |
| AWS, Azure | credite sau gratuitate limitată în timp, mașini de 1 GB RAM |
| Scaleway Serverless Jobs (worker pornit la nevoie) | aproape gratuit (~27 ore de procesare/lună incluse), dar cere reproiectarea worker-ului și trimiterea emailurilor de autentificare din aplicație (pornirea la rece de 10–30 s e prea lentă pentru cod); de reluat dacă serverul gratuit dispare |
| **Supabase Pro + server gratuit, fără R2** | $25/lună fix, **fără modificări de cod** în aplicație (doar livrarea); compromis bun dacă $25/lună e acceptabil |

---

## 6. Pașii

1. **Livrarea pe server propriu** — *implementat*: imaginile `memories-web` și `memories-worker`
   în GitHub Container Registry (`arm64` + `amd64`), Docker Compose cu Cloudflare Tunnel, antetul
   IP de încredere pentru limitarea per IP în spatele Cloudflare, ghidul
   [livrare-server-propriu.md](livrare-server-propriu.md).
2. **Funcționalitatea 003 (Spec Kit): stocarea în Cloudflare R2 + backup-uri.**
   - upload reluabil prin **S3 multipart cu URL-uri presemnate** în loc de TUS (fișierele merg tot
     direct din browser în stocare, principiul IV);
   - URL-urile semnate din galerie generate pentru R2 (7 fișiere din `apps/web`);
   - finalizarea uploadului: astăzi un rând în `storage.objects` declanșează procesarea; cu R2,
     browserul anunță serverul, care verifică fișierul în R2 înainte de a-l pune în coadă;
   - verificarea accesului la fișiere trece din politicile Storage în codul serverului;
   - worker-ul folosește deja API-ul S3: doar configurare;
   - `pg_dump` zilnic în R2;
   - **amendament la constituție**: „Constrângeri tehnologice” numește Supabase Storage; devine
     „stocare compatibilă S3, în UE”.
3. **La primii clienți constanți:** Supabase Pro ($25/lună), plătit din încasări.

---

## Surse

- Supabase: [Pricing](https://supabase.com/pricing) ·
  [Free tier limits 2026](https://www.itpathsolutions.com/supabase-free-tier-limits) ·
  [Pro plan 2026](https://flexprice.io/blog/supabase-pricing-breakdown)
- Vercel: [Hobby Plan](https://vercel.com/docs/plans/hobby) ·
  [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- Cloudflare: [R2 data location (jurisdicție UE)](https://developers.cloudflare.com/r2/reference/data-location/) ·
  [R2](https://www.cloudflare.com/products/r2/) ·
  [R2 pricing 2026](https://dev.to/nayankyada/cloudflare-r2-pricing-2026-free-tier-limits-egress-costs-when-to-upgrade-52ph) ·
  [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) ·
  [OpenNext](https://opennext.js.org/cloudflare) ·
  [Tunnel complet gratuit](https://bex.co/blog/2026/07/28/cloudflare-tunnel-free-zero-open-ports-ingress)
- Oracle: [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) ·
  [InfoQ: limitele înjumătățite](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- Scaleway: [Serverless pricing](https://www.scaleway.com/en/pricing/serverless/) ·
  [Containers pricing](https://www.scaleway.com/en/pricing/containers/) ·
  [Instances pricing](https://www.scaleway.com/en/pricing/virtual-instances/)
- Koyeb: [Free tier](https://www.srvrlss.io/provider/koyeb/) ·
  [Instances](https://www.koyeb.com/docs/reference/instances)
- Email: [Brevo free plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) ·
  [Resend 2026](https://www.buildmvpfast.com/alternatives/resend)

# Raport de implementare — 001 Bucla de bază: eveniment, cod QR, upload invitați, galerie organizator

**Branch**: `001-event-qr-upload` | **Data**: 2026-09-24 | **Constituție**: v1.2.0
**Documente**: [spec](./spec.md) · [plan](./plan.md) · [research](./research.md) ·
[data-model](./data-model.md) · [contracte](./contracts/) · [quickstart](./quickstart.md) ·
[tasks](./tasks.md)

## 1. Ce s-a realizat

### Povești de utilizator

| Poveste | Prioritate | Stare | Ce poate face utilizatorul |
| --- | --- | --- | --- |
| US1 — Admin + cod QR | P1 | ✅ | autentificare prin link pe email + cod TOTP; creare/editare eveniment cu preț de bază și perioadă de păstrare; cod QR PNG 2400×2400 și SVG; ștergere definitivă a evenimentului |
| US2 — Upload invitați | P1 | ✅ | pagina `/e/[token]` fără cont; selecție multiplă și cameră; progres per fișier; mesaje clare în română pentru limite și stări |
| US3 — Galerie organizator | P1 | ✅ | doar evenimentele proprii; galerie cronologică cu nume de invitat; poze HEIC și video vizualizabile |
| US4 — Descărcare | P2 | ✅ | original individual și arhivă ZIP a întregului eveniment, anunțată în pagină când e gata |
| US5 — Ștergere | P2 | ✅ | selecție multiplă, confirmare, ștergere definitivă (inclusiv linkurile emise anterior) |
| US6 — Reluare upload | P2 | ✅ | pauză/reluare la căderea rețelei; reselectarea doar a fișierelor neterminate după reîncărcare; reîncercare manuală |
| US7 — Galerie live | P3 | ✅ | fișierele noi apar fără reîncărcare, recuperare fără duplicate după reconectare |
| US8 — Retenție și preț | P2 | ✅ | organizatorul prelungește păstrarea și vede noul preț; avertizări pe email la 30/7/1 zile; ștergere automată; anonimizare după 3 ani; catalog editabil de admin |

### Cerințe

- **FR-001–FR-047**: toate au implementare și cel puțin un test automat asociat (maparea e în
  `tasks.md`).
- **Criterii de succes**: SC-002, SC-005–SC-015 sunt verificate automat (secțiunea 3).
  SC-001 și SC-003 (timpi măsurați cu oameni reali) și SC-004 (indicator după lansare) nu pot fi
  verificate automat — vezi secțiunea 4.

### Sarcini

**143 din 144** sarcini din `tasks.md` sunt finalizate. Rămâne **T144**: rularea manuală a
scenariilor din quickstart pe telefoane reale, cronometrarea SC-001/SC-003 și bifarea
rezultatelor în descrierea PR-ului — necesită o persoană și dispozitive fizice.

### Ce conține codul

| Zonă | Conținut principal |
| --- | --- |
| `supabase/migrations/` (15 migrații) | schemă, RLS pe toate tabelele, bucket-uri private, funcții SQL pentru invitați, admin, arhive, ștergere, retenție, anonimizare; joburi `pg_cron`; coada `pgmq` |
| `apps/web/` | Next.js 16: pagina invitatului, galeria organizatorului, administrare, autentificare, proxy cu CSP pe nonce, localizare în română |
| `apps/worker/` | worker Node 24 în Docker: procesare media, arhive, ștergeri, expirare, emailuri de avertizare |
| `packages/shared/` | tipuri generate din baza de date, limite, coduri de eroare, calculul datei de ștergere, denumirile din arhivă |
| `fixtures/media/` | fișiere media sintetice (HEIC, JPEG și MOV cu GPS, MP4, fișiere false/corupte) |
| `tests/load/`, `tests/perf/` | test de încărcare k6 și test de performanță pentru arhivă |
| `.github/workflows/ci.yml` | lint → typecheck → teste unitare → DB → worker în Docker → e2e; publicarea imaginii worker-ului pe `main` |

## 2. Cum s-a realizat

### Arhitectura implementată

- **Upload direct în stocare**: serverul emite pentru fiecare fișier o rezervare (verificări de
  tip, dimensiune, limită și frecvență într-o singură funcție SQL tranzacțională) și un token de
  upload semnat. Browserul încarcă prin TUS direct în Supabase Storage; fișierele nu trec prin
  serverul aplicației (principiul IV).
- **Procesare asincronă**: finalizarea uploadului declanșează un trigger care pune un job în
  coada `pgmq`. Worker-ul curăță metadatele cu ExifTool (fără re-encodare), verifică apoi că nu
  a rămas niciun tag de locație, generează variante WebP, o versiune de redare H.264 ≤ 1080p și
  un poster.
- **Arhive în streaming**: fiecare original e citit din S3 doar când îi vine rândul și scris în
  ZIP (STORE, ZIP64 automat) direct într-un upload multipart; nicio arhivă completă în memorie.
- **Securitate**: RLS pe toate tabelele și pe `storage.objects`; organizatorul nu vede tokenul
  public; administratorul vede doar agregate, niciodată media; accesul la media doar prin URL-uri
  semnate de 15 minute; cheia service role doar pe server.
- **Retenție**: data ștergerii se calculează în Postgres (în ora României); prelungirea trece
  doar printr-o funcție SQL care refuză opțiunile mai scurte și un preț diferit de cel afișat;
  `pg_cron` pune în coadă avertizările, expirarea și anonimizarea.

### Abateri de la plan, descoperite la implementare

Toate sunt documentate în `research.md` sau în contracte.

| Abatere | Motiv | Unde e documentată |
| --- | --- | --- |
| HEIC decodat cu `heif-dec`, nu cu `sharp` compilat pe libvips-ul sistemului | `sharp` 0.35.4 cere libvips ≥ 8.18.6, iar Debian 13 are 8.16.1 | research R5 |
| Limite de frecvență ridicate (300 sesiuni/min per IP și per eveniment, 2000 rezervări/min per eveniment) | valorile inițiale ar fi blocat 200 de invitați pe Wi-Fi-ul sălii (SC-006) | research R13 |
| Reluarea rezervărilor nefinalizate (`p_replace_media_id`) | reselectarea după reîncărcare și reîncercarea manuală ar fi consumat de două ori limita de fișiere | research R13, contract web |
| Endpoint TUS `/storage/v1/upload/resumable/sign` | varianta pentru token semnat; `/upload/resumable` răspunde 403 fără JWT | contract web |
| Token Realtime setat explicit înainte de abonare | altfel canalul rula ca `anon` și filtrele erau respinse | research R10 |
| Fișierele din care locația nu poate fi eliminată nu se servesc | un JPEG trunchiat cu GPS nu poate fi rescris de ExifTool; constituția interzice servirea locației | spec (cazuri limită), worker |
| Ștergerea curăță tot prefixul fișierului | o procesare în curs putea produce variante după ștergere | research R11, worker |
| Sentry 11: `dataCollection` în loc de `sendDefaultPii` | API schimbat; valorile implicite colectau date personale | cod (web și worker) |
| Formular de login nativ (Server Action) | funcționează și înainte de hidratare (conexiuni lente, WebKit) | cod |
| Paginile admin redirecționează în loc să arunce `FORBIDDEN` | layout-ul și pagina se randează în paralel; evită rapoarte false în Sentry | cod |
| Config Supabase local: providerul email activ, limite Auth ridicate | CLI-ul dezactiva complet loginul pe email; suita e2e depășea limita per IP | `supabase/config.toml` |

## 3. Verificare

Toate rezultatele sunt din rulări locale (Supabase local în Docker, Windows 11, Node 24.21.0).

| Suită | Rezultat |
| --- | --- |
| Lint (ESLint strict, type-aware) și typecheck (TypeScript 7.0) | trec |
| Unitare (shared + web) | 45/45 |
| Bază de date: RLS și funcții SQL | 82/82 |
| Worker, rulat în imaginea Docker (HEIC, GPS, H.264, arhive, retenție, email în Mailpit) | 25/25 |
| e2e Playwright: desktop Chromium, Pixel 7, iPhone 15 (WebKit) | 101 trec, 4 sărite intenționat |
| Accesibilitate axe WCAG 2.2 AA, toate ecranele, trei browsere | 0 încălcări |

Măsurători:

| Criteriu | Rezultat local | Prag |
| --- | --- | --- |
| SC-002 — LCP `/e/[token]`, Slow 4G + CPU 4× | median ~0,5 s | < 2,5 s |
| SC-006 — 200 de invitați, același IP, 5 fișiere fiecare (256 KB) | 2 400/2 400 verificări, 0 erori, p95 rezervare 629 ms, p95 pagină 1,84 s | 0 erori, p95 < 1 s |
| SC-007 — poză nouă în galeria deschisă | < 10 s (test e2e) | ≤ 10 s |
| SC-010 — arhivă de 1.000 de fișiere (1 MB fiecare) | gata în 76 s, primul octet în 2 s, 1.000/1.000 sume de control | ≤ 15 min, < 10 s |
| SC-011 — linkuri semnate după ștergere | ≥ 400 în cel mult 60 s | 0% accesibile |
| SC-009 — locație în fișierele servite | 0 taguri (JPEG, HEIC, MOV) | 0 |

## 4. Limitări și pași următori

### Ce nu a putut fi verificat

- **T144 / SC-001 / SC-003**: scenariile manuale și cronometrarea pe telefoane reale.
- **Redarea video efectivă**: Chromium din Playwright nu are codecul H.264; e2e verifică sursa
  de redare, iar codecul e verificat cu ffprobe. Redarea trebuie confirmată în Safari și Chrome.
- **Fișiere de pe telefoane reale**: fixture-urile sunt sintetice (ffmpeg/libheif).
- **Volumul real**: testul k6 cu 3 MB/fișier și arhiva de 10 GB trebuie rulate pe preview.
  Estimare pentru 10 GB, din debitul local (~13 MB/s): ~13 minute, aproape de limita de 15.
- **Reluarea după cădere de rețea** e testată doar pe Chromium (încetinire prin CDP).
- **CI pe GitHub** nu a rulat încă (prima rulare va fi pe acest PR).

### Înainte de producție

1. Rularea T144 și bifarea scenariilor în descrierea PR-ului.
2. Testele de încărcare și de arhivă pe preview, cu volumele reale.
3. Proiectele de producție: Supabase `eu-central-1` (PITR dezactivat), Vercel `fra1`, Resend
   `eu-west-1` (SMTP pentru Auth și worker), Scaleway `fr-par`, Sentry UE.
4. Acordurile de prelucrare a datelor (DPA) cu Vercel, Supabase, Resend și Sentry.
5. Suplimentele reale din catalogul de retenție (seed: 3 luni inclus, 6 luni +49 lei, 12 luni
   +99 lei).

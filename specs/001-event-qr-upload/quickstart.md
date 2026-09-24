# Quickstart: validarea buclei de bază

Ghid de rulare și verificare end-to-end. Detaliile de interfață sunt în
[contracts/](./contracts/), modelul de date în [data-model.md](./data-model.md).

## Cerințe preliminare

- Node.js **24 LTS** (`.nvmrc`; mediul local cu Node 26 trebuie comutat: `fnm use` / `nvm use`)
- pnpm 12.6.0 prin Corepack (`corepack enable`)
- Docker (Supabase local și imaginea worker-ului)
- Supabase CLI 2.117.0 (dependență de dezvoltare, rulat cu `pnpm supabase …`)
- Fișiere de test în `fixtures/media/`: `iphone.heic` (cu GPS), `android.jpg` (cu GPS),
  `iphone-hevc.mov` (cu locație), `clip.mp4`, `big-50mb.jpg`, `fake.jpg` (text redenumit)

## Pornire locală

```bash
pnpm install --frozen-lockfile
pnpm supabase start                 # Postgres, Auth, Storage, Realtime, Mailpit
pnpm db:reset                       # migrații + seed: 1 admin (înrolează TOTP la prima autentificare), 2 organizatori
pnpm db:types                       # regenerează tipurile TypeScript din schemă
pnpm --filter worker docker:build   # imagine worker cu libvips+libheif+ffmpeg
pnpm --filter worker docker:run     # conectat la Supabase local
pnpm --filter web dev               # http://localhost:3000
```

Emailurile (magic link și avertizările de retenție trimise de worker, cu `SMTP_HOST` setat pe
Mailpit) apar la `http://localhost:54324` — nu se trimite niciun email real.

## Porți automate (identice cu CI)

```bash
pnpm lint            # eslint + typescript-eslint (TypeScript 6.0)
pnpm typecheck       # TypeScript 7.0, strict
pnpm test:unit       # Vitest
pnpm test:db         # Vitest pe Supabase local: matricea RLS + funcțiile SQL
pnpm --filter worker test         # fixtures reale: HEIC, GPS, HEVC
pnpm --filter worker docker:smoke # decodare HEIC în imaginea construită
pnpm test:e2e        # Playwright: desktop-chromium, mobile-chrome, mobile-safari
```

Rezultat așteptat: toate trec; orice eșec blochează merge-ul (constituția, principiul VI).

## Scenarii de validare manuală

| # | Scenariu | Pași | Rezultat așteptat | Acoperă |
| --- | --- | --- | --- | --- |
| 1 | Admin + MFA | `/login` cu emailul admin din seed → link din Mailpit → înrolare TOTP (cod QR sau secret afișat ca text) → cod TOTP | acces la `/admin/events`; fără TOTP, niciun ecran de administrare | FR-006a |
| 2 | Creare eveniment + QR | creează evenimentul (fereastră deschisă acum, 5 fișiere/invitat), descarcă `qr.png` și `qr.svg` | PNG 2400×2400; SVG valid; scanarea deschide `/e/{token}` | US1, FR-005, SC-001 |
| 3 | Token negeghicibil | compară tokenurile a două evenimente | 22 caractere base64url, fără prefix comun sistematic | FR-004 |
| 4 | Upload multiplu pe mobil | DevTools, profil „Slow 4G”, viewport iPhone; selectează 3 poze + 1 video | progres per fișier, confirmare „4 fișiere încărcate”; LCP < 2,5 s în raportul Lighthouse | US2, SC-002 |
| 5 | Limite și mesaje | al 6-lea fișier; `big-50mb.jpg` cu limita setată la 10 MB; `fake.jpg` | mesaje clare în română; `fake.jpg` ajunge `rejected` după verificarea tipului real | FR-017, FR-020 |
| 6 | Fereastră închisă | setează `upload_ends_at` în trecut; deschide linkul | mesajul „Uploadul s-a încheiat”, fără eroare tehnică | FR-020 |
| 7 | Reluare | DevTools → Offline la 50% dintr-un video; Online după 30 s | uploadul continuă de la ~50%, fără reselectare | US6, SC-005 |
| 8 | Reîncărcare pagină | reîncarcă pagina în timpul uploadului | fișierele finalizate listate; cele nefinalizate listate pentru reselectare | FR-016a |
| 9 | Galerie live | organizatorul are galeria deschisă; invitatul încarcă o poză | poza apare în ≤ 10 s, fără reîncărcare; video-ul apare „în procesare”, apoi redabil | US7, SC-007 |
| 10 | HEIC + video iPhone | `iphone.heic`, `iphone-hevc.mov` | se afișează / se redau în Chrome pe Windows și Safari | SC-008, SC-008a |
| 11 | Fără locație | descarcă originalele; `exiftool -G -a -gps:all -location:all fișier` | niciun tag de locație | SC-009 |
| 12 | Izolare | organizatorul B deschide URL-ul evenimentului lui A; adminul caută media | `FORBIDDEN` / 404; adminul vede doar numărul de fișiere și spațiul | FR-007, FR-009, SC-012 |
| 13 | Ștergere | selectează 3 fișiere, confirmă; după 60 s încearcă URL-urile semnate copiate înainte | 404 pentru toate variantele; arhiva existentă invalidată | US5, SC-011 |
| 14 | Arhivă | cere arhiva pentru un eveniment cu 50 de fișiere | anunț în galerie când e gata; ZIP cu 50 de fișiere originale curățate; cu un video încă în procesare, panoul arată „1 fișier nu este inclus” | US4 |
| 15 | Ștergere eveniment | admin → șterge, tastează numele | linkul `/e/{token}` arată „eveniment inexistent”; prefixele din Storage goale | FR-006b |
| 16 | Catalog retenție | `/admin/retention`: modifică suplimentul opțiunii de 6 luni | evenimentele existente cu 6 luni păstrează prețul final; opțiunea folosită nu poate fi ștearsă (`OPTION_IN_USE`) | FR-038, US8-6 |
| 17 | Creare cu preț | eveniment nou: preț de bază 299 lei, opțiunea 3 luni (implicită) | formularul arată prețul final (= prețul de bază) și data ștergerii = sfârșit upload + 3 luni; aceleași valori în listă după salvare | FR-039, FR-040, US1-8 |
| 18 | Prelungire | organizatorul → „Păstrarea fișierelor” → 12 luni → confirmă | opțiunile ≤ curentă nu se pot selecta; dialogul arată 398 lei (299 + 99); după o a doua deschidere, 6 luni nu mai e selectabilă; adminul vede același preț + rând în istoric (`organizer`) | FR-041–FR-043, SC-013 |
| 19 | Preț schimbat între timp | deschide dialogul de prelungire; adminul schimbă suplimentul; confirmă | `PRICE_CHANGED`, dialogul se reafișează cu prețul nou | R17 |
| 20 | Avertizări | `select enqueue_retention_notices(purge_at - interval '29 days')`, apoi `- 6 days`, apoi `- 12 hours` pe evenimentul de test; rulează fiecare pas de două ori | câte un email în Mailpit per prag, niciun duplicat la a doua rulare; după prelungire, niciun email pentru data veche | FR-045, SC-015 |
| 21 | Expirare | `select expire_due_events(purge_at + interval '1 minute')`; așteaptă worker-ul; încearcă URL-urile semnate copiate înainte, linkul `/e/{token}` și arhiva | prefixele din Storage goale; 404 peste tot după 60 s; organizatorul vede evenimentul „expirat”; adminul vede prețul și istoricul | FR-044, SC-014 |
| 22 | Anonimizare | pe evenimentul expirat din scenariul 21: `select anonymize_expired_events(expired_at + interval '3 years 1 day')`; așteaptă worker-ul | în `/admin/events` apare „Eveniment anonimizat”, fără email, cu prețul și datele; istoricul nu mai are autori; contul Auth al organizatorului (fără alte evenimente) a fost șters | FR-047 |

## Test de performanță al arhivei (înainte de producție)

Pe mediul preview, un eveniment seed-uit cu 1.000 de fișiere sintetice (≈ 10 GB, mix poze/video):
organizatorul cere arhiva cu galeria deschisă. Așteptat: anunțul „Arhiva e gata” apare fără
reîncărcare în ≤ 15 minute de la cerere; după click pe link, primul octet al descărcării sosește
în < 10 s; ZIP-ul conține 1.000 de intrări, cu sumele de control identice cu originalele curățate
(SC-010).

## Test de încărcare (înainte de producție)

Script k6 care simulează 200 de sesiuni de invitat pe același eveniment, de pe aceeași adresă
IP, fiecare cu 5 rezervări + upload TUS de 3 MB: 0 erori, p95 pentru `reserveUpload` < 1 s
(SC-006). Rulat pe mediul preview, niciodată pe producție.

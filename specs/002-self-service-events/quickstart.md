# Quickstart: validarea creării self-service

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Mediul local e cel din 001 ([quickstart 001](../001-event-qr-upload/quickstart.md), README):
Supabase CLI, worker în Docker, `pnpm --filter web dev`. Emailurile ajung în Mailpit:
<http://localhost:54324>.

## Pregătire

```bash
pnpm db:reset                                   # migrațiile 002 + seed (pachetul complet, documentele legale)
node scripts/ci-env.mjs --write                 # adaugă cheile de test Turnstile în .env
pnpm --filter worker docker:build && pnpm --filter worker docker:run
pnpm --filter web dev
```

Cheile de test Turnstile (local/CI): sitekey `1x00000000000000000000BB`, secret
`1x0000000000000000000000000000000AA`. Pentru scenariul de respingere, se pornește aplicația cu
`TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA`.

## Scenarii

| # | Scenariu | Pași | Rezultat așteptat | Cerințe |
| --- | --- | --- | --- | --- |
| 1 | Creare + cod | pe `/` completează o adresă nouă, un nume, o dată, bifează termenii, trimite; ia codul din Mailpit și introdu-l | ajungi la `/events/{id}`, stare „în așteptarea activării”, codul QR se descarcă (PNG, SVG) | FR-001–FR-009, SC-001 |
| 2 | Confirmare prin link pe alt dispozitiv | ca la 1, dar deschide linkul din Mailpit într-o fereastră privată | pagina arată numele evenimentului și butonul; după apăsare ești autentificat în fereastra privată | FR-007, SC-002 |
| 3 | Linkul fără buton | deschide linkul, nu apăsa; încearcă apoi codul | codul funcționează (linkul nu a consumat nimic) | FR-007, SC-003 |
| 4 | Adresă existentă vs nouă | trimite formularul cu `org-a@example.test` și cu o adresă nouă | același mesaj și aceeași pagină de cod | FR-003, SC-004 |
| 5 | Cod greșit de 5 ori | introdu 5 coduri greșite | cererea e invalidată; codul corect nu mai merge; „Cere un cod nou” funcționează | FR-008 |
| 6 | Organizator care revine | autentifică-te pe `/login` cu `org-a@example.test` (are un eveniment creat de admin) după ce a creat și unul self-service | lista arată ambele, cu starea fiecăruia | FR-010, FR-012 |
| 7 | Creare din cont | din `/events`, „Eveniment nou” | se creează direct, fără email; la a 3-a creare apare limita | FR-005, FR-021 |
| 8 | Invitat pe eveniment neactivat | deschide `/e/{token}` al evenimentului din scenariul 1 | mesaj politicos, fără formular | FR-032 |
| 9 | Cerere de activare | pe eveniment, „Solicită activarea” | email către admin în Mailpit; butonul arată data cererii și e indisponibil 24 h | FR-018a |
| 10 | Activare | ca admin, `/admin/events` → filtru „activare solicitată” → activează cu motiv | eveniment activ, preț și dată de ștergere; invitatul încarcă prin același cod QR; istoricul are rândul | FR-025, SC-011 |
| 11 | Activare repetată | rulează din nou `activate_event` pentru același eveniment (SQL, sursa `payment`, aceeași `external_ref`) | prețul și data ștergerii nu se schimbă | FR-026, SC-010 |
| 12 | Suspendare | ca admin, suspendă cu motiv; ca invitat încearcă upload; ca organizator deschide galeria | invitatul vede mesajul; organizatorul poate vedea, descărca, șterge, dar nu modifica sau prelungi | FR-028a, FR-031 |
| 13 | Modificare și ștergere | ca organizator, schimbă numele și data, apoi șterge (tastând numele) | codul QR rămâne același după modificare; după ștergere, linkul invitatului dă „nu a fost găsit” | FR-033, FR-035 |
| 14 | Curățenie | în SQL: mută `created_at` al unui eveniment neconfirmat cu 25 h în urmă și `pending_purge_at` al unuia neactivat în trecut; rulează `purge_unconfirmed_events()` și `purge_unactivated_events()` | ambele dispar; `app_audit_log` are ștergerea celui neactivat | FR-004, FR-019, SC-005, SC-013 |
| 15 | Avertizare | setează `pending_purge_at` peste 6 zile; rulează `enqueue_activation_notices()` de două ori | un singur email în Mailpit | FR-019, SC-013 |
| 16 | CAPTCHA respins | pornește web-ul cu secretul care eșuează; trimite formularul | mesaj de verificare eșuată; niciun eveniment creat, niciun email | FR-037, SC-007 |
| 17 | Limite de email | trimite de 4 ori în 15 minute pentru aceeași adresă | al 4-lea răspuns e identic, dar nu apare al 4-lea email | FR-036, SC-006 |

## Verificări automate

```bash
pnpm lint && pnpm typecheck
pnpm test:unit
pnpm test:db                                    # RLS, tranziții, limite, curățenie
pnpm test:worker                                # sau în imagine, ca în CI
pnpm test:e2e                                   # Playwright, cele trei proiecte
```

## Configurarea DNS pentru email

Pe domeniul de trimitere (exemplu `mail.memories.ro`; valorile exacte le afișează Resend în
*Domains → Add domain*, regiunea `eu-west-1`):

1. **SPF**: `TXT` pe `send.mail.memories.ro` (subdomeniul de bounce indicat de Resend):
   `v=spf1 include:amazonses.com ~all`, sau valoarea exactă afișată.
2. **Bounce (MAIL FROM)**: `MX` pe același subdomeniu, cu prioritatea și ținta afișate.
3. **DKIM**: `TXT` pe `resend._domainkey.mail.memories.ro`, cu cheia publică afișată.
4. **DMARC**: `TXT` pe `_dmarc.memories.ro`: la început
   `v=DMARC1; p=none; rua=mailto:dmarc@memories.ro; adkim=s; aspf=s`, apoi, după 2 săptămâni
   fără eșecuri în rapoarte, `p=quarantine`.
5. Așteaptă „Verified” în Resend. Verifică cu `dig TXT resend._domainkey.mail.memories.ro` și
   trimițând un email de test către <https://www.mail-tester.com> (țintă: 10/10).
6. **Aplicație**: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`,
   `SMTP_PASS=<cheie API>`, `SMTP_FROM="Memories <salut@mail.memories.ro>"` în worker. Aceeași
   configurare SMTP se pune în Supabase (*Authentication → SMTP Settings*).
7. **SC-008** (o singură dată per funcționalitate, pe preview): câte un email de confirmare către
   o adresă Gmail, una Outlook și una Yahoo; toate trebuie să ajungă în Inbox (nu Spam sau
   Promoții).

## Configurarea producției (Supabase și Cloudflare)

- **Supabase Auth**:
  - *Email*: OTP expiry 900 s, lungime 6; *Sign ups*: dezactivate (worker-ul creează
    utilizatorii prin API-ul administrativ);
  - *Bot and Abuse Protection*: CAPTCHA Turnstile, cu secretul de producție;
  - *Rate limits*: plafoanele din research R8.
- **Cloudflare Turnstile**: widget în modul „Managed”, domeniile aplicației (producție și
  preview); sitekey în `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, secret în `TURNSTILE_SECRET_KEY`
  (Vercel) și în Supabase.
- **DPA**: Cloudflare se adaugă la lista de procesatori (README, politica de confidențialitate).

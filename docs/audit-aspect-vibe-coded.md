# Audit „vibe-coded”: puncte de remediat

Rezultatul verificării aplicației față de lista de semnale „vibe-coded” (19 puncte). Din cele 19, **5 sunt de remediat** și sunt documentate mai jos. Punctul 16 (trei fonturi) nu e inclus: e o alegere de design intenționată, care așteaptă o decizie separată. Restul de 13 puncte nu sunt cazul.

Verificat pe `main` la `c820b08`, prin citirea codului din `apps/web` și `apps/worker` și prin pornirea serverului de dezvoltare. Supabase nu rula local, deci paginile care cer baza de date (`/`, `/terms`) au dat 500; `/login`, pagina 404 și `/favicon.ico` au fost verificate în browser.

| # | Punct | Stare | Prioritate |
|---|---|---|---|
| 2 | Fără favicon | De remediat | Mică (un fișier) |
| 4 | Fără pagină 404 custom | De remediat | Mare (vizibil, în engleză) |
| 6 | Fără stări de încărcare | Parțial | Mică |
| 10 | Fără imagine la partajare | De remediat | Medie |
| 14 | Fără stări hover pe butoane | De remediat (parțial) | Medie |

## Stare: remediat

Toate cele 5 puncte sunt rezolvate pe branch-ul `feat/lista-cerinte`:

- **2 (favicon):** `app/icon.png` (512 px) și `app/apple-icon.png` (180 px), litera „M” în Newsreader, paper pe cerneală.
- **4 (404 și erori):** `app/not-found.tsx`, `app/error.tsx` și `app/global-error.tsx`, în română, cu mesajele în `ro.ts`; erorile se raportează în Sentry.
- **6 (încărcare):** `loading.tsx` cu `PageSkeleton`, doar pe cele două liste de citire: `events` (organizator) și `admin/events`, în grupurile de rute `(liste)`. Alte pagini nu l-au primit, din două motive:
  - un `loading.tsx` trimite răspunsul înainte ca pagina să se rezolve, deci `notFound()` ar da 200 în loc de 404 (`events/[eventId]`, SC-012 din `gallery.spec.ts`);
  - conținutul din spatele lui se hidratează după restul paginii, iar un formular completat înainte își pierde valorile: testul `admin.spec.ts:63` a picat pe iPhone la `admin/events/new`. Paginile cu formulare (`new`, retenție, coduri de reducere, pachet) rămân fără schelet.
  URL-urile nu s-au schimbat.
- **10 (imagine de partajare):** `app/opengraph-image.png`, `metadataBase` din `APP_URL`, `openGraph` și `twitter` în layout; pagina `/e/[token]` are titlu și descriere generice și repetă imaginea explicită (altfel `openGraph` din pagină o înlocuiește pe cea din layout).
- **14 (hover):** `lib/ui.ts`, doar pe butoane active (`not-disabled:not-data-disabled:hover:`), cu tokeni existenți.

---

## 2. Fără favicon

**Constatare.** Nu există directorul `apps/web/public/` și nu există `icon.*`, `apple-icon.*` sau `favicon.ico` în `app/`. `GET /favicon.ico` întoarce 404, iar `<head>` nu conține niciun `<link rel="icon">`. Taburile browserului și marcajele apar fără iconiță.

**Dovezi.** `find` după `favicon*`, `icon*`, `apple-icon*` în `apps/web` (fără `node_modules`) găsește doar `components/ui/icons.tsx`, care nu e iconița site-ului. Răspunsul serverului: `/favicon.ico` → 404, `/icon` → 404.

**Remediere propusă.** Adaugă `app/icon.svg` (sau `.png`) și `app/apple-icon.png`; Next.js le leagă automat în `<head>`. Iconița trebuie să respecte limbajul „Foaie de contact” (cerneală `#1b1a17` pe hârtie `#f3eee4`, de exemplu litera „M” în Newsreader). Culorile vin din tokenii din `app/globals.css`.

**Atenție.** `lib/security/csp.ts` are `img-src 'self' blob: data: …`, deci iconița servită de pe același domeniu e permisă fără modificări.

---

## 4. Fără pagină 404 (și erori) custom

**Constatare.** Nu există `app/not-found.tsx`, `app/error.tsx` sau `app/global-error.tsx`. La o rută inexistentă apare 404-ul implicit al Next.js, în engleză: „404: This page could not be found.”. Aplicația e în română și are un limbaj vizual propriu, deci pagina iese complet din stil.

Aplicația apelează `notFound()` intenționat în mai multe locuri: `app/admin/layout.tsx:10`, `app/auth/mfa/page.tsx:15`, `app/events/[eventId]/page.tsx:54`, `app/admin/events/[eventId]/page.tsx:21,23`. Pentru un utilizator non-admin care deschide `/admin/...`, 404-ul e răspunsul prevăzut, deci pagina contează și ca ascundere a rutei de administrare.

La o eroare neprevăzută (de exemplu baza de date indisponibilă, cum s-a văzut local la `/`), utilizatorul primește ecranul implicit de eroare, tot fără stil și fără mesaj în română.

**Dovezi.** `find app -name not-found.tsx -o -name error.tsx -o -name global-error.tsx` nu întoarce nimic. `GET /nu-exista` → 404 cu textul în engleză.

**Remediere propusă.**
- `app/not-found.tsx`: titlu și text în română, ancorat în `SiteHeader` cu `context="public"`, link către `/`.
- `app/error.tsx` (segment) și `app/global-error.tsx` (rădăcină): mesaj în română, buton „Încearcă din nou” (`reset`), fără detalii tehnice.
- Textele intră în `lib/i18n/messages/ro.ts`, ca toate celelalte (testul `i18n.test.ts` verifică mesajele).
- Pagina 404 trebuie să rămână identică pentru „nu există” și „nu ai voie” (admin), ca să nu dezvăluie existența rutei.

---

## 6. Fără stări de încărcare (parțial)

**Constatare.** Starea `pending` există la nivel de formular: `LoginForm.tsx` și `CreateEventForm.tsx` dezactivează butonul și schimbă textul („Se trimite…”), iar galeria afișează „în procesare” pentru fișierele nefinalizate. Lipsește însă încărcarea la nivel de rută: nu există niciun `loading.tsx` și niciun `<Suspense>` în `app/`. Paginile din zona organizatorului și a administratorului (`/events`, `/events/[eventId]`, `/admin/...`) sunt randate pe server cu interogări la baza de date; la navigare, ecranul rămâne neschimbat până sosește răspunsul complet.

**Dovezi.** `find app -name loading.tsx` nu întoarce nimic; `grep Suspense` în `app/` nu găsește nimic.

**Remediere propusă.**
- `loading.tsx` în `app/events/` și `app/admin/` (și, dacă e nevoie, la nivel de eveniment), cu un schelet în limbajul vizual existent: linii și foi cu `ui.sheet`, fără animații zgomotoase.
- Respectă `prefers-reduced-motion`, care e deja tratat în `globals.css`.
- Culori doar din tokeni; scheletul nu trebuie să introducă culori noi (testul `design-language.test.ts` pică altfel).

---

## 10. Fără imagine la partajare

**Constatare.** `<head>` nu conține `og:title`, `og:description`, `og:image` sau `twitter:*`, iar `GET /opengraph-image` → 404. Doar `title` și `description` sunt setate, în `app/layout.tsx`. Linkul de upload (`/e/[token]`) e trimis de organizator invitaților, de obicei pe WhatsApp, iar acolo apare ca URL gol, fără card.

**Dovezi.** `<head>` pe `/login` conține doar `<meta name="description">`; nicio metaetichetă `og:` sau `twitter:`.

**Remediere propusă.**
- `app/opengraph-image.*` (static sau generat cu `ImageResponse`), 1200×630, cu numele „Memories” în Newsreader pe hârtie, în limbajul vizual al aplicației.
- `openGraph` și `twitter` în `metadata` din `app/layout.tsx`, plus `metadataBase` cu domeniul de producție (necesar ca URL-ul imaginii să fie absolut).
- Pentru `/e/[token]`: titlu și descriere generice, de exemplu „Adaugă pozele tale de la eveniment”.

**Decizii de luat.**
- Imagine statică sau generată din cod.
- Domeniul pentru `metadataBase`: `memories.avify.ro` (vezi memoria „Production setup”).

**Atenție (confidențialitate).** Pe `/e/[token]` imaginea trebuie să fie generică, niciodată o poză a evenimentului: linkul e un token secret, iar o previzualizare cu conținut ar expune pozele oricui primește mesajul. Metadata de pe pagina de upload nu trebuie să includă numele evenimentului sau al organizatorului, pentru același motiv.

`robots: { index: false }` rămâne: previzualizarea din mesagerie nu depinde de indexare.

---

## 14. Fără stări hover pe butoane (parțial)

**Constatare.** Linkurile au hover (`ui.link`, `ui.buttonText`, `SiteNav`), iar opțiunile din `SelectField` și rândurile din `DiscountCodesSheet` au `data-hovered`/`hover:bg-paper`. Dar butoanele definite în `lib/ui.ts`, adică `buttonPrimary`, `buttonPrimaryCompact`, `buttonPrimaryLarge`, `buttonSecondary`, `buttonSecondaryCompact`, `buttonDanger`, `buttonSuccess`, `buttonDangerCompact`, `buttonDangerSolid`, nu au niciun `hover:`. Au `cursor-pointer`, dar nu își schimbă aspectul sub cursor, deci nu confirmă că sunt interactive. Acestea sunt cele mai folosite elemente din aplicație.

**Dovezi.** `grep -n hover lib/ui.ts` găsește doar două linii: `buttonText` (rândul 61) și `link` (rândul 62).

**Remediere propusă.** Adaugă hover în constantele din `lib/ui.ts`, nu în fiecare componentă. Constantele sunt un singur punct de modificare, iar ecranele le compun.
- Butoane pline (`primary`, `buttonDangerSolid`): un fundal ușor diferit, cu culori exclusiv din tokenii existenți.
- Butoane cu contur (`secondary`, `danger`, `success`): fundal `paper` sau `rule/40` la hover, ca la `SelectField`.
- Starea trebuie să funcționeze și pe tactil: pe telefon `hover:` poate rămâne „lipit” după atingere. Tailwind 4 aplică `hover:` doar pe dispozitive cu hover (`@media (hover: hover)`), deci e în regulă.
- Fără hover pe butoane dezactivate (`disabled:` și `data-disabled:` au deja `cursor-not-allowed` și opacitate).

**Constrângere.** Paleta e închisă la 9 culori și blocată de `tests/unit/design-language.test.ts`. O variantă „mai închisă” a cernelii se obține cu `bg-ink/90` sau cu un token existent, nu cu o culoare nouă. Dacă nu se potrivește, se adaugă un token în `globals.css`, iar testul se actualizează explicit (listă fixă de tokeni).

---

## Ordinea recomandată

1. 4 (404 și erori): cel mai vizibil.
2. 14 (hover pe butoane): o modificare într-un singur fișier.
3. 2 (favicon): rapid, dar necesită alegerea iconiței.
4. 10 (imagine de partajare): depinde de două decizii.
5. 6 (stări de încărcare): îmbunătățire, nu defect.

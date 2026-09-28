# Limbajul vizual — direcția „Foaie de contact”

Stare: implementat în `apps/web` și în emailuri (worker, șablonul Supabase). Machetele sunt pe
canvasul „Memories — propunere de design”; cardul de masă cu QR a rămas propunere.

## Cum se respectă

- **Tokenii** sunt singurele culori, raze, umbre și fonturi care există: `app/globals.css` șterge
  paleta implicită Tailwind (`--color-*: initial` etc.), deci `bg-gray-100` sau `rounded-lg` nu mai
  generează nimic.
- **Clasele comune** stau în `apps/web/lib/ui.ts` (butoane, câmpuri, secțiuni, dialoguri, tabele),
  plus `components/ui/` (`StatusStamp`, `Wordmark`, `NarrowPage`, iconițe). Ecranele le compun; o
  mărime diferită e o variantă nouă în `ui.ts`, nu o suprascriere.
- **Testul** `apps/web/tests/unit/design-language.test.ts` rulează în CI (`pnpm test:unit`) și pică
  la: culori din paleta Tailwind, hex/rgb în afara tokenilor (inclusiv în emailuri), alte raze decât
  `rounded-xs`/`rounded-full`, umbre în afara dialogurilor, `font-bold`, gradiente sau blur, alte
  fonturi, culori în `style`, emoji; verifică și contrastul WCAG al perechilor de tokeni.
- **„Un singur buton plin pe ecran”** nu se poate verifica static: e o regulă de review. Butonul
  plin e `ui.buttonPrimary` (sau `ui.buttonDangerSolid` într-un dialog de ștergere).

## De ce arăta „AI-style”

Interfața de dinainte era corectă funcțional și accesibilă, dar avea exact semnele unui șablon generat:

| Semn | Unde |
| --- | --- |
| Violet ca singur brand (`#5b21b6`, `brand-50` ca fundal de mesaje) | `app/globals.css`, `app/layout.tsx` (`themeColor`), 89 de utilizări `brand-*` în 37 de fișiere |
| `system-ui` peste tot, o singură greutate pentru titluri (`font-bold`) | `app/globals.css`, toate paginile |
| Carduri rotunjite cu umbră (`rounded-2xl shadow-sm`, `rounded-lg border` pe fiecare element) | `app/page.tsx`, 108 × `rounded-lg` |
| Pastile de stare în pasteluri Tailwind (`bg-amber-100`, `bg-green-100`, `bg-red-100`) | `app/events/page.tsx`, `app/events/[eventId]/page.tsx` |
| Galerie ca grilă de carduri identice, fără ritm | `components/gallery/GalleryGrid.tsx` |

Nimic din acestea nu spune „amintiri de la o nuntă”. Spune „dashboard”.

## Direcția

Aplicația strânge pozele unei singure seri. Interfața trebuie să arate ca un album bine legat:
hârtie caldă, cerneală, linii subțiri și numere de cadru, ca pe o foaie de contact de la
developare. Pozele invitaților sunt singura culoare vie de pe ecran.

### Culori

| Token | Valoare | Rol | Contrast pe hârtie |
| --- | --- | --- | --- |
| `paper` | `#F3EEE4` | fundalul paginii | — |
| `paper-raised` | `#FBF8F2` | formulare, foaia galeriei | — |
| `ink` | `#1B1A17` | text, butonul principal, focus | 15:1 |
| `ink-muted` | `#5E584E` | text secundar | 6,1:1 |
| `rule` | `#D6CEBF` | separatoare de 1 px (niciodată text) | — |
| `field` | `#7A7366` | bordura câmpurilor | 4,1:1 (≥ 3:1 cerut) |
| `accent` | `#B4441F` (teracotă) | numere de cadru, „live”, ștampila de așteptare | 4,8:1 |
| `danger` | `#8A1F14` (oxid) | doar ștergere definitivă și erori | 8:1 |
| `success` | `#2F5D3A` | încărcat, activ | 6,6:1 |

Accentul și pericolul diferă și prin luminozitate, nu doar prin nuanță; stările au mereu și text.

### Tipografie

- **Newsreader** (400, fără bold) — titluri, numele evenimentului, wordmark-ul „Memories”.
- **IBM Plex Sans** (400/500/600) — text și formulare.
- **IBM Plex Mono** (400/500) — tot ce e număr: codul de 6 cifre, date, procente, dimensiuni,
  numere de cadru, ștampile de stare.

Toate trei au diacriticele românești corecte (ș, ț cu virgulă). Se încarcă prin `next/font/google`
(`app/layout.tsx`), care le descarcă la build și le servește de pe domeniul propriu: CSP-ul rămâne
`font-src 'self'`. Subseturile sunt `latin` + `latin-ext`, cu `unicode-range`, deci browserul cere
doar ce folosește pagina; Plex Mono nu se preîncarcă (bugetul LCP < 2,5 s pe 4G).

### Reguli

1. Colțuri de 2 px, nu 8–16 px; fără umbre (dialogurile păstrează o umbră, doar ele plutesc).
2. Linii, nu carduri: grupăm cu separatoare de 1 px și spațiu.
3. Un singur buton plin (cerneală) pe ecran; restul sunt contururi sau linkuri subliniate.
4. Cifrele în mono.
5. Stările sunt ștampile: text mono majuscul, bordură de 1 px în culoarea stării, fără fundal.
6. Fără gradient, violet, sticlă mată, emoji sau iconițe decorative.

## Pe ecrane

- **Pagina principală** (`app/page.tsx`): titlu editorial mare în stânga, pașii 01–03 ca listă cu
  linii, formularul pe `paper-raised` în dreapta. Pe mobil, formularul vine imediat după titlu.
- **Pagina invitatului** (`app/e/[token]/page.tsx`, `components/upload/*`): data evenimentului în
  mono deasupra numelui, lista de fișiere ca registru (nume în mono, procent în dreapta, bară de
  2 px), butoanele fixate jos rămân (FR-036) dar pe o bandă cu linie de separare.
- **Galeria** (`components/gallery/GalleryGrid.tsx`): foaie de contact — cadre pătrate fără
  chenar, sub fiecare `#0147 · Nume · 21:43`; cadrul selectat primește contur de cerneală de 2 px,
  video are eticheta `VIDEO 0:42`. Arhiva și păstrarea devin o bandă cu două coloane, nu două carduri.
- **Lista evenimentelor** (`app/events/page.tsx`): registru cu linii, data în mono, numele în
  Newsreader și starea ca ștampilă.
- **Autentificare, cod, confirmare, MFA** (`components/ui/NarrowPage.tsx`): pagină îngustă, codul
  de 6 cifre în mono mare.
- **Administrare**: aceleași secțiuni deschise cu linie de cerneală, tabele cu antet mono și
  ștampile de stare în lista evenimentelor.
- **Emailurile** (`apps/worker/src/email/html.ts`, `supabase/templates/magic_link.html`): hârtie
  caldă, foaia pe mijloc, „Memories” în serif, codul în mono, acțiunea ca singurul buton plin.
- **Card de masă cu QR** (propunere, neimplementat): format A6 tipăribil, lângă `qr.png`/`qr.svg`.

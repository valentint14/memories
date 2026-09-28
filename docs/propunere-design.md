# Propunere de design — direcția „Foaie de contact”

Stare: propunere, neimplementată. Machetele interactive sunt pe canvasul
„Memories — propunere de design” (pagina principală, pagina invitatului, galeria organizatorului,
card de masă cu QR și sistemul vizual).

## De ce arată acum „AI-style”

Interfața actuală e corectă funcțional și accesibilă, dar are exact semnele unui șablon generat:

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
- **IBM Plex Mono** (500) — tot ce e număr: codul de 6 cifre, date, procente, dimensiuni,
  numere de cadru, ștampile de stare.

Toate trei au diacriticele românești corecte (ș, ț cu virgulă). Se încarcă prin `next/font/google`,
care le găzduiește local la build: CSP-ul rămâne `font-src 'self'`, fără cereri externe, iar pe
pagina invitatului se încarcă doar subsetul `latin-ext` (bugetul LCP < 2,5 s pe 4G).

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
- **Lista evenimentelor** (`app/events/page.tsx`): tabel/registru cu ștampile în loc de pastile.
- **Card de masă cu QR** (nou, opțional): format A6 tipăribil, generat lângă `qr.png`/`qr.svg`,
  cu numele evenimentului, data și nota scurtă de confidențialitate.
- **Emailurile** (`apps/worker/src/email/html.ts`): aceleași culori și codul în mono; fără imagini.

## Implementare propusă

1. `globals.css`: înlocuiește `--color-brand-*` cu tokenii de mai sus în `@theme`, `--radius-*`
   la 2 px, fundal `paper`; `:focus-visible` în `ink`.
2. `app/layout.tsx`: fonturile prin `next/font/google` ca variabile CSS; `themeColor: "#F3EEE4"`.
3. Înlocuire mecanică `brand-600/700` → `ink`, `brand-50` → `paper-raised` + `border-rule`,
   `rounded-lg`/`rounded-xl`/`rounded-2xl` → `rounded-xs`, eliminarea `shadow-sm`.
4. O componentă `StatusStamp` care înlocuiește hărțile `BADGE` din paginile organizatorului.
5. Galeria și lista de upload după machete.
6. Testele e2e existente (`a11y.spec.ts`, `lcp.spec.ts`) confirmă contrastul și bugetul LCP.

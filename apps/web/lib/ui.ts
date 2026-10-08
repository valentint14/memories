/**
 * Clasele comune ale limbajului vizual „Foaie de contact”: colțuri de
 * 2 px, linii în loc de carduri, un singur buton plin pe ecran, cifrele în mono. Ecranele compun
 * aceste clase în loc să-și inventeze stilurile; testul `design-language` blochează abaterile.
 *
 * Clasele nu se suprascriu între ele (ordinea utilitarelor Tailwind nu e garantată): unde e nevoie
 * de altă mărime există o variantă separată.
 */

/** Culoarea hârtiei, pentru `themeColor` (aceeași valoare ca `--color-paper`). */
export const PAPER = "#f3eee4";

const button =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xs px-5 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50";
const primary = `${button} bg-ink font-semibold text-paper-raised`;
const field = "rounded-xs border border-field bg-paper-raised px-3.5 text-ink aria-[invalid=true]:border-danger data-invalid:border-danger";

export const ui = {
  /** Titlul paginii: Newsreader, fără bold. */
  pageTitle: "font-serif text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl",
  /** Titlul unei secțiuni sau al unui dialog. */
  sectionTitle: "font-serif text-2xl leading-tight",
  /** Etichetă de secțiune sau de date: Plex Sans semibold, majuscule, ușor rărite (cifrele rămân în mono). */
  kicker: "font-sans text-xs font-semibold uppercase tracking-[0.06em]",
  /** Eticheta de pe un cadru (video, în procesare). */
  frameTag: "font-sans text-[11px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5",
  /** Date, coduri, dimensiuni, procente (fără mărime: se combină cu una). */
  data: "font-mono tabular-nums",

  label: "font-medium",
  hint: "text-sm text-ink-muted",
  fieldError: "text-sm text-danger",
  input: `${field} min-h-12 text-base`,
  /** Câmp de pe o bară de instrumente (căutare lângă filtre). */
  inputCompact: `${field} min-h-10 text-sm`,
  /** Câmpul pentru codul de 6 cifre. */
  codeInput: `${field} min-h-14 font-mono text-2xl font-medium tracking-[0.4em] tabular-nums`,
  textarea: `${field} py-3 text-base`,
  checkbox: "size-5 shrink-0 accent-ink",

  /** Acțiunea principală: singurul buton plin de pe ecran. */
  buttonPrimary: `${primary} min-h-12`,
  /** Acțiunea principală pe o bară (antetul fișei unui eveniment), la înălțimea lui `inputCompact`. */
  buttonPrimaryCompact: `${primary} min-h-10 text-sm`,
  /** Acțiunea principală a invitatului, în banda fixată jos. */
  buttonPrimaryLarge: `${primary} min-h-14 text-lg`,
  /** Acțiuni secundare: contur de cerneală. */
  buttonSecondary: `${button} min-h-12 border border-ink font-medium text-ink`,
  /** Acțiune secundară pe o bară de instrumente, la înălțimea lui `inputCompact`. */
  buttonSecondaryCompact: `${button} min-h-10 border border-ink text-sm font-medium text-ink`,
  /** Ștergere definitivă, în afara dialogului de confirmare; și acțiunea secundară refuzată (cod de reducere greșit). */
  buttonDanger: `${button} min-h-12 border border-danger font-medium text-danger`,
  /** Acțiune secundară reușită (cod de reducere aplicat): contur verde. */
  buttonSuccess: `${button} min-h-12 border border-success font-medium text-success`,
  /** Ștergere pe o bară de instrumente (bara galeriei), la înălțimea lui `inputCompact`. */
  buttonDangerCompact: `${button} min-h-10 border border-danger text-sm font-medium text-danger`,
  /** Confirmarea finală a unei ștergeri, în dialog (acțiunea principală a dialogului). */
  buttonDangerSolid: `${button} min-h-12 bg-danger font-semibold text-paper-raised`,
  /** Acțiune discretă: text subliniat. */
  buttonText:
    "inline-flex min-h-11 cursor-pointer items-center font-medium text-ink underline underline-offset-4 hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50 data-disabled:opacity-50",
  link: "font-medium text-ink underline underline-offset-4 hover:text-ink-muted",

  /** Informație neutră: foaie deschisă, linie subțire, fără umbră. */
  notice: "rounded-xs border border-rule bg-paper-raised p-4",
  /** Atenționare (în așteptare, rețea, sesiune de administrator): contur teracotă. */
  caution: "rounded-xs border border-accent bg-paper-raised p-4",
  /** Eroare de pagină. */
  alert: "rounded-xs border border-danger bg-paper-raised p-4 text-danger",
  /**
   * Pagina organizatorului și a autentificării: o singură coloană centrată, de lățimea unui
   * formular. Foile stau una sub alta, cu aceeași lățime pe orice ecran (fără foi alăturate).
   */
  pageColumn: "mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10",
  /** Secțiune: se deschide cu o linie de cerneală, nu cu o cutie. */
  section: "flex flex-col gap-4 border-t border-ink pt-4",
  /** Foaie: ramă subțire cu o bandă de titlu sus (galeria, fișa unui eveniment). */
  sheet: "flex flex-col rounded-xs border border-rule bg-paper-raised",
  sheetDanger: "flex flex-col rounded-xs border border-danger bg-paper-raised",
  sheetTitle: "font-sans text-xs font-semibold uppercase tracking-[0.06em] border-b border-rule px-4 py-3 text-ink-muted",
  sheetTitleDanger: "font-sans text-xs font-semibold uppercase tracking-[0.06em] border-b border-danger px-4 py-3 text-danger",
  sheetBody: "flex flex-1 flex-col gap-4 p-4",
  /** Banda unei foi cu înălțime fixă (48 px), pentru foi alăturate cu sau fără ștampilă în bandă. */
  sheetBar:
    "flex min-h-12 items-center justify-between gap-3 border-b border-rule px-4 font-sans text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted",
  /** Banda unei foi care se deschide (`<details class="group">`): linia de sub ea apare doar deschisă. */
  sheetSummary:
    "flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-sans text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted group-open:border-b group-open:border-rule [&::-webkit-details-marker]:hidden",
  /** Ca `sheetBar`, în teracotă: grupa care cere atenție (cererile de activare). */
  sheetBarAccent:
    "flex min-h-12 items-center justify-between gap-3 border-b border-rule px-4 font-sans text-xs font-semibold uppercase tracking-[0.06em] text-accent",
  /**
   * Bara de acțiuni a unei foi (singurul loc al butoanelor dintr-o foaie): imediat după conținut;
   * pe ecrane late la dreapta, cu acțiunea principală ultima; pe telefon pe toată lățimea, principala sus.
   * Fără linie deasupra și fără spațiu propriu: deasupra butoanelor e aceeași distanță ca între
   * celelalte rânduri ale foii sau ale formularului. Se folosește prin `SheetActions`. Fără butoane
   * (de ex. cererea de activare trimisă), bara dispare, ca foaia să nu aibă spațiu gol jos.
   */
  sheetActions:
    "flex flex-col-reverse gap-3 empty:hidden sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto",
  /** Formularul unei foi: rândurile lui, apoi bara de acțiuni, la aceeași distanță. */
  sheetForm: "flex flex-1 flex-col gap-5",

  overlay: "fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4",
  dialog: "w-full max-w-md rounded-xs border border-ink bg-paper-raised p-6 shadow-dialog",
  dialogTitle: "font-serif text-2xl leading-tight",
  dialogActions: "flex flex-wrap justify-end gap-3 border-t border-rule pt-4",
  /** Butoanele unui dialog al cărui conținut se încheie deja cu o linie (de ex. o listă încadrată). */
  dialogActionsBare: "flex flex-wrap justify-end gap-3",

  table: "w-full border-collapse text-left",
  th: "px-2 py-3 font-sans text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted",
  theadRow: "border-b border-ink",
  row: "border-b border-rule",
  td: "p-2 align-top",
} as const;

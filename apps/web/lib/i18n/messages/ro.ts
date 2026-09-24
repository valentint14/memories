/**
 * Dicționarul în română (constituția, principiul VIII). Cheile sunt plate și tipate;
 * un viitor `en.ts` trebuie să satisfacă `Messages`.
 * Valorile plurale au formele `one` / `few` / `other` (Intl.PluralRules('ro')); `{count}` se înlocuiește.
 */

export interface PluralMessage {
  one: string;
  few: string;
  other: string;
}

export const ro = {
  // Erori (packages/shared/src/errors.ts)
  "errors.EVENT_NOT_FOUND": "Evenimentul nu a fost găsit. Verifică linkul primit.",
  "errors.UPLOAD_NOT_STARTED": "Încărcarea pozelor nu a început încă.",
  "errors.UPLOAD_ENDED": "Perioada de încărcare pentru acest eveniment s-a încheiat.",
  "errors.FILE_LIMIT_REACHED": "Ai atins limita de fișiere pentru acest eveniment.",
  "errors.FILE_TOO_LARGE": "Fișierul este prea mare.",
  "errors.FILE_TYPE_NOT_ALLOWED": "Acest tip de fișier nu este acceptat. Poți încărca poze (JPEG, PNG, HEIC, WebP) și video (MP4, MOV).",
  "errors.RATE_LIMITED": "Prea multe încercări. Reîncearcă puțin mai târziu.",
  "errors.SESSION_MISSING": "Sesiunea a expirat. Reîncarcă pagina.",
  "errors.NAME_TOO_LONG": "Numele poate avea cel mult 50 de caractere.",
  "errors.FORBIDDEN": "Nu ai acces la această pagină.",
  "errors.NOT_READY": "Fișierul se procesează încă. Încearcă din nou în câteva momente.",
  "errors.ARCHIVE_EXPIRED": "Arhiva nu mai este disponibilă. Cere o arhivă nouă.",
  "errors.EMPTY_EVENT": "Evenimentul nu are încă fișiere.",
  "errors.VALIDATION": "Unele câmpuri nu sunt completate corect.",
  "errors.NOT_FOUND": "Nu a fost găsit.",
  "errors.CONFIRMATION_MISMATCH": "Numele tastat nu corespunde numelui evenimentului.",
  "errors.INVALID_CODE": "Codul nu este corect sau a expirat.",
  "errors.RETENTION_NOT_LONGER": "Poți alege doar o perioadă mai lungă decât cea curentă.",
  "errors.RETENTION_EXPIRED": "Perioada de păstrare s-a încheiat; fișierele au fost șterse.",
  "errors.PRICE_CHANGED": "Prețul s-a schimbat între timp. Verifică noul preț și confirmă din nou.",
  "errors.OPTION_INACTIVE": "Această opțiune nu mai este disponibilă.",
  "errors.OPTION_IN_USE": "Opțiunea este folosită de evenimente și nu poate fi ștearsă. O poți dezactiva.",
  "errors.DUPLICATE_MONTHS": "Există deja o opțiune cu această durată.",
  "errors.RETENTION_DATE_IN_PAST": "Cu această modificare, data ștergerii automate ar fi în trecut.",
  "errors.EVENT_NOT_ACTIVE": "Evenimentul nu mai poate fi modificat.",
  "errors.EVENT_EXPIRED": "Perioada de păstrare a evenimentului s-a încheiat; fișierele au fost șterse.",
  "errors.INTERNAL": "A apărut o eroare. Reîncearcă.",
  "errors.retryAfter": "Reîncearcă în {seconds} secunde.",

  // Autentificare
  "login.title": "Autentificare",
  "login.intro": "Primești pe email un link de autentificare, fără parolă. Linkul expiră într-o oră.",
  "login.email": "Adresa de email",
  "login.submit": "Trimite linkul",
  "login.sending": "Se trimite…",
  "login.sent": "Dacă adresa are acces, vei primi în câteva momente un email cu linkul de autentificare.",
  "login.linkInvalid": "Linkul a expirat sau a fost deja folosit. Cere un link nou mai jos.",

  // Upload
  "upload.limitReached": "Ai atins limita de {limit} fișiere pentru acest eveniment.",

  // Plurale
  "plural.files": { one: "{count} fișier", few: "{count} fișiere", other: "{count} de fișiere" },
} as const satisfies Record<string, string | PluralMessage>;

export type Messages = { [K in keyof typeof ro]: (typeof ro)[K] extends PluralMessage ? PluralMessage : string };

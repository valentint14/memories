/**
 * Textele emailurilor în română (constituția VIII): șabloanele nu conțin texte, doar structură.
 * Un viitor `en.ts` trebuie să satisfacă `EmailMessages`.
 */
export const ro = {
  product: "Memories",
  greeting: "Bună ziua,",
  ignore: "Dacă nu tu ai cerut acest email, îl poți ignora.",
  validity: "Codul și linkul sunt valabile 15 minute și pot fi folosite o singură dată.",
  codeLabel: "Codul tău",
  confirmation: {
    subject: (code: string) => `Confirmă evenimentul tău Memories — cod ${code}`,
    intro: (eventName: string) => `Ai cerut crearea evenimentului „${eventName}” în Memories.`,
    action: "Pentru confirmare, introdu codul de mai jos în pagina deschisă sau apasă pe link:",
    button: "Confirmă evenimentul",
  },
  login: {
    subject: (code: string) => `Codul tău de autentificare Memories: ${code}`,
    intro: "Ai cerut autentificarea în contul tău Memories.",
    action: "Introdu codul de mai jos în pagina deschisă sau apasă pe link:",
    button: "Intră în cont",
  },
  activationRequest: {
    subject: (eventName: string) => `Cerere de activare: ${eventName}`,
    intro: "Un organizator a cerut activarea pachetului complet.",
    event: "Eveniment",
    date: "Data evenimentului",
    organizer: "Organizator",
    requestedAt: "Cerere trimisă la",
    open: "Deschide evenimentul în administrare",
  },
  unactivatedNotice: {
    subject: (eventName: string, date: string) => `Evenimentul „${eventName}” se șterge pe ${date}`,
    intro: (eventName: string, date: string) =>
      `Evenimentul „${eventName}” nu a fost încă activat și va fi șters automat pe ${date}, împreună cu codul QR.`,
    howTo: (price: string) =>
      `Pentru a-l păstra și a permite invitaților să încarce fișiere, activează-l plătind online pachetul complet (${price}) din pagina evenimentului.`,
    open: "Deschide pagina evenimentului",
  },
  paymentConfirmation: {
    subject: (eventName: string) => `Plata pentru „${eventName}” a fost primită`,
    introActivation: (eventName: string, amount: string, date: string) =>
      `Am primit plata de ${amount} pentru evenimentul „${eventName}”, pe ${date}. Evenimentul este activ.`,
    introExtension: (eventName: string, amount: string, date: string) =>
      `Am primit plata de ${amount} pentru prelungirea păstrării fișierelor evenimentului „${eventName}”, pe ${date}.`,
    retention: (months: string, purgeDate: string) => `Perioada de păstrare: ${months}. Fișierele se șterg automat pe ${purgeDate}.`,
    guestsCanUpload: "Invitații pot încărca de acum pozele și filmările, scanând codul QR sau deschizând linkul evenimentului.",
    receipt: "Chitanța plății vine separat, pe email, de la procesatorul de plăți Stripe.",
    open: "Deschide pagina evenimentului",
  },
  adminPaymentNotice: {
    subject: (eventName: string) => `Plată de verificat: ${eventName}`,
    reasons: {
      EVENT_NOT_AWAITING: "A sosit o plată de activare pentru un eveniment care nu mai era în așteptarea activării (activat manual, suspendat sau expirat între timp).",
      DUPLICATE_PAYMENT: "A sosit a doua plată reușită pentru activarea aceluiași eveniment.",
      EVENT_DELETED: "A sosit o plată pentru un eveniment care fusese deja șters.",
      EXTENSION_NOT_POSSIBLE: "A sosit o plată pentru o prelungire a păstrării care nu mai este posibilă (eveniment expirat, suspendat sau cu o perioadă deja egală sau mai lungă).",
      DISPUTE: "Organizatorul a contestat plata la bancă.",
      RETENTION_MANUAL:
        "Plata prelungirii a fost rambursată, dar păstrarea nu a putut fi readusă automat (a fost schimbată între timp sau data de dinainte e prea aproape).",
    },
    actionRefund: "Ce ai de făcut: rambursează plata din contul Stripe (Payments › plata › Refund).",
    actionRetention: "Ce ai de făcut: ajustează păstrarea din fișa evenimentului, din editarea evenimentului.",
    actionDispute:
      "Ce ai de făcut: răspunde contestației din contul Stripe. Dacă evenimentul era activ, a fost suspendat automat; reactivează-l din administrare după rezolvarea disputei.",
    event: "Eveniment",
    organizer: "Organizator",
    amount: "Suma",
    paidAt: "Plătită la",
    reference: "Referința Stripe",
    open: "Deschide evenimentul în administrare",
    deleted: "(eveniment șters)",
  },
};

export type EmailMessages = typeof ro;

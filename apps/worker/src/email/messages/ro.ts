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
      `Pentru a-l păstra și a permite invitaților să încarce fișiere, solicită activarea pachetului complet (${price}) din pagina evenimentului.`,
    open: "Deschide pagina evenimentului",
  },
};

export type EmailMessages = typeof ro;

import "server-only";

/**
 * Datele de identificare ale prestatorului (denumire, CUI, număr de înregistrare, sediu, contact),
 * afișate în subsolul paginilor și pe paginile legale. Vin din variabile de mediu, ca să nu stea în
 * repository; o variabilă lipsă înseamnă doar că rândul respectiv nu se afișează.
 */
export interface BusinessDetails {
  name: string | null;
  taxId: string | null;
  registrationNo: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
}

function optional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? null : value;
}

export function businessDetails(): BusinessDetails {
  return {
    name: optional("BUSINESS_NAME"),
    taxId: optional("BUSINESS_TAX_ID"),
    registrationNo: optional("BUSINESS_REGISTRATION_NO"),
    address: optional("BUSINESS_ADDRESS"),
    email: optional("BUSINESS_EMAIL"),
    phone: optional("BUSINESS_PHONE"),
  };
}

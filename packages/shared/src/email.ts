/** Adresele de email se compară fără majuscule și fără spații la capete (002, Assumptions). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

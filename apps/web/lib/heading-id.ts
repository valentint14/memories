/**
 * „5. Retragere și rambursări” → „retragere-si-rambursari”: ancora unui titlu, pentru linkuri din subsol.
 * Numărul din față (`5.`, `5.1`, `5.1.`) nu face parte din ancoră, deci renumerotarea nu o schimbă.
 */
export function headingId(text: string): string {
  return text
    .replace(/^\d+(\.\d+)*\.?\s+/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

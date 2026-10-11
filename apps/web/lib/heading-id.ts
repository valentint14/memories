/** „5. Retragere și rambursări” → „retragere-si-rambursari”: ancora unui titlu, pentru linkuri din subsol. */
export function headingId(text: string): string {
  return text
    .replace(/^\d+\.\s*/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

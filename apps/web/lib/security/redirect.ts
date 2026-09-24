/** Acceptă doar căi interne (fără schemă, host sau `//`), ca să nu existe redirecționări deschise. */
export function safeNextPath(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  let candidate = value;
  // Șablonul de email poate trimite URL-ul complet; păstrăm doar calea dacă e aceeași origine.
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      const appUrl = process.env.APP_URL;
      if (appUrl === undefined || url.origin !== new URL(appUrl).origin) return undefined;
      const inner = url.searchParams.get("next");
      candidate = url.pathname === "/auth/confirm" && inner ? inner : `${url.pathname}${url.search}`;
    } catch {
      return undefined;
    }
  }
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) return undefined;
  if (candidate.startsWith("/auth/confirm")) return undefined;
  return candidate;
}

import Link from "next/link";

/**
 * Taie textul la înălțimea majusculelor și la linia de bază, ca centrarea pe verticală (în bara
 * de navigare) să se facă după litere, nu după spațiul gol al rândului.
 */
export const capTrim = "[text-box:trim-both_cap_alphabetic]";

/**
 * Numele produsului, cules în Newsreader; pe pagina invitatului nu e link. `trim` îl centrează
 * optic într-un rând flex (bara de sus), aliniat cu butoanele de lângă el.
 */
export function Wordmark({
  href = "/",
  className = "text-2xl",
  trim = false,
}: {
  href?: string | null;
  className?: string;
  trim?: boolean;
}) {
  const text = (
    <span className={`font-serif tracking-tight ${trim ? `block leading-none ${capTrim}` : ""} ${className}`}>Memories</span>
  );
  if (href === null) return text;
  return (
    <Link href={href} className={`no-underline ${trim ? "block" : ""}`}>
      {text}
    </Link>
  );
}

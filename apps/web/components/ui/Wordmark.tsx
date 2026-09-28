import Link from "next/link";

/** Numele produsului, cules în Newsreader; pe pagina invitatului nu e link. */
export function Wordmark({ href = "/", className = "text-2xl" }: { href?: string | null; className?: string }) {
  const text = <span className={`font-serif tracking-tight ${className}`}>Memories</span>;
  if (href === null) return text;
  return (
    <Link href={href} className="no-underline">
      {text}
    </Link>
  );
}

import { t, type MessageKey } from "@/lib/i18n";

const TONE: Record<string, string> = {
  awaiting_activation: "border-accent text-accent",
  active: "border-success text-success",
  suspended: "border-danger text-danger",
};

/** Starea unui eveniment ca ștampilă: majuscule semibold (ca etichetele), contur în culoarea stării, fără fundal. */
export function StatusStamp({
  status,
  prefix = "status",
  size = "default",
}: {
  status: string;
  prefix?: "status" | "admin.status";
  /** `bar`: la înălțimea butoanelor compacte (40 px), când stă lângă ele pe aceeași linie. */
  size?: "default" | "bar";
}) {
  // `bar` pe telefon ocupă lățimea părintelui (textul centrat), ca butoanele de lângă ea.
  const box = size === "bar" ? "min-h-10 w-full justify-center px-3 sm:w-fit" : "w-fit px-2.5 py-1";
  return (
    <span
      className={`inline-flex items-center border ${box} font-sans text-xs font-semibold uppercase tracking-[0.06em] ${TONE[status] ?? "border-ink-muted text-ink-muted"}`}
    >
      {t(`${prefix}.${status}` as MessageKey)}
    </span>
  );
}

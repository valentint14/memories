import { t, type MessageKey } from "@/lib/i18n";

const TONE: Record<string, string> = {
  awaiting_activation: "border-accent text-accent",
  active: "border-success text-success",
  suspended: "border-danger text-danger",
};

/** Starea unui eveniment ca ștampilă: text mono majuscul, contur în culoarea stării, fără fundal. */
export function StatusStamp({ status, prefix = "status" }: { status: string; prefix?: "status" | "admin.status" }) {
  return (
    <span
      className={`inline-flex w-fit items-center border px-2.5 py-1 font-mono text-xs font-medium uppercase tracking-[0.08em] ${TONE[status] ?? "border-ink-muted text-ink-muted"}`}
    >
      {t(`${prefix}.${status}` as MessageKey)}
    </span>
  );
}

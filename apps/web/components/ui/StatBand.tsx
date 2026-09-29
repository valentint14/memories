import { ui } from "@/lib/ui";

export interface Stat {
  label: string;
  value: string;
  accent?: boolean;
}

/**
 * Banda de cifre de sub antet: celule egale, 2×2 pe telefon și pe un rând pe ecrane late. Valorile
 * stau jos în celule, deci rămân pe aceeași linie chiar dacă o etichetă se rupe.
 */
export function StatBand({ label, stats }: { label: string; stats: Stat[] }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-px overflow-hidden rounded-xs border border-rule bg-rule sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-1 bg-paper-raised px-4 py-3">
          <dt className={`${ui.kicker} text-ink-muted`}>{s.label}</dt>
          <dd className={`${ui.data} mt-auto text-lg ${s.accent === true ? "text-accent" : ""}`}>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

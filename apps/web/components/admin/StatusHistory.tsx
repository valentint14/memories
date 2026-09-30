import type { StatusChangeRow } from "@/lib/admin/queries";
import { formatDateTime, t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/**
 * Istoricul stărilor unui eveniment, cu sursa și motivul (002: FR-024, FR-029). O listă de rânduri
 * scurte, nu un tabel: încape într-o jumătate de pagină și pe telefon, fără derulare orizontală.
 */
export function StatusHistory({ rows }: { rows: StatusChangeRow[] }) {
  if (rows.length === 0) return <p className="text-ink-muted">{t("admin.statusHistory.empty")}</p>;
  return (
    <ol aria-label={t("admin.statusHistory.title")} className="flex flex-col">
      {rows.map((row, i) => (
        <li key={`${row.at}-${String(i)}`} className="flex flex-col gap-0.5 border-b border-rule py-3 first:pt-0 last:border-b-0 last:pb-0">
          <span className={`${ui.data} text-xs text-ink-muted`}>{formatDateTime(row.at)}</span>
          <span>
            {row.fromStatus === null ? "" : `${t(`admin.status.${row.fromStatus}` as MessageKey)} → `}
            {t(`admin.status.${row.toStatus}` as MessageKey)}
            {row.note !== null && <span className="ml-2 text-sm text-ink-muted">({row.note})</span>}
          </span>
          <span className="text-sm text-ink-muted">
            {t(`admin.source.${row.source}` as MessageKey)}
            {row.reason !== null && <> · {row.reason}</>}
            {row.externalRef !== null && <span className={`${ui.data} break-all`}> · {row.externalRef}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

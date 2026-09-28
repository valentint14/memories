import type { StatusChangeRow } from "@/lib/admin/queries";
import { formatDateTime, t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Istoricul stărilor unui eveniment, cu sursa și motivul (002: FR-024, FR-029). */
export function StatusHistory({ rows }: { rows: StatusChangeRow[] }) {
  if (rows.length === 0) return <p className="text-ink-muted">{t("admin.statusHistory.empty")}</p>;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("admin.statusHistory.title")}>
      <table className={`${ui.table} min-w-[720px]`}>
        <caption className="sr-only">{t("admin.statusHistory.title")}</caption>
        <thead>
          <tr className={ui.theadRow}>
            <th scope="col" className={ui.th}>{t("admin.statusHistory.when")}</th>
            <th scope="col" className={ui.th}>{t("admin.statusHistory.change")}</th>
            <th scope="col" className={ui.th}>{t("admin.statusHistory.source")}</th>
            <th scope="col" className={ui.th}>{t("admin.statusHistory.reason")}</th>
            <th scope="col" className={ui.th}>{t("admin.statusHistory.reference")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.at}-${String(i)}`} className={ui.row}>
              <td className={`${ui.td} ${ui.data} text-sm`}>{formatDateTime(row.at)}</td>
              <td className={ui.td}>
                {row.fromStatus === null ? "" : `${t(`admin.status.${row.fromStatus}` as MessageKey)} → `}
                {t(`admin.status.${row.toStatus}` as MessageKey)}
                {row.note !== null && <span className="ml-2 text-sm text-ink-muted">({row.note})</span>}
              </td>
              <td className={ui.td}>{t(`admin.source.${row.source}` as MessageKey)}</td>
              <td className={ui.td}>{row.reason ?? ""}</td>
              <td className={`${ui.td} ${ui.data} break-all text-sm`}>{row.externalRef ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

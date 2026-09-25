import type { StatusChangeRow } from "@/lib/admin/queries";
import { formatDateTime, t, type MessageKey } from "@/lib/i18n";

/** Istoricul stărilor unui eveniment, cu sursa și motivul (002: FR-024, FR-029). */
export function StatusHistory({ rows }: { rows: StatusChangeRow[] }) {
  if (rows.length === 0) return <p className="text-muted">{t("admin.statusHistory.empty")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">{t("admin.statusHistory.title")}</caption>
        <thead>
          <tr className="border-b border-gray-300">
            <th scope="col" className="p-2">{t("admin.statusHistory.when")}</th>
            <th scope="col" className="p-2">{t("admin.statusHistory.change")}</th>
            <th scope="col" className="p-2">{t("admin.statusHistory.source")}</th>
            <th scope="col" className="p-2">{t("admin.statusHistory.reason")}</th>
            <th scope="col" className="p-2">{t("admin.statusHistory.reference")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.at}-${String(i)}`} className="border-b border-gray-200">
              <td className="p-2">{formatDateTime(row.at)}</td>
              <td className="p-2">
                {row.fromStatus === null ? "" : `${t(`admin.status.${row.fromStatus}` as MessageKey)} → `}
                {t(`admin.status.${row.toStatus}` as MessageKey)}
                {row.note !== null && <span className="ml-2 text-sm text-muted">({row.note})</span>}
              </td>
              <td className="p-2">{t(`admin.source.${row.source}` as MessageKey)}</td>
              <td className="p-2">{row.reason ?? ""}</td>
              <td className="p-2 break-all">{row.externalRef ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { listEvents, type EventFilters } from "@/lib/admin/queries";
import { formatBytes, formatDate, formatDateTime, formatMoney, t, tp, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Evenimente" };

const STATUSES = ["awaiting_activation", "active", "suspended", "expiring", "expired"] as const;

function parseFilters(params: { origin?: string; status?: string; requested?: string }): EventFilters {
  return {
    origin: params.origin === "admin" || params.origin === "self_service" ? params.origin : undefined,
    status: STATUSES.find((s) => s === params.status),
    requested: params.requested === "1",
  };
}

/** Lista evenimentelor, cu filtre după origine, stare și cerere de activare (001/FR-003, 002/FR-027). */
export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string; status?: string; requested?: string }>;
}) {
  const filters = parseFilters(await searchParams);
  const events = await listEvents(filters);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={ui.pageTitle}>{t("admin.events")}</h1>
        <Link href="/admin/events/new" className={ui.buttonPrimary}>
          {t("admin.newEvent")}
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4 border-y border-rule py-4" aria-label={t("admin.filters.label")}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-origin" className={`${ui.kicker} text-ink-muted`}>
            {t("admin.filters.origin")}
          </label>
          <select id="f-origin" name="origin" defaultValue={filters.origin ?? ""} className={ui.input}>
            <option value="">{t("admin.filters.all")}</option>
            <option value="self_service">{t("admin.origin.self_service")}</option>
            <option value="admin">{t("admin.origin.admin")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-status" className={`${ui.kicker} text-ink-muted`}>
            {t("admin.filters.status")}
          </label>
          <select id="f-status" name="status" defaultValue={filters.status ?? ""} className={ui.input}>
            <option value="">{t("admin.filters.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-12 items-center gap-2">
          <input id="f-requested" name="requested" type="checkbox" value="1" defaultChecked={filters.requested} className={ui.checkbox} />
          <label htmlFor="f-requested">{t("admin.filters.requested")}</label>
        </div>
        <button type="submit" className={ui.buttonSecondary}>
          {t("admin.filters.apply")}
        </button>
      </form>

      {events.length === 0 ? (
        <p className="text-ink-muted">{t("admin.noEvents")}</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("admin.events")}>
          <table className={`${ui.table} min-w-[1120px]`}>
            <caption className="sr-only">{t("admin.events")}</caption>
            <thead>
              <tr className={ui.theadRow}>
                <th scope="col" className={ui.th}>{t("admin.col.event")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.date")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.organizer")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.status")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.created")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.activationRequest")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.files")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.price")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.retention")}</th>
                <th scope="col" className={ui.th}>{t("admin.col.purgeAt")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const activated = e.status === "active" || e.status === "suspended" || e.status === "expiring";
                return (
                  <tr key={e.id} className={ui.row}>
                    <th scope="row" className={`${ui.td} font-medium`}>
                      {e.anonymizedAt ? (
                        <span>{t("admin.anonymizedEvent")}</span>
                      ) : (
                        <Link href={`/admin/events/${e.id}`} className={ui.link}>
                          {e.name}
                        </Link>
                      )}
                      <span className="block text-sm font-normal text-ink-muted">{t(`admin.origin.${e.origin}`)}</span>
                    </th>
                    <td className={`${ui.td} ${ui.data} text-sm`}>{formatDate(e.eventDate)}</td>
                    <td className={`${ui.td} break-all`}>{e.organizerEmail ?? t("admin.noDate")}</td>
                    <td className={ui.td}>
                      <StatusStamp status={e.status} prefix="admin.status" />
                    </td>
                    <td className={`${ui.td} ${ui.data} text-sm`}>{formatDate(e.createdAt)}</td>
                    <td className={`${ui.td} ${ui.data} text-sm`}>
                      {e.lastActivationRequestAt === null ? t("admin.noDate") : formatDateTime(e.lastActivationRequestAt)}
                    </td>
                    <td className={`${ui.td} ${ui.data} text-sm`}>
                      {activated ? `${tp("plural.files", e.fileCount)} · ${formatBytes(e.totalBytes)}` : t("admin.noDate")}
                    </td>
                    <td className={`${ui.td} ${ui.data} text-sm`}>{activated ? formatMoney(e.finalPriceMinor) : t("admin.noDate")}</td>
                    <td className={`${ui.td} ${ui.data} text-sm`}>{activated ? tp("plural.months", e.retentionMonths) : t("admin.noDate")}</td>
                    <td className={`${ui.td} ${ui.data} text-sm`}>
                      {e.purgeAt !== null
                        ? formatDate(e.purgeAt)
                        : e.pendingPurgeAt !== null
                          ? t("admin.pendingPurge", { date: formatDate(e.pendingPurgeAt) })
                          : t("admin.noDate")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

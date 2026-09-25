import type { Metadata } from "next";
import Link from "next/link";
import { listEvents, type EventFilters } from "@/lib/admin/queries";
import { formatBytes, formatDate, formatDateTime, formatMoney, t, tp, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Evenimente" };

const STATUSES = ["awaiting_activation", "active", "suspended", "expiring", "expired"] as const;

function parseFilters(params: { origin?: string; status?: string; requested?: string }): EventFilters {
  return {
    origin: params.origin === "admin" || params.origin === "self_service" ? params.origin : undefined,
    status: STATUSES.find((s) => s === params.status),
    requested: params.requested === "1",
  };
}

const selectClass = "min-h-11 rounded-lg border border-gray-400 px-3";

/** Lista evenimentelor, cu filtre după origine, stare și cerere de activare (001/FR-003, 002/FR-027). */
export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string; status?: string; requested?: string }>;
}) {
  const filters = parseFilters(await searchParams);
  const events = await listEvents(filters);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("admin.events")}</h1>
        <Link href="/admin/events/new" className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 font-semibold text-white">
          {t("admin.newEvent")}
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4" aria-label={t("admin.filters.label")}>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-origin" className="text-sm font-medium">
            {t("admin.filters.origin")}
          </label>
          <select id="f-origin" name="origin" defaultValue={filters.origin ?? ""} className={selectClass}>
            <option value="">{t("admin.filters.all")}</option>
            <option value="self_service">{t("admin.origin.self_service")}</option>
            <option value="admin">{t("admin.origin.admin")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-status" className="text-sm font-medium">
            {t("admin.filters.status")}
          </label>
          <select id="f-status" name="status" defaultValue={filters.status ?? ""} className={selectClass}>
            <option value="">{t("admin.filters.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <input id="f-requested" name="requested" type="checkbox" value="1" defaultChecked={filters.requested} className="size-5" />
          <label htmlFor="f-requested">{t("admin.filters.requested")}</label>
        </div>
        <button type="submit" className="min-h-11 rounded-lg border border-brand-600 px-4 font-semibold text-brand-700">
          {t("admin.filters.apply")}
        </button>
      </form>

      {events.length === 0 ? (
        <p className="text-muted">{t("admin.noEvents")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <caption className="sr-only">{t("admin.events")}</caption>
            <thead>
              <tr className="border-b border-gray-300">
                <th scope="col" className="p-2">{t("admin.col.event")}</th>
                <th scope="col" className="p-2">{t("admin.col.date")}</th>
                <th scope="col" className="p-2">{t("admin.col.organizer")}</th>
                <th scope="col" className="p-2">{t("admin.col.status")}</th>
                <th scope="col" className="p-2">{t("admin.col.created")}</th>
                <th scope="col" className="p-2">{t("admin.col.activationRequest")}</th>
                <th scope="col" className="p-2">{t("admin.col.files")}</th>
                <th scope="col" className="p-2">{t("admin.col.price")}</th>
                <th scope="col" className="p-2">{t("admin.col.purgeAt")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const activated = e.status === "active" || e.status === "suspended" || e.status === "expiring";
                return (
                  <tr key={e.id} className="border-b border-gray-200">
                    <th scope="row" className="p-2 font-medium">
                      {e.anonymizedAt ? (
                        <span>{t("admin.anonymizedEvent")}</span>
                      ) : (
                        <Link href={`/admin/events/${e.id}`} className="text-brand-700 underline underline-offset-4">
                          {e.name}
                        </Link>
                      )}
                      <span className="ml-2 text-sm text-muted">{t(`admin.origin.${e.origin}`)}</span>
                    </th>
                    <td className="p-2">{formatDate(e.eventDate)}</td>
                    <td className="p-2 break-all">{e.organizerEmail ?? t("admin.noDate")}</td>
                    <td className="p-2">{t(`admin.status.${e.status}` as MessageKey)}</td>
                    <td className="p-2">{formatDate(e.createdAt)}</td>
                    <td className="p-2">{e.lastActivationRequestAt === null ? t("admin.noDate") : formatDateTime(e.lastActivationRequestAt)}</td>
                    <td className="p-2">
                      {activated ? `${tp("plural.files", e.fileCount)} · ${formatBytes(e.totalBytes)}` : t("admin.noDate")}
                    </td>
                    <td className="p-2">{activated ? formatMoney(e.finalPriceMinor) : t("admin.noDate")}</td>
                    <td className="p-2">
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

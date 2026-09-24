import type { Metadata } from "next";
import Link from "next/link";
import { listEvents } from "@/lib/admin/queries";
import { formatBytes, formatDate, formatMoney, t, tp } from "@/lib/i18n";

export const metadata: Metadata = { title: "Evenimente" };

export default async function AdminEventsPage() {
  const events = await listEvents();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("admin.events")}</h1>
        <Link
          href="/admin/events/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 font-semibold text-white"
        >
          {t("admin.newEvent")}
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="text-muted">{t("admin.noEvents")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <caption className="sr-only">{t("admin.events")}</caption>
            <thead>
              <tr className="border-b border-gray-300">
                <th scope="col" className="p-2">{t("admin.col.event")}</th>
                <th scope="col" className="p-2">{t("admin.col.date")}</th>
                <th scope="col" className="p-2">{t("admin.col.files")}</th>
                <th scope="col" className="p-2">{t("admin.col.price")}</th>
                <th scope="col" className="p-2">{t("admin.col.retention")}</th>
                <th scope="col" className="p-2">{t("admin.col.purgeAt")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-gray-200">
                  <th scope="row" className="p-2 font-medium">
                    {e.anonymizedAt ? (
                      <span>{t("admin.anonymizedEvent")}</span>
                    ) : (
                      <Link href={`/admin/events/${e.id}`} className="text-brand-700 underline underline-offset-4">
                        {e.name}
                      </Link>
                    )}
                    {e.status !== "active" && (
                      <span className="ml-2 rounded bg-gray-200 px-2 py-0.5 text-sm">{t(`admin.status.${e.status}`)}</span>
                    )}
                  </th>
                  <td className="p-2">{formatDate(e.eventDate)}</td>
                  <td className="p-2">
                    {tp("plural.files", e.fileCount)} · {formatBytes(e.totalBytes)}
                  </td>
                  <td className="p-2">{formatMoney(e.finalPriceMinor)}</td>
                  <td className="p-2">{tp("plural.months", e.retentionMonths)}</td>
                  <td className="p-2">{e.purgeAt === null ? t("admin.noDate") : formatDate(e.purgeAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

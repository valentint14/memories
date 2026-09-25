import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, t, type MessageKey } from "@/lib/i18n";
import { throwIfDbError } from "@/lib/actions/result";
import { serverSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Evenimentele mele" };

const BADGE: Record<string, string> = {
  awaiting_activation: "bg-amber-100 text-amber-900",
  active: "bg-green-100 text-green-900",
  suspended: "bg-red-100 text-red-900",
};

/**
 * Lista evenimentelor organizatorului (001/FR-009, 002/FR-012): RLS întoarce toate evenimentele
 * adresei, create de el sau de administrator, fără cele neconfirmate.
 */
export default async function OrganizerEventsPage({ searchParams }: { searchParams: Promise<{ limit?: string }> }) {
  const params = await searchParams;
  const supabase = await serverSupabase();
  const { data, error } = await supabase
    .from("organizer_events")
    .select("id, name, event_date, status, purge_at, pending_purge_at")
    .order("event_date", { ascending: false });
  throwIfDbError(error);
  const events = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("organizer.myEvents")}</h1>
        <Link href="/events/new" className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 font-semibold text-white">
          {t("organizer.newEvent")}
        </Link>
      </div>
      {params.limit === "1" && (
        <p role="alert" className="rounded-lg border border-amber-500 bg-amber-50 p-4">
          {t("organizer.limitReached")}
        </p>
      )}
      {events.length === 0 ? (
        <p className="text-muted">{t("organizer.noEvents")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {events.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-lg border border-gray-200 p-4">
              <Link href={`/events/${e.id ?? ""}`} className="text-lg font-semibold text-brand-700 underline underline-offset-4">
                {e.name}
              </Link>
              {e.event_date && <span className="text-muted">{formatDate(e.event_date)}</span>}
              {e.status && (
                <span className={`self-start rounded px-2 py-0.5 text-sm ${BADGE[e.status] ?? "bg-gray-200"}`}>
                  {t(`status.${e.status}` as MessageKey)}
                </span>
              )}
              {e.status === "active" && e.purge_at && (
                <span className="text-sm">{t("organizer.purgeOn", { date: formatDate(e.purge_at) })}</span>
              )}
              {e.status === "awaiting_activation" && e.pending_purge_at && (
                <span className="text-sm">{t("organizer.pendingPurgeOn", { date: formatDate(e.pending_purge_at) })}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

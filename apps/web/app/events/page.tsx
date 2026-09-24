import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, t } from "@/lib/i18n";
import { throwIfDbError } from "@/lib/actions/result";
import { serverSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Evenimentele mele" };

/** Lista evenimentelor organizatorului (FR-009): RLS întoarce doar evenimentele sale. */
export default async function OrganizerEventsPage() {
  const supabase = await serverSupabase();
  const { data, error } = await supabase
    .from("organizer_events")
    .select("id, name, event_date, status, purge_at")
    .order("event_date", { ascending: false });
  throwIfDbError(error);
  const events = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("organizer.myEvents")}</h1>
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
              {e.status === "active" && e.purge_at ? (
                <span className="text-sm">{t("organizer.purgeOn", { date: formatDate(e.purge_at) })}</span>
              ) : (
                <span className="self-start rounded bg-gray-200 px-2 py-0.5 text-sm">{t("organizer.expired")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

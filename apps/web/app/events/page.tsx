import type { Metadata } from "next";
import Link from "next/link";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { formatDate, t } from "@/lib/i18n";
import { throwIfDbError } from "@/lib/actions/result";
import { serverSupabase } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Evenimentele mele" };

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
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={ui.pageTitle}>{t("organizer.myEvents")}</h1>
        <Link href="/events/new" className={ui.buttonPrimary}>
          {t("organizer.newEvent")}
        </Link>
      </div>
      {params.limit === "1" && (
        <p role="alert" className={ui.caution}>
          {t("organizer.limitReached")}
        </p>
      )}
      {events.length === 0 ? (
        <p className="text-ink-muted">{t("organizer.noEvents")}</p>
      ) : (
        <ul className="flex flex-col border-t border-ink">
          {events.map((e) => (
            <li key={e.id} className="grid gap-x-8 gap-y-2 border-b border-rule py-5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-baseline">
              {e.event_date && <span className={`${ui.data} text-sm text-ink-muted`}>{formatDate(e.event_date)}</span>}
              <div className="flex flex-col gap-1">
                <Link href={`/events/${e.id ?? ""}`} className="font-serif text-2xl leading-tight underline decoration-rule underline-offset-4 hover:decoration-ink">
                  {e.name}
                </Link>
                {e.status === "active" && e.purge_at && (
                  <span className="text-sm text-ink-muted">{t("organizer.purgeOn", { date: formatDate(e.purge_at) })}</span>
                )}
                {e.status === "awaiting_activation" && e.pending_purge_at && (
                  <span className="text-sm text-ink-muted">{t("organizer.pendingPurgeOn", { date: formatDate(e.pending_purge_at) })}</span>
                )}
              </div>
              {e.status && <StatusStamp status={e.status} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

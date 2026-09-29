import type { Metadata } from "next";
import Link from "next/link";
import { StatBand } from "@/components/ui/StatBand";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { formatDate, formatDateShort, t } from "@/lib/i18n";
import { throwIfDbError } from "@/lib/actions/result";
import { serverSupabase } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Evenimentele mele" };

interface EventRow {
  id: string | null;
  name: string | null;
  event_date: string | null;
  status: string | null;
  purge_at: string | null;
  pending_purge_at: string | null;
}

/** Informația cheie a unui eveniment, după stare. */
function keyFact(e: EventRow): string | null {
  if (e.status === "active" && e.purge_at) return t("organizer.purgeOn", { date: formatDate(e.purge_at) });
  if (e.status === "awaiting_activation" && e.pending_purge_at) return t("organizer.pendingPurgeOn", { date: formatDate(e.pending_purge_at) });
  if (e.status === "suspended") return t("organizer.list.suspended");
  if (e.status === "expired") return t("organizer.list.expired");
  return null;
}

/** Un eveniment ca foaie: data și starea în bandă, numele și informația cheie, linkul jos. */
function EventSheet({ event }: { event: EventRow }) {
  const href = `/events/${event.id ?? ""}`;
  const fact = keyFact(event);
  return (
    <li className={ui.sheet}>
      <div className={ui.sheetBar}>
        <span className={ui.data}>{event.event_date ? formatDateShort(event.event_date) : ""}</span>
        {event.status && <StatusStamp status={event.status} />}
      </div>
      <div className={ui.sheetBody}>
        <h2 className="font-serif text-2xl leading-tight">
          <Link href={href} className="underline decoration-rule underline-offset-4 hover:decoration-ink">
            {event.name}
          </Link>
        </h2>
        {fact !== null && <p className="text-sm leading-relaxed text-ink-muted">{fact}</p>}
        <div className="mt-auto flex justify-end border-t border-rule pt-3">
          <Link href={href} className={`${ui.buttonText} gap-1 text-sm`} aria-hidden="true" tabIndex={-1}>
            {t("organizer.list.open")}
            <ChevronRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </li>
  );
}

/**
 * Lista evenimentelor organizatorului (001/FR-009, 002/FR-012), în formatul fișelor: bandă de
 * cifre și câte o foaie pe eveniment, pe o grilă de două coloane. RLS întoarce toate evenimentele
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
  const events: EventRow[] = data ?? [];
  const count = (status: string) => events.filter((e) => e.status === status).length;

  return (
    <div className="flex flex-col gap-6">
      {/*
        Pe telefon și tabletă, „Eveniment nou” stă pe rândul titlului, în dreapta (doar „+” pe
        telefon, cu text de la `sm`); pe desktop e foaia din grilă.
      */}
      <header className="flex items-center justify-between gap-4">
        <h1 className={ui.pageTitle}>{t("organizer.myEvents")}</h1>
        <div className="shrink-0 lg:hidden">
          <Link href="/events/new" aria-label={t("organizer.newEvent")} className={ui.buttonPrimaryCompact}>
            <PlusIcon className="size-4" />
            <span className="hidden sm:inline">{t("organizer.newEvent")}</span>
          </Link>
        </div>
      </header>
      {params.limit === "1" && (
        <p role="alert" className={ui.caution}>
          {t("organizer.limitReached")}
        </p>
      )}
      <StatBand
        label={t("organizer.list.summary")}
        stats={[
          { label: t("organizer.list.stat.total"), value: String(events.length) },
          { label: t("organizer.list.stat.active"), value: String(count("active")) },
          { label: t("organizer.list.stat.awaiting"), value: String(count("awaiting_activation")) },
          { label: t("organizer.list.stat.ended"), value: String(count("expired")) },
        ]}
      />
      {events.length === 0 && <p className={ui.notice}>{t("organizer.noEvents")}</p>}
      <ul className="grid gap-6 lg:grid-cols-2">
        {events.map((e) => (
          <EventSheet key={e.id} event={e} />
        ))}
        {/*
          Foaia „Eveniment nou”, doar pe desktop: cu un număr impar de evenimente umple ultima
          jumătate de rând; altfel (și fără evenimente) ocupă tot rândul.
        */}
        {/* Clasele foii fără `flex` de bază: ascunsă pe telefon, foaie de la `lg` (fără conflict hidden/flex). */}
        <li
          className={`hidden flex-col rounded-xs border border-rule bg-paper-raised lg:flex ${events.length % 2 === 0 ? "lg:col-span-2" : ""}`}
        >
          <div className={ui.sheetBar}>{t("organizer.newEvent")}</div>
          <div className={ui.sheetBody}>
            <p className="font-serif text-2xl leading-tight">{t(events.length === 0 ? "organizer.list.firstTitle" : "organizer.list.newTitle")}</p>
            <p className="text-sm leading-relaxed text-ink-muted">{t("organizer.list.newText")}</p>
            <div className="mt-auto flex justify-end border-t border-rule pt-3">
              <Link href="/events/new" className={ui.buttonPrimaryCompact}>
                {t("organizer.newEvent")}
              </Link>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}

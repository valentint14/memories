import type { Metadata } from "next";
import Link from "next/link";
import { ActivateFromLedger } from "@/components/admin/EventStateActions";
import { LedgerViewSelect } from "@/components/admin/LedgerViewSelect";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { LEDGER_GROUPS, buildLedger, isActivated, parseView, type LedgerGroup, type LedgerView } from "@/lib/admin/ledger";
import { listEvents, type AdminEventRow } from "@/lib/admin/queries";
import { formatBytes, formatDate, formatDateTime, formatMoney, t, tp } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Evenimente" };

function viewHref(view: LedgerView, query: string): string {
  const params = new URLSearchParams();
  if (view !== "all") params.set("view", view);
  if (query !== "") params.set("q", query);
  const search = params.toString();
  return search === "" ? "/admin/events" : `/admin/events?${search}`;
}

/** A doua linie a rândului: doar datele care au sens pentru starea evenimentului. */
function Facts({ event }: { event: AdminEventRow }) {
  const facts: { text: string; accent?: boolean }[] = [{ text: formatDate(event.eventDate) }];
  if (isActivated(event)) {
    facts.push(
      { text: `${tp("plural.files", event.fileCount)} · ${formatBytes(event.totalBytes)}` },
      { text: formatMoney(event.finalPriceMinor) },
      { text: tp("plural.months", event.retentionMonths) },
    );
    if (event.purgeAt !== null) facts.push({ text: t("admin.ledger.purgeAt", { date: formatDate(event.purgeAt) }) });
  } else {
    facts.push({ text: t("admin.ledger.created", { date: formatDate(event.createdAt) }) });
    if (event.lastActivationRequestAt !== null) {
      facts.push({ text: t("admin.ledger.requested", { date: formatDateTime(event.lastActivationRequestAt) }), accent: true });
    }
    if (event.pendingPurgeAt !== null) {
      facts.push({ text: t("admin.ledger.purgeAt", { date: t("admin.pendingPurge", { date: formatDate(event.pendingPurgeAt) }) }) });
    }
  }
  return (
    <p className={`${ui.data} text-sm text-ink-muted`}>
      {facts.map((f, i) => (
        <span key={i} className={f.accent ? "text-accent" : undefined}>
          {i > 0 && " · "}
          {f.text}
        </span>
      ))}
    </p>
  );
}

function LedgerRow({ event }: { event: AdminEventRow }) {
  const canActivate = event.status === "awaiting_activation" && event.anonymizedAt === null;
  return (
    <li className="grid gap-y-2 border-b border-rule py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {event.anonymizedAt !== null || event.name === null ? (
          <span className="font-serif text-xl leading-tight">{t("admin.anonymizedEvent")}</span>
        ) : (
          <Link href={`/admin/events/${event.id}`} className="font-serif text-xl leading-tight text-ink underline underline-offset-4 hover:text-ink-muted">
            {event.name}
          </Link>
        )}
        <span className="text-sm break-all text-ink-muted">
          {t(`admin.origin.${event.origin}`)}
          {event.organizerEmail !== null && <> · {event.organizerEmail}</>}
        </span>
      </div>
      <div className="sm:justify-self-end">
        <StatusStamp status={event.status} prefix="admin.status" />
      </div>
      <Facts event={event} />
      <div className="sm:-my-2.5 sm:justify-self-end">{canActivate && <ActivateFromLedger eventId={event.id} subject={{ name: event.name ?? "", organizerEmail: event.organizerEmail }} />}</div>
    </li>
  );
}

function groupLabel(group: LedgerGroup): string {
  return t(`admin.ledger.group.${group}`);
}

/**
 * Registrul evenimentelor (001/FR-003, 002/FR-027): file cu numărătoare, grupe în ordinea în care
 * cer atenție și rânduri pe două linii, fără tabel derulat pe orizontală.
 */
export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const params = await searchParams;
  const view = parseView(params.view);
  const query = (params.q ?? "").trim().slice(0, 200);
  const events = await listEvents();
  const ledger = buildLedger(events, { view, query });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={ui.pageTitle}>{t("admin.events")}</h1>
        <Link href="/admin/events/new" className={ui.buttonPrimary}>
          {t("admin.newEvent")}
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-ink-muted">{t("admin.noEvents")}</p>
      ) : (
        <>
          {/* Bara de instrumente: filtrul în stânga, căutarea în dreapta; se rupe pe două rânduri doar când nu încap. */}
          <form method="get" role="search" className="flex flex-wrap items-center justify-between gap-3 border-y border-rule py-3">
            <LedgerViewSelect
              view={view}
              query={query}
              options={[
                { id: "all", label: t("admin.ledger.option", { label: t("admin.ledger.all"), count: ledger.total }) },
                ...LEDGER_GROUPS.map((g) => ({ id: g, label: t("admin.ledger.option", { label: groupLabel(g), count: ledger.counts[g] }) })),
              ]}
            />
            <div className="flex min-w-60 flex-1 items-center justify-end gap-2">
              <label htmlFor="ledger-q" className="sr-only">
                {t("admin.ledger.search")}
              </label>
              <input
                id="ledger-q"
                name="q"
                type="search"
                defaultValue={query}
                maxLength={200}
                placeholder={t("admin.ledger.searchPlaceholder")}
                className={`${ui.inputCompact} min-w-0 flex-1 sm:max-w-64`}
              />
              <button type="submit" className={ui.buttonSecondaryCompact}>
                {t("admin.ledger.searchSubmit")}
              </button>
            </div>
          </form>

          {query !== "" && (
            <p className="text-sm text-ink-muted">
              <Link href={viewHref(view, "")} className={ui.link}>
                {t("admin.ledger.clearSearch")}
              </Link>
            </p>
          )}

          {ledger.total === 0 && query !== "" ? (
            <p className="text-ink-muted">{t("admin.ledger.noResults", { query })}</p>
          ) : (
            <div className="flex flex-col gap-10">
              {ledger.groups.map((group) => (
                <section key={group.id} aria-labelledby={`group-${group.id}`} className="flex flex-col">
                  <h2
                    id={`group-${group.id}`}
                    className={`${ui.kicker} border-b border-ink pb-2 ${group.id === "requested" ? "text-accent" : "text-ink-muted"}`}
                  >
                    {groupLabel(group.id)} · <span className={ui.data}>{group.rows.length}</span>
                  </h2>
                  {group.rows.length === 0 ? (
                    <p className="py-4 text-ink-muted">{t("admin.ledger.emptyGroup")}</p>
                  ) : (
                    <ul className="flex flex-col">
                      {group.rows.map((e) => (
                        <LedgerRow key={e.id} event={e} />
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

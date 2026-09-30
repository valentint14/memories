import type { Metadata } from "next";
import Link from "next/link";
import { ActivateFromLedger } from "@/components/admin/EventStateActions";
import { LedgerViewSelect } from "@/components/admin/LedgerViewSelect";
import { StatBand } from "@/components/ui/StatBand";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { ChevronRightIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { LEDGER_GROUPS, buildLedger, isActivated, parseView, type LedgerGroup, type LedgerView } from "@/lib/admin/ledger";
import { listEvents, type AdminEventRow } from "@/lib/admin/queries";
import { formatBytes, formatDate, formatDateShort, formatDateTime, formatDayMonthTime, formatMoney, t, tp } from "@/lib/i18n";
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

/** Informația cheie a rândului compact, după grupa evenimentului. */
function KeyFact({ event }: { event: AdminEventRow }) {
  const cls = `${ui.data} text-xs`;
  if (!isActivated(event)) {
    if (event.lastActivationRequestAt !== null) {
      return <span className={`${cls} text-accent`}>{t("admin.ledger.compact.requested", { date: formatDayMonthTime(event.lastActivationRequestAt) })}</span>;
    }
    return event.pendingPurgeAt === null ? null : (
      <span className={`${cls} text-ink-muted`}>{t("admin.ledger.compact.pendingPurge", { date: formatDateShort(event.pendingPurgeAt) })}</span>
    );
  }
  if (event.status === "expired") {
    return event.purgeAt === null ? null : (
      <span className={`${cls} text-ink-muted`}>{t("admin.ledger.compact.purged", { date: formatDateShort(event.purgeAt) })}</span>
    );
  }
  return <span className={`${cls} text-ink`}>{`${tp("plural.files", event.fileCount)} · ${formatBytes(event.totalBytes)}`}</span>;
}

/**
 * Rândul compact de pe telefon: numele, data scurtă și originea, o singură informație cheie.
 * Tot rândul duce la eveniment; în dreapta, „Activează” sau o săgeată.
 */
function CompactRow({ event, canActivate }: { event: AdminEventRow; canActivate: boolean }) {
  const anonymized = event.anonymizedAt !== null || event.name === null;
  const body = (
    <>
      <span className="truncate font-serif text-lg leading-tight text-ink">{anonymized ? t("admin.anonymizedEvent") : event.name}</span>
      <span className={`${ui.data} text-xs text-ink-muted`}>
        {formatDateShort(event.eventDate)} · {t(`admin.ledger.originShort.${event.origin}`)}
      </span>
      <KeyFact event={event} />
    </>
  );
  return (
    <div className="flex items-center gap-3 py-3 sm:hidden">
      {anonymized ? (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">{body}</div>
      ) : (
        <Link href={`/admin/events/${event.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 no-underline">
          {body}
        </Link>
      )}
      {canActivate ? (
        <ActivateFromLedger
          eventId={event.id}
          subject={{ name: event.name ?? "", organizerEmail: event.organizerEmail }}
          className={`${ui.buttonSecondaryCompact} shrink-0 px-3`}
        />
      ) : (
        !anonymized && <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
      )}
    </div>
  );
}

function LedgerRow({ event }: { event: AdminEventRow }) {
  const canActivate = event.status === "awaiting_activation" && event.anonymizedAt === null;
  return (
    <li className="border-b border-rule px-4 last:border-b-0">
      <CompactRow event={event} canActivate={canActivate} />
      {/* Ecrane late: rândul pe două linii, cu ștampila și toate datele. */}
      <div className="hidden py-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-1.5">
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
        <div className="justify-self-end">
          <StatusStamp status={event.status} prefix="admin.status" />
        </div>
        <Facts event={event} />
        <div className="-my-2.5 justify-self-end">
          {canActivate && <ActivateFromLedger eventId={event.id} subject={{ name: event.name ?? "", organizerEmail: event.organizerEmail }} />}
        </div>
      </div>
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
    <div className="flex flex-col gap-6">
      {/*
        „Eveniment nou” pe același rând cu titlul, în dreapta: pe telefon doar „+” (numele accesibil
        rămâne „Eveniment nou”), de la `sm` cu text.
      */}
      <header className="flex items-center justify-between gap-4">
        <h1 className={ui.pageTitle}>{t("admin.events")}</h1>
        <Link href="/admin/events/new" aria-label={t("admin.newEvent")} className={`${ui.buttonPrimaryCompact} shrink-0`}>
          <PlusIcon className="size-4" />
          <span className="hidden sm:inline">{t("admin.newEvent")}</span>
        </Link>
      </header>

      <StatBand
        label={t("admin.detail.summary")}
        stats={[
          { label: t("organizer.list.stat.total"), value: String(ledger.total) },
          { label: t("admin.ledger.group.requested"), value: String(ledger.counts.requested), accent: ledger.counts.requested > 0 },
          { label: t("admin.ledger.group.active"), value: String(ledger.counts.active) },
          { label: t("admin.ledger.group.ended"), value: String(ledger.counts.ended) },
        ]}
      />

      {events.length === 0 ? (
        <p className={ui.notice}>{t("admin.noEvents")}</p>
      ) : (
        <>
          {/* Pe telefon: două jumătăți egale, filtrul și căutarea. Pe ecrane late: filtrul în stânga, căutarea în dreapta. */}
          <form method="get" role="search" className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
            <LedgerViewSelect
              view={view}
              query={query}
              options={[
                { id: "all", label: t("admin.ledger.option", { label: t("admin.ledger.all"), count: ledger.total }) },
                ...LEDGER_GROUPS.map((g) => ({ id: g, label: t("admin.ledger.option", { label: groupLabel(g), count: ledger.counts[g] }) })),
              ]}
            />
            {/* Lupa din câmp trimite căutarea (la fel ca Enter); se numește „Caută” pentru cititoarele de ecran. */}
            <div className="relative min-w-0 sm:w-72">
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
                className={`${ui.inputCompact} w-full pr-11`}
              />
              <button
                type="submit"
                aria-label={t("admin.ledger.searchSubmit")}
                className="absolute inset-y-0 right-0 inline-flex w-10 cursor-pointer items-center justify-center text-ink hover:text-ink-muted"
              >
                <SearchIcon />
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
            <p className={ui.notice}>{t("admin.ledger.noResults", { query })}</p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Fiecare grupă e o foaie: banda cu numele grupei, rândurile evenimentelor dedesubt. */}
              {ledger.groups.map((group) => (
                <section key={group.id} aria-labelledby={`group-${group.id}`} className={ui.sheet}>
                  <h2 id={`group-${group.id}`} className={group.id === "requested" ? ui.sheetBarAccent : ui.sheetBar}>
                    <span>{groupLabel(group.id)}</span>
                    <span className={ui.data}>{group.rows.length}</span>
                  </h2>
                  {group.rows.length === 0 ? (
                    <p className="p-4 text-ink-muted">{t("admin.ledger.emptyGroup")}</p>
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

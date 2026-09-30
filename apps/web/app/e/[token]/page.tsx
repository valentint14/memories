import type { Metadata } from "next";
import { cookies } from "next/headers";
import { UploadClient } from "@/components/upload/UploadClient";
import { Sheet } from "@/components/ui/Sheet";
import { Wordmark } from "@/components/ui/Wordmark";
import { PlusIcon } from "@/components/ui/icons";
import { guestSessionName, resolveGuestEvent } from "@/lib/guest/event";
import { formatDate, formatDateTime, t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Încarcă poze", referrer: "no-referrer" };

/**
 * Pagina invitatului: fără cont, fără instalare, direct din codul QR (FR-011, FR-012, FR-020), în
 * formatul fișelor: bara cu numele produsului (fără linkuri), antetul evenimentului centrat, apoi
 * foile. Acțiunile rămân în bara fixată jos (FR-036).
 */
export default async function GuestUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await resolveGuestEvent(token);

  if (event.state === "not_found") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
        <h1 className={ui.sectionTitle}>{t("errors.EVENT_NOT_FOUND")}</h1>
      </main>
    );
  }

  const closedMessage =
    event.state === "not_started" && event.uploadStartsAt !== null
      ? t("guest.notStarted", { date: formatDateTime(event.uploadStartsAt) })
      : event.state === "not_activated"
        ? t("guest.notActivated")
        : event.state === "suspended"
          ? t("guest.suspended")
          : event.state === "ended"
            ? t("errors.UPLOAD_ENDED")
            : null;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Aceeași bară ca în restul aplicației, fără linkuri: invitatul nu are cont. */}
      <div className="border-b border-rule bg-paper">
        <div className="mx-auto flex h-16 max-w-md items-center px-4">
          <Wordmark href={null} trim />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-8">
        <header className="flex flex-col items-center gap-3 text-center">
          {event.eventDate !== null && <p className={`${ui.kicker} text-accent`}>{formatDate(event.eventDate)}</p>}
          <h1 className={ui.pageTitle}>{event.name}</h1>
          {event.state === "open" && <p className="leading-relaxed text-ink-muted">{t("guest.intro")}</p>}
        </header>

        {closedMessage !== null && (
          <Sheet id="guest-status-title" title={t("guest.sheet.status")}>
            <p role="status" className="leading-relaxed">
              {closedMessage}
            </p>
          </Sheet>
        )}

        {event.state === "open" && event.eventId !== null && (
          <UploadClient
            token={token}
            initialName={await guestSessionName(event.eventId, (await cookies()).get("mg_s")?.value)}
            limits={{ maxPhotoBytes: event.maxPhotoBytes, maxVideoBytes: event.maxVideoBytes }}
            privacy={<PrivacyNote purgeAt={event.purgeAt} />}
          />
        )}
        {event.state !== "open" && (
          <div className="pb-8">
            <PrivacyNote purgeAt={event.purgeAt} />
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Nota de informare privind prelucrarea datelor (constituția, principiul II), ca foaie care se
 * deschide: banda de titlu e butonul.
 */
function PrivacyNote({ purgeAt }: { purgeAt: string | null }) {
  return (
    <details className={`group ${ui.sheet}`}>
      <summary className={ui.sheetSummary}>
        {t("guest.privacyTitle")}
        <PlusIcon className="size-4 shrink-0 transition-transform group-open:rotate-45" />
      </summary>
      <div className="flex flex-col gap-2 p-4 text-sm leading-relaxed text-ink-muted">
        <p>{t("guest.privacyWho")}</p>
        <p>{t("guest.privacyLocation")}</p>
        {purgeAt !== null && <p>{t("guest.privacyRetention", { date: formatDate(purgeAt) })}</p>}
        <p>{t("guest.privacyProcessors")}</p>
      </div>
    </details>
  );
}

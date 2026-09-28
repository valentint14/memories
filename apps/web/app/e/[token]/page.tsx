import type { Metadata } from "next";
import { cookies } from "next/headers";
import { UploadClient } from "@/components/upload/UploadClient";
import { Wordmark } from "@/components/ui/Wordmark";
import { PlusIcon } from "@/components/ui/icons";
import { guestSessionName, resolveGuestEvent } from "@/lib/guest/event";
import { formatDate, formatDateTime, t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Încarcă poze", referrer: "no-referrer" };

/** Pagina invitatului: fără cont, fără instalare, direct din codul QR (FR-011, FR-012, FR-020). */
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-5">
      <Wordmark href={null} className="text-lg text-ink-muted" />

      <header className="flex flex-col gap-2.5">
        {event.eventDate !== null && <p className={`${ui.kicker} text-accent`}>{formatDate(event.eventDate)}</p>}
        <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-balance">{event.name}</h1>
        {event.state === "open" && <p className="leading-relaxed text-ink-muted">{t("guest.intro")}</p>}
      </header>

      {closedMessage !== null && (
        <p role="status" className={ui.notice}>
          {closedMessage}
        </p>
      )}

      {event.state === "open" && event.eventId !== null && (
        <UploadClient
          token={token}
          initialName={await guestSessionName(event.eventId, (await cookies()).get("mg_s")?.value)}
          limits={{ maxPhotoBytes: event.maxPhotoBytes, maxVideoBytes: event.maxVideoBytes }}
          privacy={<PrivacyNote purgeAt={event.purgeAt} />}
        />
      )}
      {event.state !== "open" && <PrivacyNote purgeAt={event.purgeAt} />}
    </main>
  );
}

/** Nota de informare privind prelucrarea datelor (constituția, principiul II). */
function PrivacyNote({ purgeAt }: { purgeAt: string | null }) {
  return (
    <details className="group border-y border-rule text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
        {t("guest.privacyTitle")}
        <PlusIcon className="size-4 shrink-0 transition-transform group-open:rotate-45" />
      </summary>
      <div className="flex flex-col gap-2 pb-4 leading-relaxed text-ink-muted">
        <p>{t("guest.privacyWho")}</p>
        <p>{t("guest.privacyLocation")}</p>
        {purgeAt !== null && <p>{t("guest.privacyRetention", { date: formatDate(purgeAt) })}</p>}
        <p>{t("guest.privacyProcessors")}</p>
      </div>
    </details>
  );
}

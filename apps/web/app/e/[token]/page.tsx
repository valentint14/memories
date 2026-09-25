import type { Metadata } from "next";
import { cookies } from "next/headers";
import { UploadClient } from "@/components/upload/UploadClient";
import { guestSessionName, resolveGuestEvent } from "@/lib/guest/event";
import { formatDate, formatDateTime, t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Încarcă poze", referrer: "no-referrer" };

/** Pagina invitatului: fără cont, fără instalare, direct din codul QR (FR-011, FR-012, FR-020). */
export default async function GuestUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await resolveGuestEvent(token);

  if (event.state === "not_found") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-2xl font-bold">{t("errors.EVENT_NOT_FOUND")}</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-4 pt-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-tight">{event.name}</h1>
        {event.state === "open" && <p className="text-muted">{t("guest.intro")}</p>}
      </header>

      {event.state === "not_started" && event.uploadStartsAt !== null && (
        <p role="status" className="rounded-lg bg-brand-50 p-4">
          {t("guest.notStarted", { date: formatDateTime(event.uploadStartsAt) })}
        </p>
      )}
      {event.state === "not_activated" && (
        <p role="status" className="rounded-lg bg-brand-50 p-4">
          {t("guest.notActivated")}
        </p>
      )}
      {event.state === "suspended" && (
        <p role="status" className="rounded-lg bg-brand-50 p-4">
          {t("guest.suspended")}
        </p>
      )}
      {event.state === "ended" && (
        <p role="status" className="rounded-lg bg-brand-50 p-4">
          {t("errors.UPLOAD_ENDED")}
        </p>
      )}

      {event.state === "open" && event.eventId !== null && (
        <UploadClient
          token={token}
          initialName={await guestSessionName(event.eventId, (await cookies()).get("mg_s")?.value)}
          limits={{ maxPhotoBytes: event.maxPhotoBytes, maxVideoBytes: event.maxVideoBytes }}
        />
      )}

      <details className="rounded-lg border border-gray-200 p-3 text-sm">
        <summary className="min-h-11 cursor-pointer content-center font-medium">{t("guest.privacyTitle")}</summary>
        <div className="mt-2 flex flex-col gap-2 text-muted">
          <p>{t("guest.privacyWho")}</p>
          <p>{t("guest.privacyLocation")}</p>
          {event.purgeAt !== null && <p>{t("guest.privacyRetention", { date: formatDate(event.purgeAt) })}</p>}
          <p>{t("guest.privacyProcessors")}</p>
        </div>
      </details>
    </main>
  );
}

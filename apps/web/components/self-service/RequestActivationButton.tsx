"use client";

import { useState, useTransition } from "react";
import { requestActivation } from "@/lib/actions/organizer";
import { formatDateTime, t } from "@/lib/i18n";

/** „Solicită activarea” (002: FR-018a): după trimitere arată data cererii; o nouă cerere după 24 h. */
export function RequestActivationButton({ eventId, lastRequestAt }: { eventId: string; lastRequestAt: string | null }) {
  const [requestedAt, setRequestedAt] = useState(lastRequestAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nextAllowed = requestedAt === null ? null : new Date(new Date(requestedAt).getTime() + 24 * 3_600_000);
  // O nouă cerere e posibilă după 24 de ore (serverul verifică oricum).
  const retryAt = nextAllowed !== null && nextAllowed.getTime() > Date.now() ? nextAllowed : null;

  return (
    <div className="flex flex-col gap-2">
      {requestedAt !== null && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-green-900">
          {t("activation.requested", { date: formatDateTime(requestedAt) })}
        </p>
      )}
      {retryAt !== null ? (
        <p className="text-sm text-muted">{t("activation.retryAt", { date: formatDateTime(retryAt) })}</p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await requestActivation(eventId);
              if (result.ok) setRequestedAt(result.data.requestedAt);
              else setError(t(`errors.${result.error}`));
            });
          }}
          className="min-h-11 self-start rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60"
        >
          {pending ? t("activation.requesting") : t("activation.request")}
        </button>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

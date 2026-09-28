"use client";

import { useState, useTransition } from "react";
import { requestActivation } from "@/lib/actions/organizer";
import { formatDateTime, t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { CheckIcon } from "../ui/icons";

/** „Solicită activarea” (002: FR-018a): după trimitere arată data cererii; o nouă cerere după 24 h. */
export function RequestActivationButton({ eventId, lastRequestAt }: { eventId: string; lastRequestAt: string | null }) {
  const [requestedAt, setRequestedAt] = useState(lastRequestAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nextAllowed = requestedAt === null ? null : new Date(new Date(requestedAt).getTime() + 24 * 3_600_000);
  // O nouă cerere e posibilă după 24 de ore (serverul verifică oricum).
  const retryAt = nextAllowed !== null && nextAllowed.getTime() > Date.now() ? nextAllowed : null;

  return (
    <div className="flex flex-col gap-3">
      {requestedAt !== null && (
        <p role="status" className="flex items-start gap-2 text-success">
          <CheckIcon className="mt-1 size-4 shrink-0" />
          {t("activation.requested", { date: formatDateTime(requestedAt) })}
        </p>
      )}
      {retryAt !== null ? (
        <p className={ui.hint}>{t("activation.retryAt", { date: formatDateTime(retryAt) })}</p>
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
          className={`${ui.buttonPrimary} self-start`}
        >
          {pending ? t("activation.requesting") : t("activation.request")}
        </button>
      )}
      {error !== null && (
        <p role="alert" className={ui.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

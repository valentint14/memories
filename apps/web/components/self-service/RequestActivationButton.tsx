"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestActivation } from "@/lib/actions/organizer";
import { formatDateTime, t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { CheckIcon } from "../ui/icons";
import { SheetActions } from "../ui/SheetActions";

/**
 * „Solicită activarea” (002: FR-018a): după trimitere arată data cererii; o nouă cerere după 24 h.
 * Stă în bara de acțiuni a foii, cu mesajele deasupra butonului.
 */
export function RequestActivationButton({ eventId, lastRequestAt }: { eventId: string; lastRequestAt: string | null }) {
  const router = useRouter();
  const [requestedAt, setRequestedAt] = useState(lastRequestAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nextAllowed = requestedAt === null ? null : new Date(new Date(requestedAt).getTime() + 24 * 3_600_000);
  // O nouă cerere e posibilă după 24 de ore (serverul verifică oricum).
  const retryAt = nextAllowed !== null && nextAllowed.getTime() > Date.now() ? nextAllowed : null;

  return (
    <SheetActions
      status={
        <>
          {requestedAt !== null && (
            <p role="status" className="flex items-start gap-2 text-success">
              <CheckIcon className="mt-1 size-4 shrink-0" />
              {t("activation.requested", { date: formatDateTime(requestedAt) })}
            </p>
          )}
          {retryAt !== null && <p className={ui.hint}>{t("activation.retryAt", { date: formatDateTime(retryAt) })}</p>}
          {error !== null && (
            <p role="alert" className={ui.fieldError}>
              {error}
            </p>
          )}
        </>
      }
    >
      {retryAt === null && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await requestActivation(eventId);
              if (result.ok) {
                setRequestedAt(result.data.requestedAt);
                // Banda de sus („Cerere de activare”) se citește din nou.
                router.refresh();
              } else setError(t(`errors.${result.error}`));
            });
          }}
          className={ui.buttonPrimary}
        >
          {pending ? t("activation.requesting") : t("activation.request")}
        </button>
      )}
    </SheetActions>
  );
}

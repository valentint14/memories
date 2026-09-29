"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmFromLinkForm, type FormState } from "@/lib/actions/self-service";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Butonul de confirmare: tokenul din link se verifică doar la apăsare (002: FR-007, SC-003). */
export function ConfirmButton({
  requestId,
  tokenHash,
  next,
}: {
  requestId: string;
  tokenHash: string;
  next: string | undefined;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmFromLinkForm, { status: "idle" });

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className={ui.alert}>
          {t("confirm.invalid")}
        </p>
        <Link href="/login" className={ui.link}>
          {t("confirm.newRequest")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="tokenHash" value={tokenHash} />
      {next !== undefined && <input type="hidden" name="next" value={next} />}
      <button type="submit" disabled={pending} className={ui.buttonPrimary}>
        {t("confirm.submit")}
      </button>
    </form>
  );
}

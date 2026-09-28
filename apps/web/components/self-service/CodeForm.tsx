"use client";

import { useActionState } from "react";
import { resendCodeForm, submitCodeForm, type FormState } from "@/lib/actions/self-service";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Introducerea codului din email pe dispozitivul pe care s-a pornit (002: FR-008). */
export function CodeForm({ requestId, next }: { requestId: string; next: string | undefined }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitCodeForm, { status: "idle" });
  const [, resend, resending] = useActionState<FormState, FormData>(resendCodeForm, { status: "idle" });

  return (
    <div className="flex flex-col gap-8">
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="requestId" value={requestId} />
        {next !== undefined && <input type="hidden" name="next" value={next} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className={ui.label}>
            {t("code.label")}
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            aria-describedby={state.status === "error" ? "code-error" : undefined}
            className={ui.codeInput}
          />
        </div>
        {state.status === "error" && (
          <p id="code-error" role="alert" className={ui.fieldError}>
            {t(`errors.${state.error}`)}
          </p>
        )}
        <button type="submit" disabled={pending} className={ui.buttonPrimary}>
          {pending ? t("code.submitting") : t("code.submit")}
        </button>
      </form>

      <form action={resend} className="flex flex-col gap-3 border-t border-rule pt-5">
        <input type="hidden" name="requestId" value={requestId} />
        {next !== undefined && <input type="hidden" name="next" value={next} />}
        <p className={ui.hint}>{t("code.noEmail")}</p>
        <button type="submit" disabled={resending} className={ui.buttonSecondary}>
          {t("code.resend")}
        </button>
      </form>
    </div>
  );
}

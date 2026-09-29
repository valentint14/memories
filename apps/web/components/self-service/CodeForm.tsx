"use client";

import { useActionState } from "react";
import { resendCodeForm, submitCodeForm, type FormState } from "@/lib/actions/self-service";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { SheetActions } from "../ui/SheetActions";
import { Sheet } from "../ui/Sheet";

/**
 * Introducerea codului din email pe dispozitivul pe care s-a pornit (002: FR-008), în două foi
 * egale: codul și retrimiterea. În fiecare, butonul stă jos, la dreapta.
 */
export function CodeForm({ requestId, next }: { requestId: string; next: string | undefined }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitCodeForm, { status: "idle" });
  const [, resend, resending] = useActionState<FormState, FormData>(resendCodeForm, { status: "idle" });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Sheet id="code-form-title" title={t("code.sheet.code")}>
        <form action={action} className={ui.sheetForm}>
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
              aria-describedby={state.status === "error" ? "code-error code-hint" : "code-hint"}
              className={ui.codeInput}
            />
            <p id="code-hint" className={ui.hint}>
              {t("code.otherDevice")}
            </p>
          </div>
          <SheetActions
            status={
              state.status === "error" && (
                <p id="code-error" role="alert" className={ui.fieldError}>
                  {t(`errors.${state.error}`)}
                </p>
              )
            }
          >
            <button type="submit" disabled={pending} className={ui.buttonPrimary}>
              {pending ? t("code.submitting") : t("code.submit")}
            </button>
          </SheetActions>
        </form>
      </Sheet>

      <Sheet id="code-resend-title" title={t("code.sheet.resend")}>
        <form action={resend} className={ui.sheetForm}>
          <input type="hidden" name="requestId" value={requestId} />
          {next !== undefined && <input type="hidden" name="next" value={next} />}
          <p className="leading-relaxed">{t("code.noEmail")}</p>
          <SheetActions>
            <button type="submit" disabled={resending} className={ui.buttonSecondary}>
              {t("code.resend")}
            </button>
          </SheetActions>
        </form>
      </Sheet>
    </div>
  );
}

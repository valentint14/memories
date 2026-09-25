"use client";

import { useActionState } from "react";
import { resendCodeForm, submitCodeForm, type FormState } from "@/lib/actions/self-service";
import { t } from "@/lib/i18n";

/** Introducerea codului din email pe dispozitivul pe care s-a pornit (002: FR-008). */
export function CodeForm({ requestId, next }: { requestId: string; next: string | undefined }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitCodeForm, { status: "idle" });
  const [, resend, resending] = useActionState<FormState, FormData>(resendCodeForm, { status: "idle" });

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="requestId" value={requestId} />
        {next !== undefined && <input type="hidden" name="next" value={next} />}
        <div className="flex flex-col gap-1">
          <label htmlFor="code" className="font-medium">
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
            className="min-h-11 rounded-lg border border-gray-400 px-3 font-mono text-lg tracking-widest"
          />
        </div>
        {state.status === "error" && (
          <p id="code-error" role="alert" className="text-sm text-danger">
            {t(`errors.${state.error}`)}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60"
        >
          {pending ? t("code.submitting") : t("code.submit")}
        </button>
      </form>

      <form action={resend} className="flex flex-col gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        {next !== undefined && <input type="hidden" name="next" value={next} />}
        <p className="text-sm text-muted">{t("code.noEmail")}</p>
        <button
          type="submit"
          disabled={resending}
          className="min-h-11 rounded-lg border border-brand-600 px-4 font-semibold text-brand-700 disabled:opacity-60"
        >
          {t("code.resend")}
        </button>
      </form>
    </div>
  );
}
